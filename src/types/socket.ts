export type SessionMode = "tab" | "mic";

export type SessionStatus =
  | "RECORDING"
  | "PAUSED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type RecordingSocketEvents = {
  "session:init": (payload: { title: string; mode: SessionMode }) => void;
  "session:pause": (payload: { sessionId: string }) => void;
  "session:resume": (payload: { sessionId: string }) => void;
  "session:stop": (payload: { sessionId: string }) => void;
  "audio:chunk": (payload: AudioChunkPayload) => void;
};

export type ServerToClientEvents = {
  "session:created": (payload: { sessionId: string }) => void;
  "session:status": (payload: { sessionId: string; status: SessionStatus }) => void;
  "transcript:update": (payload: TranscriptSegmentPayload) => void;
  "summary:ready": (payload: { sessionId: string; summary: string }) => void;
  "summary:failed": (payload: { sessionId: string; error: string }) => void;
  "session:error": (payload: { sessionId?: string; error: string }) => void;
};

export type AudioChunkPayload = {
  sessionId: string;
  chunkIndex: number;
  mimeType: string;
  durationMs?: number;
  startedAtMs?: number;
  endedAtMs?: number;
  audioBase64: string;
};

export type TranscriptSegmentPayload = {
  sessionId: string;
  chunkIndex: number;
  text: string;
  startedAtMs?: number;
  endedAtMs?: number;
};




