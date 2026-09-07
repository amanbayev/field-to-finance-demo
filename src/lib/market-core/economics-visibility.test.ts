import { describe, expect, it } from "vitest";
import {
  ECONOMICS_WITHHELD_REASON_KEY,
  economicsVisibilityForInstrument,
  mayShowInstrumentEconomics,
} from "./economics-visibility";

describe("economics visibility policy", () => {
  it("permits issued and admitted instruments", () => {
    expect(economicsVisibilityForInstrument({ status: "ISSUED" })).toEqual({
      kind: "PERMITTED",
    });
    expect(economicsVisibilityForInstrument({ status: "ADMITTED" })).toEqual({
      kind: "PERMITTED",
    });
    expect(mayShowInstrumentEconomics({ status: "ISSUED" })).toBe(true);
  });

  it("withholds structuring, concept and future instruments without calling that a rejection", () => {
    for (const status of ["STRUCTURING", "CONCEPT", "FUTURE"]) {
      expect(economicsVisibilityForInstrument({ status })).toEqual({
        kind: "WITHHELD",
        reasonKey: ECONOMICS_WITHHELD_REASON_KEY,
      });
      expect(mayShowInstrumentEconomics({ status })).toBe(false);
    }
    expect(ECONOMICS_WITHHELD_REASON_KEY).toBe("economicsWithheldNotIssued");
  });

  it("fails closed for an unrecognised lifecycle status", () => {
    expect(economicsVisibilityForInstrument({ status: "UNKNOWN" }).kind).toBe(
      "WITHHELD",
    );
  });
});
