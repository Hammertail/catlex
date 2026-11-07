const REDACTED = "<redacted>";

/** Catlex flags that take free-form or credential-bearing values. */
const SENSITIVE_FLAGS: ReadonlySet<string> = new Set(["--guidance", "--base-url"]);

const SENSITIVE_FLAG_PATTERN = /key|token|secret|password/i;

const URL_SCHEME_SEPARATOR = "://";

const PARAM_DELIMITERS = "?&#;";

const PARAM_VALUE_TERMINATORS = "&#;";

function isSensitiveFlag(flag: string): boolean {
  if (!flag.startsWith("-")) return false;
  return SENSITIVE_FLAGS.has(flag.toLowerCase()) || SENSITIVE_FLAG_PATTERN.test(flag);
}

/** Returns the index of the first character of `chars` at or after `from`, or `text.length`. */
function indexOfAny(text: string, chars: string, from: number): number {
  let index = from;
  while (index < text.length && !chars.includes(text.charAt(index))) index += 1;
  return index;
}

/**
 * Masks the values of query or fragment parameters whose names match the
 * sensitive-flag rule, such as `?access_token=...`. Each parameter name is read
 * once up to the next delimiter or `=`, and a masked value is skipped up to the
 * next `&`, `#` or `;`, so the scan stays linear.
 */
function redactSensitiveParams(token: string): string {
  let output = "";
  let index = 0;
  while (index < token.length) {
    const delimiter = indexOfAny(token, PARAM_DELIMITERS, index);
    output += token.slice(index, delimiter + 1);
    const nameEnd = indexOfAny(token, `=${PARAM_DELIMITERS}`, delimiter + 1);
    const name = token.slice(delimiter + 1, nameEnd);
    const isSensitive = token.charAt(nameEnd) === "=" && SENSITIVE_FLAG_PATTERN.test(name);
    output += isSensitive ? `${name}=${REDACTED}` : name;
    index = isSensitive ? indexOfAny(token, PARAM_VALUE_TERMINATORS, nameEnd + 1) : nameEnd;
  }
  return output;
}

function redactUserinfo(token: string): string {
  const separator = token.indexOf(URL_SCHEME_SEPARATOR);
  const lastAt = token.lastIndexOf("@");
  if (separator === -1 || lastAt < separator) return token;
  return `${token.slice(0, separator + URL_SCHEME_SEPARATOR.length)}${REDACTED}${token.slice(lastAt)}`;
}

/**
 * Masks URL credentials anywhere in `text`: `scheme://user:password@host`
 * userinfo, and sensitive query or fragment parameters such as `?api_key=...`.
 *
 * Runs on crash paths over arbitrary error text, so it scans each token linearly
 * instead of using a backtracking pattern. It masks userinfo up to the last `@`,
 * as URL parsers do, so a raw `@` in a password cannot expose the rest of it.
 */
export function redactUrlCredentials(text: string): string {
  return text.replace(/\S+/g, (token) => redactSensitiveParams(redactUserinfo(token)));
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
