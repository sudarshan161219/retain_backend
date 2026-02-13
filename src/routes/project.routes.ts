import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { injectable, inject } from "inversify";
import {
  body,
  param,
  query,
  header,
  validationResult,
} from "express-validator";
import { TYPES } from "../types/types.js";
import { ClientStatus } from "@prisma/client";
import { ClientController } from "../controllers/client.controller.js";

@injectable()
export class ClientRouter {
  public router: Router;

  constructor(
    @inject(TYPES.ClientController)
    private clientController: ClientController,
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  // Helper middleware to handle validation errors uniformly
  private validate = (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return; // Stop execution
    }
    next();
  };

  private initializeRoutes() {
    // ==========================================
    // CLIENT ROUTES
    // ==========================================

    /**
     * 1. CREATE RETAINER
     * POST /api/clients
     */
    this.router.post(
      "/clients",
      [
        body("name").trim().notEmpty().withMessage("Client name is required"),
        body("totalHours")
          .isFloat({ min: 0.1 })
          .withMessage("Total hours must be a positive number"),
        body("refillLink")
          .optional()
          .isURL()
          .withMessage("Must be a valid URL"),
      ],
      this.validate,
      (req: Request, res: Response, next: NextFunction) =>
        this.clientController.create(req, res, next),
    );

    /**
     * 2. ADMIN DASHBOARD (Private)
     * GET /api/clients/admin
     * Requires Header: Authorization: Bearer <adminToken>
     */
    this.router.get(
      "/clients/admin",
      [
        header("authorization")
          .exists()
          .withMessage("Authorization header required")
          .contains("Bearer ")
          .withMessage("Format must be 'Bearer <token>'"),
      ],
      this.validate,
      (req: Request, res: Response, next: NextFunction) =>
        this.clientController.getAdminOne(req, res, next),
    );

    /**
     * 3. UPDATE STATUS (Pause/Resume)
     * PATCH /api/clients/status
     */
    this.router.patch(
      "/clients/status",
      [
        header("authorization").exists(),
        body("status")
          .isIn(Object.values(ClientStatus))
          .withMessage(
            `Status must be one of: ${Object.values(ClientStatus).join(", ")}`,
          ),
      ],
      this.validate,
      (req: Request, res: Response, next: NextFunction) =>
        this.clientController.updateStatus(req, res, next),
    );

    this.router.patch(
      "/clients/details",
      [
        header("authorization").exists().withMessage("Admin token is required"),

        // Name is optional but if present must be a non-empty string
        body("name")
          .optional()
          .isString()
          .trim()
          .isLength({ min: 1 })
          .withMessage("Name cannot be empty"),

        // Refill link is optional.
        // nullable: true allows sending null to clear it.
        // checkFalsy: true allows sending "" to clear it.
        body("refillLink")
          .optional({ nullable: true, checkFalsy: true })
          .isURL()
          .withMessage(
            "Refill link must be a valid URL (e.g. https://stripe.com/...)",
          ),

        body("totalHours")
          .optional()
          .isNumeric()
          .custom((val) => Number(val) > 0)
          .withMessage("Total hours must be a positive number"),
      ],
      this.validate,
      (req: Request, res: Response, next: NextFunction) =>
        this.clientController.updateDetails(req, res, next),
    );

    this.router.post(
      "/clients/refill",
      (req: Request, res: Response, next: NextFunction) =>
        this.clientController.addRefillLog(req, res, next),
    );

    /**
     * 4. PUBLIC VIEW (Client Read-Only)
     * GET /api/clients/:slug
     * Note: Put this AFTER specific paths like /clients/admin or /clients/status
     * if the paths overlapped (they don't here, but good practice).
     */
    this.router.get(
      "/clients/:slug",
      [param("slug").trim().notEmpty().withMessage("Slug is required")],
      this.validate,
      (req: Request, res: Response, next: NextFunction) =>
        this.clientController.getPublicOne(req, res, next),
    );

    // ==========================================
    // WORK LOG ROUTES
    // ==========================================

    /**
     * 5. ADD LOG
     * POST /api/logs
     */
    this.router.post(
      "/logs",
      [
        header("authorization").exists(),
        body("description")
          .trim()
          .notEmpty()
          .withMessage("Description is required"),
        body("hours")
          .isFloat({ min: 0.1 })
          .withMessage("Hours must be a number > 0"),
        body("date").optional().isISO8601().withMessage("Invalid date format"),
      ],
      this.validate,
      (req: Request, res: Response, next: NextFunction) =>
        this.clientController.addLog(req, res, next),
    );

    /**
     * 6. DELETE LOG (Undo)
     * DELETE /api/logs/:logId
     */
    this.router.delete(
      "/logs/:logId",
      [
        header("authorization").exists(),
        param("logId").isUUID().withMessage("Invalid Log ID"),
      ],
      this.validate,
      (req: Request, res: Response, next: NextFunction) =>
        this.clientController.deleteLog(req, res, next),
    );

    this.router.delete(
      "/clients/details",
      [header("authorization").exists().withMessage("Admin token is required")],
      this.validate,
      (req: Request, res: Response, next: NextFunction) =>
        this.clientController.deleteClient(req, res, next),
    );

    /// export route
    this.router.get(
      "/export",
      [header("authorization").exists().withMessage("Admin token is required")],
      this.validate,
      (req: Request, res: Response, next: NextFunction) =>
        this.clientController.exportClientLogs(req, res, next),
    );
  }
}
