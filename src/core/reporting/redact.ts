const REDACTED = "<redacted>";

/** Catlex flags that take free-form or credential-bearing values. */
const SENSITIVE_FLAGS: ReadonlySet<string> = new Set(["--guidance", "--base-url"]);

const SENSITIVE_FLAG_PATTERN = /key|token|secret|password/i;

const URL_SCHEME_SEPARATOR = "://";

function isSensitiveFlag(flag: string): boolean {
  if (!flag.startsWith("-")) return false;
  return SENSITIVE_FLAGS.has(flag.toLowerCase()) || SENSITIVE_FLAG_PATTERN.test(flag);
}

function redactTokenCredentials(token: string): string {
  const separator = token.indexOf(URL_SCHEME_SEPARATOR);
  const lastAt = token.lastIndexOf("@");
  if (separator === -1 || lastAt < separator) return token;
  return `${token.slice(0, separator + URL_SCHEME_SEPARATOR.length)}${REDACTED}${token.slice(lastAt)}`;
}

/**
 * Masks `scheme://user:password@host` credentials anywhere in `text`.
 *
 * Runs on crash paths over arbitrary error text, so it scans each token linearly
 * instead of using a backtracking pattern. It masks up to the last `@`, as URL
 * parsers do, so a raw `@` in a password cannot expose the rest of it.
 */
export function redactUrlCredentials(text: string): string {
  return text.replace(/\S+/g, (token) => redactTokenCredentials(token));
}

/**
 * Masks secrets in a command line so it can be persisted.
 *
 * Fails closed: the token after a sensitive flag is always masked, even when it
 * looks like a flag, because commander accepts dash-prefixed option values. That
 * token is still checked as a flag itself, so its own value cannot slip through.
 */
export function redactArgv(argv: readonly string[]): string[] {
  let previousWasSensitiveFlag = false;
  return argv.map((arg) => {
    const isValue = previousWasSensitiveFlag;
    const separator = arg.indexOf("=");
    const hasInlineValue = separator !== -1;
    const flag = hasInlineValue ? arg.slice(0, separator) : arg;
    const sensitive = isSensitiveFlag(flag);
    previousWasSensitiveFlag = sensitive && !hasInlineValue;

    if (isValue) return REDACTED;
    if (sensitive && hasInlineValue) return `${flag}=${REDACTED}`;
    return redactUrlCredentials(arg);
  });
}
