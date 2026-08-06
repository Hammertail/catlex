//* Libraries imports
import { z } from "zod";

export const catlexConfigSchema = z.object({
  messagesDir: z.string().min(1).default("messages"),
  baseLocale: z.string().min(1).default("en"),
  strictExtra: z.boolean().default(false),
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
