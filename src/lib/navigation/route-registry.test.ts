import { describe, expect, it } from "vitest";
import {
  ROUTE_REGISTRY,
  isProtocolModuleRoute,
  routeById,
} from "@/lib/navigation/route-registry";
import {
  instrumentHref,
  issuanceHref,
  protocolHref,
  protocolVersionHref,
} from "@/lib/market-core/hierarchy";
import en from "../../../messages/en.json";
import ru from "../../../messages/ru.json";
import kk from "../../../messages/kk.json";
import { existsSync } from "node:fs";
import { join } from "node:path";

const APP = join(process.cwd(), "src", "app");

/** Maps a registry href to the page file Next.js would serve. */
function pageFileFor(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return join(APP, ...segments, "page.tsx");
}

describe("route registry structure", () => {
  it("has unique route ids", () => {
    const ids = ROUTE_REGISTRY.map((route) => route.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves every id through routeById", () => {
    for (const route of ROUTE_REGISTRY) {
      expect(routeById(route.id)?.id).toBe(route.id);
    }
    expect(routeById("does-not-exist")).toBeUndefined();
  });

  it("uses absolute, well-formed static hrefs", () => {
    for (const route of ROUTE_REGISTRY) {
      if (route.href.kind === "STATIC") {
        expect(route.href.path.startsWith("/"), route.id).toBe(true);
        expect(route.href.path).not.toMatch(/\s/);
        expect(route.href.path).not.toContain("[");
      }
    }
  });

  it("maps every entry to a real application route", () => {
    for (const route of ROUTE_REGISTRY) {
      const path =
        route.href.kind === "STATIC" ? route.href.path : route.href.pattern;
      expect(existsSync(pageFileFor(path)), `${route.id} -> ${path}`).toBe(true);
    }
  });

  it("keeps dynamic routes as typed builders, not hand-written strings", () => {
    expect(protocolHref("TIDAL")).toBe("/protocols/TIDAL");
    expect(protocolVersionHref("TIDAL", "TIDAL-V1")).toBe(
      "/protocols/TIDAL/versions/TIDAL-V1",
    );
    expect(instrumentHref("TIDE-2030")).toBe("/instruments/TIDE-2030");
    expect(issuanceHref("TIDE-ISS-001")).toBe("/issuances/TIDE-ISS-001");
    // Every DYNAMIC pattern is a bracketed Next.js segment pattern.
    for (const route of ROUTE_REGISTRY) {
      if (route.href.kind === "DYNAMIC") {
        expect(route.href.pattern, route.id).toContain("[");
      }
    }
  });

  it("localizes every label key in EN, RU and KK with no empty value", () => {
    const catalogs: Array<[string, Record<string, Record<string, string>>]> = [
      ["en", en as never],
      ["ru", ru as never],
      ["kk", kk as never],
    ];
    for (const route of ROUTE_REGISTRY) {
      for (const [locale, catalog] of catalogs) {
        const value = catalog.nav?.[route.labelKey];
        expect(value, `nav.${route.labelKey} in ${locale}`).toBeTruthy();
        expect(value!.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the nav namespace at EN/RU/KK key-set parity", () => {
    const expected = new Set(Object.keys((en as never as Record<string, object>).nav));
    for (const [locale, catalog] of [
      ["ru", ru],
      ["kk", kk],
    ] as Array<[string, never]>) {
      const actual = new Set(
        Object.keys((catalog as Record<string, object>).nav as object),
      );
      expect([...expected].filter((k) => !actual.has(k)), locale).toEqual([]);
      expect([...actual].filter((k) => !expected.has(k)), locale).toEqual([]);
    }
  });

  it("carries no user-facing English in registry metadata", () => {
    for (const route of ROUTE_REGISTRY) {
      // Labels are message keys, never sentences.
      expect(route.labelKey).not.toMatch(/\s/);
    }
  });

  it("scopes protocol modules to a protocol and platform routes to none", () => {
    for (const route of ROUTE_REGISTRY) {
      if (isProtocolModuleRoute(route)) {
        expect(route.protocolId.length).toBeGreaterThan(0);
        expect(route.placement).toBe("PROTOCOL_CONTEXT");
      } else {
        expect(route.scope).toBe("PLATFORM");
        expect(route).not.toHaveProperty("protocolId");
      }
    }
  });

  it("keeps agriculture modules out of the global platform scope", () => {
    const agriculturePaths = [
      "/fields",
      "/contracts",
      "/pools",
      "/coverage",
      "/backing",
      "/monitoring",
      "/documents",
      "/finance",
      "/scas",
      "/scas/verification",
      "/scas/dacs",
      "/scas/matching",
      "/scas/monitoring",
      "/issuer/dacs",
      "/registrar/intake",
    ];
    const globalPaths = ROUTE_REGISTRY.filter(
      (route) => route.scope === "PLATFORM" && route.href.kind === "STATIC",
    ).map((route) => (route.href as { path: string }).path);
    for (const path of agriculturePaths) {
      expect(globalPaths, `${path} must not be a global platform route`).not.toContain(
        path,
      );
    }
  });
});
