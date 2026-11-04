//* Libraries imports

/**
 * Host / URL checks for OpenAI-compatible base URLs.
 * Blocks schemes and destinations that could steal `OPENAI_API_KEY`.
 */

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return null;
    }
    octets.push(value);
  }
  return octets;
}

function isIpv4LoopbackOrThis(octets: number[]): boolean {
  const a = octets[0] ?? 0;
  return a === 0 || a === 127;
}

function isIpv4TenDot(octets: number[]): boolean {
  return (octets[0] ?? 0) === 10;
}

function isIpv4LinkLocal(octets: number[]): boolean {
  return (octets[0] ?? 0) === 169 && (octets[1] ?? 0) === 254;
}

function isIpv4Rfc1918SeventeenTwo(octets: number[]): boolean {
  const b = octets[1] ?? 0;
  return (octets[0] ?? 0) === 172 && b >= 16 && b <= 31;
}

function isIpv4Rfc1918NineteenTwo(octets: number[]): boolean {
  return (octets[0] ?? 0) === 192 && (octets[1] ?? 0) === 168;
}

export function isBlockedIpv4(octets: number[]): boolean {
  return (
    isIpv4LoopbackOrThis(octets) ||
    isIpv4TenDot(octets) ||
    isIpv4LinkLocal(octets) ||
    isIpv4Rfc1918SeventeenTwo(octets) ||
    isIpv4Rfc1918NineteenTwo(octets)
  );
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function isIpv6Loopback(normalized: string): boolean {
  return normalized === "::" || normalized === "::1";
}

function isIpv6UniqueLocalOrLinkLocal(normalized: string): boolean {
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  return (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function blockedIpv4MappedFromDotted(normalized: string): boolean | null {
  const dottedMapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (!dottedMapped?.[1]) {
    return null;
  }
  const octets = parseIpv4(dottedMapped[1]);
  return octets !== null && isBlockedIpv4(octets);
}

function blockedIpv4MappedFromHex(normalized: string): boolean | null {
  const hexMapped = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hexMapped?.[1] || !hexMapped[2]) {
    return null;
  }
  const hi = Number.parseInt(hexMapped[1], 16);
  const lo = Number.parseInt(hexMapped[2], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo)) {
    return true;
  }
  return isBlockedIpv4([(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]);
}

export function isBlockedIpv6(hostname: string): boolean {
  const normalized = stripIpv6Brackets(hostname);
  if (isIpv6Loopback(normalized) || isIpv6UniqueLocalOrLinkLocal(normalized)) {
    return true;
  }
  const fromDotted = blockedIpv4MappedFromDotted(normalized);
  if (fromDotted !== null) {
    return fromDotted;
  }
  const fromHex = blockedIpv4MappedFromHex(normalized);
  if (fromHex !== null) {
    return fromHex;
  }
  return false;
}

function isSpecialBlockedName(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost") || host === "[::1]") {
    return true;
  }
  return host === "metadata.google.internal";
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host || isSpecialBlockedName(host)) {
    return true;
  }

  const ipv4 = parseIpv4(host);
  if (ipv4) {
    return isBlockedIpv4(ipv4);
  }

  if (host.includes(":") || (host.startsWith("[") && host.endsWith("]"))) {
    return isBlockedIpv6(host);
  }

  return false;
}

export function parseIpv4Hostname(hostname: string): number[] | null {
  return parseIpv4(hostname);
}
