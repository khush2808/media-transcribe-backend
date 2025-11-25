import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import sessionsRouter from "./routes/sessionRoutes";
import { env } from "./config/env";
import { registerRecordingGateway } from "./socket/recordingGateway";
import { logger } from "./lib/logger";

const app = express();
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json({ limit: "25mb" }));

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Media Transcribe backend is running" });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/sessions", sessionsRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Unexpected error";
  logger.error("Request failed", message);
  res.status(500).json({ message });
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: env.CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  },
});

registerRecordingGateway(io);

server.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT}`);
});
