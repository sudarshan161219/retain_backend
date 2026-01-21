import type { Request, Response, NextFunction } from "express";
import { injectable, inject } from "inversify";
import { TYPES } from "../types/types.js";
import { ClientService } from "../services/client.service.js"; // Updated Import
import { StatusCodes } from "http-status-codes";
import { AppError } from "../errors/AppError.js";
import { getIO } from "../socket/index.js";
import { ClientStatus } from "@prisma/client";

@injectable()
export class ClientController {
  constructor(
    @inject(TYPES.ClientService)
    private clientService: ClientService,
  ) {}
  /**
   * Helper: safely extracts Bearer token
   */
  private extractToken(req: Request): string {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError({
        message: "Unauthorized: Missing Admin Token",
        statusCode: 401,
      });
    }
    return authHeader.split(" ")[1];
  }
  /**
   * Helper: handles socket emission without crashing the request
   */
  private emitUpdate(slug: string | undefined, type: string, payload: any) {
    if (!slug) return;
    try {
      const io = getIO();

      io.to(slug).emit("retainer-update", { type, data: payload });
    } catch (err) {
      console.error(`⚠️ Socket emit failed for ${slug}:`, err);
    }
  }
  /**
   * CREATE RETAINER (Landing Page)
   * POST /api/clients
   * Body: { name, totalHours, refillLink? }
   */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, totalHours, refillLink } = req.body;

      if (!name || typeof name !== "string") {
        throw new AppError({
          message: "Client name is required",
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      if (!totalHours || isNaN(Number(totalHours))) {
        throw new AppError({
          message: "Total hours is required and must be a number",
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      const client = await this.clientService.createClient(
        name,
        Number(totalHours),
        refillLink,
      );

      // CRITICAL: This is the ONLY time the adminToken is sent in the body
      // The frontend must display this to the user immediately.
      res.status(StatusCodes.CREATED).json({
        message: "Retainer created successfully",
        data: {
          adminToken: client.adminToken, // THE KEY
          slug: client.slug,
          adminUrl: `/manage/${client.adminToken}`,
          publicUrl: `/${client.slug}`,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADMIN DASHBOARD (View Details)
   * GET /api/clients/admin
   * Headers: Authorization: Bearer <adminToken>
   */
  async getAdminOne(req: Request, res: Response, next: NextFunction) {
    try {
      const token = this.extractToken(req);

      const adminView = await this.clientService.getClientByAdminToken(token);

      return res.status(StatusCodes.OK).json({
        role: "ADMIN",
        data: adminView,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUBLIC DASHBOARD (Client View)
   * GET /api/clients/:slug
   */
  async getPublicOne(req: Request, res: Response, next: NextFunction) {
    try {
      const { slug } = req.params;

      if (!slug) {
        throw new AppError({
          message: "Slug is required",
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      // We don't need IP/UserAgent logging for this lightweight view
      const publicView = await this.clientService.getClientBySlug(slug);

      return res.status(StatusCodes.OK).json({
        role: "CLIENT",
        data: publicView,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ADD WORK LOG (The Main Action)
   * POST /api/logs
   * Headers: Authorization: Bearer <adminToken>
   * Body: { description, hours, date }
   */
  async addLog(req: Request, res: Response, next: NextFunction) {
    try {
      const token = this.extractToken(req);

      // 2. Body Validation
      const { description, hours, date } = req.body;
      if (!description || !hours) {
        throw new AppError({
          message: "Description and Hours are required",
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      // 3. Service Call
      const newLog = await this.clientService.addWorkLog(
        token,
        description,
        Number(hours),
        date ? new Date(date) : new Date(),
      );

      // 4. Real-time Update
      this.emitUpdate(newLog.client?.slug, "ADD_LOG", newLog);

      return res.status(StatusCodes.CREATED).json({
        message: "Log added",
        data: newLog,
      });
    } catch (error) {
      next(error);
    }
  }

  async addRefillLog(req: Request, res: Response, next: NextFunction) {
    try {
      // 1. Extract Token
      const token = this.extractToken(req);

      // 2. Validate Body
      const { hours, createLog } = req.body;

      if (!hours || isNaN(Number(hours))) {
        throw new AppError({
          message: "Valid hours amount is required",
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      // 3. Service Call (Returns updated client + optional log)
      const { client, log } = await this.clientService.refillClient(
        token,
        Number(hours),
        !!createLog, // Force boolean
      );

      // 4. Real-time Update
      // We send both the new total and the log (if it exists)
      this.emitUpdate(client.slug, "REFILL", {
        totalHours: client.totalHours,
        log: log,
      });

      // 5. Response
      return res.status(StatusCodes.OK).json({
        message: "Balance refilled successfully",
        data: {
          totalHours: client.totalHours,
          log,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE LOG (Fix Mistakes)
   * DELETE /api/logs/:logId
   * Headers: Authorization: Bearer <adminToken>
   */
  async deleteLog(req: Request, res: Response, next: NextFunction) {
    try {
      const token = this.extractToken(req);
      const { logId } = req.params;

      const result = await this.clientService.deleteWorkLog(token, logId);

      //  Real-time Update
      this.emitUpdate(result.clientSlug, "DELETE_LOG", logId);

      return res.status(StatusCodes.OK).json({ message: "Log deleted" });
    } catch (error) {
      next(error);
    }
  }

  async updateDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, refillLink, totalHours } = req.body;

      const token = this.extractToken(req);

      const client = await this.clientService.updateDetails(token, {
        name,
        refillLink,
        totalHours,
      });

      //  Real-time Update
      this.emitUpdate(client.slug, "DETAILS_UPDATE", client);

      res.status(200).json({
        success: true,
        data: client,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * UPDATE STATUS (Pause/Resume)
   * PATCH /api/clients/status
   * Headers: Authorization: Bearer <adminToken>
   * Body: { status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' }
   */
  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const token = this.extractToken(req);

      const { status } = req.body;

      // Validate Enum
      if (!Object.values(ClientStatus).includes(status)) {
        throw new AppError({ message: "Invalid status", statusCode: 400 });
      }

      const updatedClient = await this.clientService.updateStatus(
        token,
        status,
      );

      //  Real-time Update -- Notify users (e.g. show "Paused" badge)
      this.emitUpdate(updatedClient.slug, "STATUS_UPDATE", { status });

      res.status(200).json({ data: updatedClient });
    } catch (error) {
      next(error);
    }
  }

  async deleteClient(req: Request, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization as string;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new AppError({
          message: "Unauthorized: Missing Admin Token",
          statusCode: 401,
        });
      }

      const token = this.extractToken(req);

      // 1. Delete from DB
      const deletedClient = await this.clientService.deleteClient(token);

      // 2. Emit "PROJECT_DELETED" Event
      this.emitUpdate(deletedClient.slug, "PROJECT_DELETED", deletedClient);

      res.status(200).json({
        success: true,
        message: "Project deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async exportClientLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const token = this.extractToken(req);

      const { workbook, fileName } =
        await this.clientService.generateExcelReport(token);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

      // Stream directly to response
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error(error);
      res.status(404).json({ message: "Could not generate report" });
    }
  }
}
