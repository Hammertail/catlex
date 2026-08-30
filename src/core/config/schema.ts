//* Libraries imports
import { z } from "zod";

const openaiConfigSchema = z.object({
  baseUrl: z.string().min(1).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const translateConfigSchema = z.object({
  concurrency: z.number().int().min(1).max(32).optional(),
});

export const catlexConfigSchema = z.object({
  messagesDir: z.string().min(1).default("messages"),
  baseLocale: z.string().min(1).default("en"),
  strictExtra: z.boolean().default(false),
  openai: openaiConfigSchema.optional(),
  translate: translateConfigSchema.optional(),
});

export type CatlexConfig = z.infer<typeof catlexConfigSchema>;

export type CatlexConfigInput = z.input<typeof catlexConfigSchema>;

export type ConfigFlags = {
  messagesDir?: string;
  baseLocale?: string;
  strictExtra?: boolean;
  /**
   * When true, skip loading and executing project `catlex.config.*` files.
   * Prefer this in CI so repository-controlled JavaScript is not run automatically.
   */
  noConfig?: boolean;
};
