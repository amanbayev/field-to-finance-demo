import { describe, expect, it } from "vitest";
import { safeReturnTo } from "@/lib/auth/return-to";

describe("open redirect protection", () => {
  it("accepts relative in-app paths", () => {
    expect(safeReturnTo("/regulator")).toBe("/regulator");
    expect(safeReturnTo("/market/PL-ISS001-0001")).toBe("/market/PL-ISS001-0001");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeReturnTo("https://evil.example")).toBe("/");
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("/\\evil")).toBe("/");
    expect(safeReturnTo("\\\\evil")).toBe("/");
  });
});
