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
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new AppError({
          message: "Unauthorized: Missing Admin Token",
          statusCode: 401,
        });
      }

      const token = authHeader.split(" ")[1];

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
      // 1. Auth Check
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new AppError({ message: "Unauthorized", statusCode: 401 });
      }
      const token = authHeader.split(" ")[1];

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
      try {
        const io = getIO();
        // Emit to the SPECIFIC ROOM for this client (using the slug we got back)
        if (newLog.client && newLog.client.slug) {
          io.to(newLog.client.slug).emit("retainer-update", {
            type: "ADD_LOG",
            log: newLog,
          });
        }
      } catch (err) {
        console.error("⚠️ Socket emit failed:", err);
      }

      return res.status(StatusCodes.CREATED).json({
        message: "Log added",
        data: newLog,
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
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new AppError({ message: "Unauthorized", statusCode: 401 });
      }
      const token = authHeader.split(" ")[1];
      const { logId } = req.params;

      const result = await this.clientService.deleteWorkLog(token, logId);

      // Notify client view to remove the log from the list
      try {
        const io = getIO();
        io.to(result.clientSlug).emit("retainer-update", {
          type: "DELETE_LOG",
          logId: logId,
        });
      } catch (err) {
        console.error("⚠️ Socket emit failed:", err);
      }

      return res.status(StatusCodes.OK).json({ message: "Log deleted" });
    } catch (error) {
      next(error);
    }
  }

  async updateDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization as string;
      const { name, refillLink, totalHours } = req.body;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new AppError({
          message: "Unauthorized: Missing Admin Token",
          statusCode: 401,
        });
      }

      const token = authHeader.split(" ")[1];

      const client = await this.clientService.updateDetails(token, {
        name,
        refillLink,
        totalHours,
      });

      try {
        const io = getIO();
        if (client.slug) {
          io.to(client.slug).emit("retainer-update", {
            type: "DETAILS_UPDATE",
            client: {
              name: client.name,
              totalHours: client.totalHours,
              refillLink: client.refillLink,
            },
          });
        }
      } catch (err) {
        console.error("⚠️ Socket emit failed in controller:", err);
        // We don't throw here because the DB update was successful,
        // we just failed to notify the live view.
      }

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
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new AppError({ message: "Unauthorized", statusCode: 401 });
      }
      const token = authHeader.split(" ")[1];

      const { status } = req.body;

      // Validate Enum
      if (!Object.values(ClientStatus).includes(status)) {
        throw new AppError({ message: "Invalid status", statusCode: 400 });
      }

      const updatedClient = await this.clientService.updateStatus(
        token,
        status,
      );

      // Notify users (e.g. show "Paused" badge)
      try {
        const io = getIO();
        io.to(updatedClient.slug).emit("retainer-update", {
          type: "STATUS_UPDATE",
          status: updatedClient.status,
        });
      } catch (err) {
        console.error("⚠️ Socket emit failed:", err);
      }

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

      const token = authHeader.split(" ")[1];

      // 1. Delete from DB
      const deletedClient = await this.clientService.deleteClient(token);

      // 2. Emit "PROJECT_DELETED" Event
      try {
        const io = getIO();
        if (deletedClient.slug) {
          console.log(
            `🗑️ Emitting deletion event to room: ${deletedClient.slug}`,
          );

          io.to(deletedClient.slug).emit("retainer-update", {
            type: "PROJECT_DELETED",
          });

          // Optional: Forcefully disconnect users from this room after a delay
          // io.in(deletedClient.slug).disconnectSockets();
        }
      } catch (err) {
        console.error("⚠️ Socket emit failed during deletion:", err);
      }

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
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new AppError({
          message: "Unauthorized: Missing Admin Token",
          statusCode: 401,
        });
      }

      const token = authHeader.split(" ")[1];

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
