import { env } from "@repo/config/env";
import { logger } from "@repo/utils/logger";
import { app } from "./app.js";

const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
  logger.info({ port, env: env.NODE_ENV }, "Admin API listening");
});
