import { config } from "dotenv";
import { z } from "zod";

config({ path: process.env.ENV_PATH });

const envSchema = z.object({
  PORT: z
    .string()
    .optional()
    .transform((val) => Number(val ?? "4000")),
  DATABASE_URL: z.string(),
  GEMINI_API_KEY: z.string().optional(),
  ASSEMBLYAI_API_KEY: z.string().optional(),
  CLIENT_ORIGIN: z.string().default("http://localhost:3001"),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);


