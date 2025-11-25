import { SessionStatus, SummaryStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { GeminiService } from "./geminiService";
import { logger } from "../lib/logger";

type CreateSessionInput = {
  title: string;
  mode: string;
};

type AppendSegmentInput = {
  sessionId: string;
  chunkIndex: number;
  text: string;
  startedAtMs?: number;
  endedAtMs?: number;
};

export class SessionService {
  constructor(private readonly gemini = new GeminiService()) {}

  createSession(input: CreateSessionInput) {
    return prisma.session.create({
      data: {
        title: input.title,
        mode: input.mode,
      },
    });
  }

  listSessions(limit = 20) {
    return prisma.session.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        segments: {
          orderBy: { chunkIndex: "asc" },
        },
      },
    });
  }

  getSession(sessionId: string) {
    return prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        segments: {
          orderBy: { chunkIndex: "asc" },
        },
      },
    });
  }

  async appendSegment(input: AppendSegmentInput) {
    const segment = await prisma.transcriptSegment.create({
      data: {
        sessionId: input.sessionId,
        chunkIndex: input.chunkIndex,
        text: input.text,
        startedAtMs: input.startedAtMs,
        endedAtMs: input.endedAtMs,
      },
    });

    await prisma.session.update({
      where: { id: input.sessionId },
      data: {
        updatedAt: new Date(),
      },
    });

    return segment;
  }

  async updateStatus(sessionId: string, status: SessionStatus) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status },
    });
  }

  async markSummaryStatus(
    sessionId: string,
    summaryStatus: SummaryStatus,
    summary?: string
  ) {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        summaryStatus,
        summary,
        status: summaryStatus === "READY" ? SessionStatus.COMPLETED : undefined,
      },
    });
  }

  async runSummary(sessionId: string) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    await this.markSummaryStatus(sessionId, "RUNNING");
    try {
      const summary = await this.gemini.summarizeSession(session.segments);
      await this.markSummaryStatus(sessionId, "READY", summary);
      return summary;
    } catch (error) {
      logger.error("Summary generation failed", error);
      await this.markSummaryStatus(sessionId, "FAILED");
      throw error;
    }
  }

  async getRecentTranscriptText(sessionId: string, limit = 5) {
    const segments = await prisma.transcriptSegment.findMany({
      where: { sessionId },
      orderBy: { chunkIndex: "desc" },
      take: limit,
    });
    return segments
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((segment) => segment.text)
      .join("\n");
  }
}
