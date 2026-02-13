import { Container } from "inversify";
import { ClientService } from "../services/client.service.js";
import { ClientController } from "../controllers/client.controller.js";
import { ClientRouter } from "../routes/project.routes.js";
import { TYPES } from "../types/types.js";

export const container: Container = new Container();
container
  .bind<ClientService>(TYPES.ClientService)
  .to(ClientService)
  .inTransientScope();

container.bind<ClientController>(TYPES.ClientController).to(ClientController);

container.bind<ClientRouter>(TYPES.ClientRouter).to(ClientRouter);
