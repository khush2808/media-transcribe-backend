/* eslint-disable no-console */
type LogLevel = "info" | "warn" | "error" | "debug";

const format = (level: LogLevel, message: string, meta?: unknown) => {
  const base = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  if (!meta) return base;
  return `${base} ${JSON.stringify(meta)}`;
};

export const logger = {
  info: (message: string, meta?: unknown) => console.log(format("info", message, meta)),
  warn: (message: string, meta?: unknown) => console.warn(format("warn", message, meta)),
  error: (message: string, meta?: unknown) => console.error(format("error", message, meta)),
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug(format("debug", message, meta));
    }
  },
};


