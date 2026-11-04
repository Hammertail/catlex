//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  isBlockedHostname,
  isBlockedIpv4,
  isBlockedIpv6,
  parseIpv4Hostname,
} from "../../../src/core/translate/openai-base-url-safety.ts";

describe("parseIpv4Hostname", () => {
  it("parses valid IPv4 addresses", () => {
    expect(parseIpv4Hostname("8.8.8.8")).toEqual([8, 8, 8, 8]);
    expect(parseIpv4Hostname("0.0.0.0")).toEqual([0, 0, 0, 0]);
  });

  it("returns null for non-IPv4 hostnames", () => {
    expect(parseIpv4Hostname("openrouter.ai")).toBeNull();
    expect(parseIpv4Hostname("1.2.3")).toBeNull();
    expect(parseIpv4Hostname("1.2.3.256")).toBeNull();
    expect(parseIpv4Hostname("01a.2.3.4")).toBeNull();
  });
});

describe("isBlockedIpv4", () => {
  it("blocks this-network, loopback, private, and link-local ranges", () => {
    expect(isBlockedIpv4([0, 0, 0, 0])).toBe(true);
    expect(isBlockedIpv4([127, 0, 0, 1])).toBe(true);
    expect(isBlockedIpv4([10, 1, 2, 3])).toBe(true);
    expect(isBlockedIpv4([169, 254, 169, 254])).toBe(true);
    expect(isBlockedIpv4([172, 16, 0, 1])).toBe(true);
    expect(isBlockedIpv4([172, 31, 255, 255])).toBe(true);
    expect(isBlockedIpv4([192, 168, 0, 1])).toBe(true);
  });

  it("allows public IPv4 addresses and non-private 172.x hosts", () => {
    expect(isBlockedIpv4([8, 8, 8, 8])).toBe(false);
    expect(isBlockedIpv4([172, 15, 0, 1])).toBe(false);
    expect(isBlockedIpv4([172, 32, 0, 1])).toBe(false);
    expect(isBlockedIpv4([1, 1, 1, 1])).toBe(false);
  });
});

describe("isBlockedIpv6", () => {
  it("blocks loopback, unique-local, and link-local addresses with or without brackets", () => {
    expect(isBlockedIpv6("::1")).toBe(true);
    expect(isBlockedIpv6("[::1]")).toBe(true);
    expect(isBlockedIpv6("::")).toBe(true);
    expect(isBlockedIpv6("fc00::1")).toBe(true);
    expect(isBlockedIpv6("[fd12::1]")).toBe(true);
    expect(isBlockedIpv6("fe80::1")).toBe(true);
    expect(isBlockedIpv6("fe90::1")).toBe(true);
    expect(isBlockedIpv6("fea0::1")).toBe(true);
    expect(isBlockedIpv6("feb0::1")).toBe(true);
  });

  it("blocks IPv4-mapped loopback and private addresses", () => {
    expect(isBlockedIpv6("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIpv6("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedIpv6("[::ffff:7f00:1]")).toBe(true);
  });

  it("allows public IPv6 and public IPv4-mapped addresses", () => {
    expect(isBlockedIpv6("2001:4860:4860::8888")).toBe(false);
    expect(isBlockedIpv6("::ffff:8.8.8.8")).toBe(false);
    expect(isBlockedIpv6("[::ffff:808:808]")).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it("blocks empty, localhost, metadata, and private hosts", () => {
    expect(isBlockedHostname("")).toBe(true);
    expect(isBlockedHostname("   ")).toBe(true);
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("api.localhost")).toBe(true);
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedHostname("127.0.0.1")).toBe(true);
    expect(isBlockedHostname("169.254.169.254")).toBe(true);
    expect(isBlockedHostname("[::1]")).toBe(true);
  });

  it("allows public DNS names and public IPs", () => {
    expect(isBlockedHostname("openrouter.ai")).toBe(false);
    expect(isBlockedHostname("api.openai.com")).toBe(false);
    expect(isBlockedHostname("8.8.8.8")).toBe(false);
  });
});
