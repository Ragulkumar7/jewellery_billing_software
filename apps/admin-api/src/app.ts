import compression from "compression";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { routes } from "./routes/index.js";

export const app: Express = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ verify: (req, _res, buffer) => { (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));

app.use(routes);

app.use(notFoundHandler);
app.use(errorHandler);
