//* Libraries imports
import { z } from "zod";

export const submitMarkdownTranslationSchema = z.object({
  markdown: z.string(),
});

export type SubmitMarkdownTranslationInput = z.infer<typeof submitMarkdownTranslationSchema>;
