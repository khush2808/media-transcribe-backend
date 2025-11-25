import { GoogleGenerativeAI } from "@google/generative-ai";
import { TranscriptSegment } from "@prisma/client";
import { logger } from "../lib/logger";
import { env } from "../config/env";

type SummarizeSessionInput = {
  segments: Array<Pick<TranscriptSegment, "text" | "chunkIndex" | "startedAtMs">>;
};

type SummarizeSessionResult = {
  summary: string;
};

const formatTime = (ms: number | bigint): string => {
  const numericMs = typeof ms === "bigint" ? Number(ms) : ms;
  const seconds = Math.floor(numericMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const secs = seconds % 60;
  const mins = minutes % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const truncateTranscript = (transcript: string, maxLength: number = 500000): string => {
  if (transcript.length <= maxLength) {
    return transcript;
  }

  logger.warn(`Transcript exceeds ${maxLength} chars, truncating for summarization`);

  // Keep the first 40% and last 60% to preserve context
  const startLength = Math.floor(maxLength * 0.4);
  const endLength = Math.floor(maxLength * 0.6);

  const start = transcript.substring(0, startLength);
  const end = transcript.substring(transcript.length - endLength);

  return `${start}\n\n[... TRANSCRIPT TRUNCATED - ${Math.round((transcript.length - maxLength) / 1000)}KB REMOVED ...]\n\n${end}`;
};

export class GeminiService {
  private client: GoogleGenerativeAI | null;

  constructor(private readonly apiKey = env.GEMINI_API_KEY) {
    this.client = apiKey ? new GoogleGenerativeAI(apiKey) : null;
    if (!apiKey) {
      logger.warn("GEMINI_API_KEY missing – falling back to mock summaries");
    }
  }

  async summarizeSession(input: SummarizeSessionInput): Promise<SummarizeSessionResult> {
    if (!input.segments.length) {
      return {
        summary: "No transcript was captured for this session.",
      };
    }

    // Format transcript with timestamps
    const transcript = input.segments
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((segment) => {
        const startTime = segment.startedAtMs;
        const timePrefix =
          startTime != null ? `[${formatTime(startTime)}] ` : "";
        return `${timePrefix}${segment.text}`;
      })
      .join("\n\n");

    // Truncate if too long
    const truncatedTranscript = truncateTranscript(transcript);

    if (!this.client) {
      return {
        summary: [
          "## Mock Summary",
          `Chunks processed: ${input.segments.length}`,
          "Replace GEMINI_API_KEY to receive AI-generated summaries.",
        ].join("\n"),
      };
    }

    try {
      const model = this.client.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `You are an expert meeting summarizer. Analyze the following meeting transcript and create a comprehensive, well-structured summary.

Please provide the summary in the following format:

## Overview
[2-3 sentence summary of the main purpose and outcome of the meeting]

## Key Topics Discussed
- [Topic 1]
- [Topic 2]
- [Topic 3]
(Add more as needed)

## Key Decisions Made
- [Decision 1 with context]
- [Decision 2 with context]
(Add more as needed)

## Action Items
- [ ] [Action Item 1] - Owner: [Name if mentioned] - Due: [Date if mentioned]
- [ ] [Action Item 2] - Owner: [Name if mentioned] - Due: [Date if mentioned]
(Add more as needed)

## Next Steps
[Brief description of what happens next]

## Attendees/Participants
[List of people mentioned, if identifiable]

Meeting Transcript:
---
${truncatedTranscript}
---

Focus on accuracy, clarity, and actionability. Extract specific details and decisions mentioned during the meeting.`;

      const response = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      });

      const summary = response.response.text() ?? "";
      return { summary };
    } catch (error) {
      logger.error("Gemini summarization failed", error);
      throw error;
    }
  }
}
