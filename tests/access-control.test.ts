import { describe, expect, it } from "vitest";
import { normalizeIp } from "../server/access-control.cjs";

describe("access control helpers", () => {
  it("normalizes IPv4-mapped IPv6 addresses", () => {
    expect(normalizeIp("::ffff:192.168.0.10")).toBe("192.168.0.10");
  });
});
