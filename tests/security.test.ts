import { describe, expect, it } from "vitest";
import { createOpaqueToken, hashToken } from "@/lib/security";

describe("session token utilities", () => {
  it("creates unique high-entropy opaque tokens", () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThan(40);
  });
  it("hashes deterministically without retaining the raw token", () => {
    const token = "secret-session-token";
    const digest = hashToken(token);
    expect(digest).toBe(hashToken(token));
    expect(digest).not.toContain(token);
    expect(digest).toHaveLength(64);
  });
});
