import { describe, expect, it } from "vitest";
import {
  POST_SECONDARY_REGISTRAR_BOOK,
  PRE_SECONDARY_REGISTRAR_BOOK,
  SECONDARY_REGISTRAR_FINALIZATION_PLAN,
  plannedRegistrarBookAfterSecondary,
} from "./registrar-finalization";

describe("registrar finalization plan", () => {
  it("is prepared and not invoked", () => {
    expect(SECONDARY_REGISTRAR_FINALIZATION_PLAN.invoked).toBe(false);
    expect(SECONDARY_REGISTRAR_FINALIZATION_PLAN.markSettledOnlyAfterThisFunction).toBe(
      true,
    );
    expect(plannedRegistrarBookAfterSecondary()).toEqual(PRE_SECONDARY_REGISTRAR_BOOK);
    expect(
      POST_SECONDARY_REGISTRAR_BOOK.find((row) => row.participantId === "INVESTOR-0001")
        ?.registeredOwned,
    ).toBe(8);
    expect(
      POST_SECONDARY_REGISTRAR_BOOK.find((row) => row.participantId === "GRAIN-DESK")
        ?.registeredOwned,
    ).toBe(2);
    expect(
      POST_SECONDARY_REGISTRAR_BOOK.find((row) => row.participantId === "REGISTRAR")
        ?.registeredOwned,
    ).toBe(990);
  });
});
