import axios from "axios";
import { logger } from "../lib/logger";
import { env } from "../config/env";

type TranscriptionInput = {
  mimeType: string;
  audioBase64: string;
};

type TranscriptionResult = {
  text: string;
};

export class AssemblyAIService {
  private apiKey: string | null;
  private baseUrl = "https://api.assemblyai.com/v2";

  constructor(apiKey = env.ASSEMBLYAI_API_KEY) {
    this.apiKey = apiKey || null;
    if (!apiKey) {
      logger.warn("ASSEMBLYAI_API_KEY missing – falling back to mock transcription");
    }
  }

  async transcribeChunk(input: TranscriptionInput): Promise<TranscriptionResult> {
    if (!this.apiKey) {
      return {
        text: `[mock-transcript] ${new Date().toLocaleTimeString()} chunk (${input.mimeType})`,
      };
    }

    try {
      // Convert base64 to Buffer
      const audioBuffer = Buffer.from(input.audioBase64, "base64");

      // Upload audio to AssemblyAI
      const uploadResponse = await axios.post(`${this.baseUrl}/upload`, audioBuffer, {
        headers: {
          Authorization: this.apiKey,
          "Content-Type": "application/octet-stream",
        },
      });

      const uploadUrl = uploadResponse.data.upload_url;

      // Submit transcription request
      const transcriptResponse = await axios.post(
        `${this.baseUrl}/transcript`,
        {
          audio_url: uploadUrl,
          language_code: "en",
        },
        {
          headers: {
            Authorization: this.apiKey,
          },
        }
      );

      const transcriptId = transcriptResponse.data.id;

      // Poll for completion
      let transcript = await this.pollTranscription(transcriptId);

      // Keep polling until complete
      while (transcript.status === "queued" || transcript.status === "processing") {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
        transcript = await this.pollTranscription(transcriptId);
      }

      if (transcript.status === "error") {
        throw new Error(`Transcription failed: ${transcript.error}`);
      }

      return {
        text: transcript.text || "",
      };
    } catch (error) {
      logger.error("AssemblyAI transcription failed", error);
      throw error;
    }
  }

  private async pollTranscription(transcriptId: string) {
    const response = await axios.get(`${this.baseUrl}/transcript/${transcriptId}`, {
      headers: {
        Authorization: this.apiKey,
      },
    });
    return response.data;
  }
}

