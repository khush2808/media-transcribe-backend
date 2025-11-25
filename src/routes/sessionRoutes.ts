import { Router } from "express";
import { z } from "zod";
import { SessionService } from "../services/sessionService";

const router = Router();
const sessionService = new SessionService();

const createSessionSchema = z.object({
  title: z.string().min(3),
  mode: z.enum(["tab", "mic"]),
});

router.post("/", async (req, res, next) => {
  try {
    const input = createSessionSchema.parse(req.body);
    const session = await sessionService.createSession(input);
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

router.get("/", async (_req, res, next) => {
  try {
    const sessions = await sessionService.listSessions();
    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

router.get("/:sessionId", async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await sessionService.getSession(sessionId);
    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }
    res.json(session);
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/summary", async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const summary = await sessionService.runSummary(sessionId);
    res.json({ sessionId, summary });
  } catch (error) {
    next(error);
  }
});

export default router;


