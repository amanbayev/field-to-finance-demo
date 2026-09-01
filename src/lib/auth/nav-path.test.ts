import { describe, expect, it } from "vitest";
import { navHrefIsActive } from "@/lib/auth/nav-path";

describe("navHrefIsActive", () => {
  it("activates /issuances for an issuance detail route", () => {
    expect(navHrefIsActive("/issuances/ISS-001", "/issuances")).toBe(true);
    expect(navHrefIsActive("/issuances/TIDE-ISS-001", "/issuances")).toBe(true);
    expect(navHrefIsActive("/issuances", "/issuances")).toBe(true);
  });

  it("still activates protocol detail routes via the prefix set", () => {
    expect(navHrefIsActive("/protocols/TIDAL", "/protocols")).toBe(true);
    expect(
      navHrefIsActive("/protocols/TIDAL/versions/TIDAL-V3.2", "/protocols"),
    ).toBe(true);
    expect(navHrefIsActive("/protocols", "/protocols")).toBe(true);
  });

  it("does not treat an unrelated path as an issuance collection match", () => {
    expect(navHrefIsActive("/instruments/TIDE-2030", "/issuances")).toBe(false);
    expect(navHrefIsActive("/", "/issuances")).toBe(false);
  });
});
