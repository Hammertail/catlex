//* Local imports

/**
 * JSX attributes that typically hold user-visible copy.
 */
export const USER_FACING_ATTRS = new Set([
  "placeholder",
  "alt",
  "title",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
]);

const PUNCTUATION_ONLY = /^[\p{P}\p{S}\s]+$/u;
const DIGITS_ONLY = /^[\d\s]+$/u;
/** Emoji / pictographs / variation selectors / ZWJ sequences, optional whitespace */
const EMOJI_ONLY = /^(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}\s]|\uFE0F|\u200D)+$/u;

/**
 * Returns true when `text` looks like user-visible copy that should be translated.
 */
export function isLikelyUserVisible(text: string): boolean {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return false;
  }

  if (DIGITS_ONLY.test(trimmed)) {
    return false;
  }

  if (PUNCTUATION_ONLY.test(trimmed)) {
    return false;
  }

  if (EMOJI_ONLY.test(trimmed)) {
    return false;
  }

  return true;
}

export function isUserFacingAttribute(name: string): boolean {
  return USER_FACING_ATTRS.has(name);
}
