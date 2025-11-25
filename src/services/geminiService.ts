import { GoogleGenerativeAI } from "@google/generative-ai";
import { TranscriptSegment } from "@prisma/client";
import { logger } from "../lib/logger";
import { env } from "../config/env";

type ChunkTranscriptionInput = {
  mimeType: string;
  audioBase64: string;
  history: string;
};

type ChunkTranscriptionResult = {
  text: string;
};

export class GeminiService {
  private client: GoogleGenerativeAI | null;

  constructor(private readonly apiKey = env.GEMINI_API_KEY) {
    this.client = apiKey ? new GoogleGenerativeAI(apiKey) : null;
    if (!apiKey) {
      logger.warn("GEMINI_API_KEY missing – falling back to mock transcription");
    }
  }

  async transcribeChunk(input: ChunkTranscriptionInput): Promise<ChunkTranscriptionResult> {
    if (!this.client) {
      return {
        text: `[mock-transcript] ${new Date().toLocaleTimeString()} chunk (${input.mimeType})`,
      };
    }

    try {
      const model = this.client.getGenerativeModel({ model: "gemini-1.5-flash" });
      const response = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  "You are a speech-to-text engine that returns diarized meeting notes.",
                  "Return only the literal transcript for the provided audio chunk.",
                  "Previous transcript context:",
                  input.history || "None",
                ].join("\n"),
              },
              {
                inlineData: {
                  mimeType: input.mimeType,
                  data: input.audioBase64,
                },
              },
            ],
          },
        ],
      });

      const text = response.response.text() ?? "";
      return { text };
    } catch (error) {
      logger.error("Gemini transcription failed", error);
      throw error;
    }
  }

  async summarizeSession(segments: Pick<TranscriptSegment, "text" | "chunkIndex">[]): Promise<string> {
    if (!segments.length) {
      return "No transcript was captured for this session.";
    }
    const transcript = segments
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((segment) => `${segment.chunkIndex + 1}. ${segment.text}`)
      .join("\n");

    if (!this.client) {
      return [
        "## Mock Summary",
        `Chunks processed: ${segments.length}`,
        "Replace GEMINI_API_KEY to receive AI-generated summaries.",
      ].join("\n");
    }

    const model = this.client.getGenerativeModel({ model: "gemini-1.5-flash" });
    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "You are an assistant that writes structured meeting recaps.",
                "Summarize the transcript into:",
                "1. Overview",
                "2. Key decisions",
                "3. Action items (owner + due date if possible)",
                "",
                transcript,
              ].join("\n"),
            },
          ],
        },
      ],
    });

    return response.response.text() ?? "";
  }
}


