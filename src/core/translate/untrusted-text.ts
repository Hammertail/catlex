const SOURCE_TEXT_CLOSE = "</source_text>";

/**
 * Escapes delimiter sequences so message values cannot break out of
 * `<source_text>` framing in model prompts.
 */
export function escapeUntrustedText(value: string): string {
  return value.replaceAll(SOURCE_TEXT_CLOSE, `\\${SOURCE_TEXT_CLOSE}`);
}

/**
 * Wraps a locale message value as delimited untrusted data for prompts.
 */
export function wrapUntrustedText(value: string): string {
  return `<source_text>\n${escapeUntrustedText(value)}\n</source_text>`;
}
