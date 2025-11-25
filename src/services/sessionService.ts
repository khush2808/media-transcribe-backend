import { Session, SessionStatus, SummaryStatus, TranscriptSegment } from "@prisma/client";
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

const toPrismaBigInt = (value?: number | null): bigint | undefined =>
  value == null ? undefined : BigInt(value);

const bigIntToString = (value?: bigint | null) =>
  value == null ? undefined : value.toString();

const serializeTranscriptSegment = (segment: TranscriptSegment) => ({
  ...segment,
  startedAtMs: bigIntToString(segment.startedAtMs),
  endedAtMs: bigIntToString(segment.endedAtMs),
});

type SessionWithSegments = Session & { segments: TranscriptSegment[] };

const serializeSession = (session: SessionWithSegments) => ({
  ...session,
  segments: session.segments.map(serializeTranscriptSegment),
});

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

  async listSessions(limit = 20) {
    const sessions = await prisma.session.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        segments: {
          orderBy: { chunkIndex: "asc" },
        },
      },
    });
    return sessions.map(serializeSession);
  }

  async getSession(sessionId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        segments: {
          orderBy: { chunkIndex: "asc" },
        },
      },
    });
    if (!session) {
      return null;
    }
    return serializeSession(session);
  }

  async appendSegment(input: AppendSegmentInput) {
    const segment = await prisma.transcriptSegment.create({
      data: {
        sessionId: input.sessionId,
        chunkIndex: input.chunkIndex,
        text: input.text,
        startedAtMs: toPrismaBigInt(input.startedAtMs),
        endedAtMs: toPrismaBigInt(input.endedAtMs),
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
      const { summary } = await this.gemini.summarizeSession({
        segments: session.segments,
      });
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
