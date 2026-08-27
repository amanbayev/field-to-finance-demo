import { describe, expect, it } from "vitest";
import { resolveOriginationBackend } from "@/lib/origination/backend";

describe("origination backend contract", () => {
  it("uses memory for unit tests", () => {
    expect(
      resolveOriginationBackend({
        nodeEnv: "test",
        hasServiceRole: false,
      }),
    ).toBe("memory");
  });

  it("uses memory for explicit local development", () => {
    expect(
      resolveOriginationBackend({
        nodeEnv: "development",
        originationStore: "memory",
        hasServiceRole: true,
      }),
    ).toBe("memory");
    expect(
      resolveOriginationBackend({
        nodeEnv: "development",
        hasServiceRole: false,
      }),
    ).toBe("memory");
  });

  it("uses postgres locally when a server-only key is present", () => {
    expect(
      resolveOriginationBackend({
        nodeEnv: "development",
        hasServiceRole: true,
      }),
    ).toBe("postgres");
  });

  it("fails closed on Preview and Production instead of memory", () => {
    expect(
      resolveOriginationBackend({
        nodeEnv: "production",
        vercel: "1",
        vercelEnv: "preview",
        originationStore: "memory",
        hasServiceRole: false,
      }),
    ).toBe("fail");
    expect(
      resolveOriginationBackend({
        nodeEnv: "production",
        vercelEnv: "production",
        hasServiceRole: false,
      }),
    ).toBe("fail");
    expect(
      resolveOriginationBackend({
        nodeEnv: "production",
        hasServiceRole: true,
      }),
    ).toBe("postgres");
  });

  it("ignores ORIGINATION_STORE=memory on Vercel when a service credential exists", () => {
    expect(
      resolveOriginationBackend({
        nodeEnv: "production",
        vercel: "1",
        vercelEnv: "preview",
        originationStore: "memory",
        hasServiceRole: true,
      }),
    ).toBe("postgres");
  });
});
