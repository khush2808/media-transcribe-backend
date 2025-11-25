import { Server, Socket } from "socket.io";
import { z } from "zod";
import { SessionService } from "../services/sessionService";
import { GeminiService } from "../services/geminiService";
import { logger } from "../lib/logger";

const sessionService = new SessionService();
const geminiService = new GeminiService();

const initSchema = z.object({
  title: z.string().min(3),
  mode: z.enum(["tab", "mic"]),
});

const chunkSchema = z.object({
  sessionId: z.string().cuid(),
  chunkIndex: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  durationMs: z.number().int().optional(),
  startedAtMs: z.number().int().optional(),
  endedAtMs: z.number().int().optional(),
  audioBase64: z.string().min(1),
});

const sessionIdSchema = z.object({
  sessionId: z.string().cuid(),
});

const emitError = (socket: Socket, error: unknown, sessionId?: string) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  socket.emit("session:error", { error: message, sessionId });
  logger.error("Socket error", { message, sessionId });
};

const handleSummary = async (sessionId: string, io: Server) => {
  try {
    const summary = await sessionService.runSummary(sessionId);
    io.to(sessionId).emit("summary:ready", { sessionId, summary });
  } catch (error) {
    io.to(sessionId).emit("summary:failed", {
      sessionId,
      error: error instanceof Error ? error.message : "Unable to build summary",
    });
  }
};

export const registerRecordingGateway = (io: Server) => {
  io.on("connection", (socket) => {
    logger.info("Socket connected", { socketId: socket.id });

    socket.on("session:init", async (payload) => {
      try {
        const input = initSchema.parse(payload);
        const session = await sessionService.createSession(input);
        socket.join(session.id);
        socket.emit("session:created", { sessionId: session.id });
        io.to(session.id).emit("session:status", { sessionId: session.id, status: session.status });
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on("audio:chunk", async (payload) => {
      try {
        const chunk = chunkSchema.parse(payload);
        const history = await sessionService.getRecentTranscriptText(chunk.sessionId);
        const transcription = await geminiService.transcribeChunk({
          mimeType: chunk.mimeType,
          audioBase64: chunk.audioBase64,
          history,
        });

        await sessionService.appendSegment({
          sessionId: chunk.sessionId,
          chunkIndex: chunk.chunkIndex,
          text: transcription.text,
          startedAtMs: chunk.startedAtMs,
          endedAtMs: chunk.endedAtMs,
        });

        io.to(chunk.sessionId).emit("transcript:update", {
          sessionId: chunk.sessionId,
          chunkIndex: chunk.chunkIndex,
          text: transcription.text,
          startedAtMs: chunk.startedAtMs,
          endedAtMs: chunk.endedAtMs,
        });
      } catch (error) {
        emitError(socket, error, payload?.sessionId);
      }
    });

    socket.on("session:pause", async (payload) => {
      try {
        const { sessionId } = sessionIdSchema.parse(payload);
        await sessionService.updateStatus(sessionId, "PAUSED");
        io.to(sessionId).emit("session:status", { sessionId, status: "PAUSED" });
      } catch (error) {
        emitError(socket, error, payload?.sessionId);
      }
    });

    socket.on("session:resume", async (payload) => {
      try {
        const { sessionId } = sessionIdSchema.parse(payload);
        await sessionService.updateStatus(sessionId, "RECORDING");
        io.to(sessionId).emit("session:status", { sessionId, status: "RECORDING" });
      } catch (error) {
        emitError(socket, error, payload?.sessionId);
      }
    });

    socket.on("session:stop", async (payload) => {
      try {
        const { sessionId } = sessionIdSchema.parse(payload);
        await sessionService.updateStatus(sessionId, "PROCESSING");
        io.to(sessionId).emit("session:status", { sessionId, status: "PROCESSING" });
        handleSummary(sessionId, io);
      } catch (error) {
        emitError(socket, error, payload?.sessionId);
      }
    });

    socket.on("disconnect", () => {
      logger.info("Socket disconnected", { socketId: socket.id });
    });
  });
};


