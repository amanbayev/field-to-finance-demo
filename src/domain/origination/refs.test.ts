import { describe, expect, it, vi } from "vitest";
import { isUuid, resolveByUuidOrPublicId } from "./refs";

describe("origination public-id classifier", () => {
  it("treats human-readable field and case ids as non-uuid", () => {
    expect(isUuid("FIELD-2027-0009")).toBe(false);
    expect(isUuid("VCASE-2027-0001")).toBe(false);
    expect(isUuid("f54aa7f5-cd8f-4dd6-ae70-be98728d9e0a")).toBe(true);
  });

  it("does not attempt a uuid lookup for public ids", async () => {
    const byId = vi.fn(async () => ({ source: "id" }));
    const byPublicId = vi.fn(async () => ({ source: "public" }));
    const field = await resolveByUuidOrPublicId("FIELD-2027-0009", byId, byPublicId);
    const verificationCase = await resolveByUuidOrPublicId("VCASE-2027-0001", byId, byPublicId);
    expect(field).toEqual({ source: "public" });
    expect(verificationCase).toEqual({ source: "public" });
    expect(byId).not.toHaveBeenCalled();
    expect(byPublicId).toHaveBeenCalledTimes(2);
  });

  it("does not attempt a public-id lookup for uuid refs", async () => {
    const id = "f54aa7f5-cd8f-4dd6-ae70-be98728d9e0a";
    const byId = vi.fn(async () => ({ source: "id" }));
    const byPublicId = vi.fn(async () => ({ source: "public" }));
    await expect(resolveByUuidOrPublicId(id, byId, byPublicId)).resolves.toEqual({ source: "id" });
    expect(byId).toHaveBeenCalledWith(id);
    expect(byPublicId).not.toHaveBeenCalled();
  });
});
