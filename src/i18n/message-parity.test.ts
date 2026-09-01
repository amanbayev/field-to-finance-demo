import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import kk from "../../messages/kk.json";
import {
  GOVERNANCE_NOTE_UNAVAILABLE_KEY,
  PROTOCOL_VERSION_GOVERNANCE_KEYS,
} from "@/lib/market-core/presentation";
import { HIERARCHY_LEVEL_KEYS, HIERARCHY_LEVELS } from "@/lib/market-core/hierarchy";
import { protocolVersions } from "@/data/market-core/catalog";

type Catalog = Record<string, Record<string, string>>;

const catalogs: Array<[string, Catalog]> = [
  ["ru", ru as unknown as Catalog],
  ["kk", kk as unknown as Catalog],
];
const base = en as unknown as Catalog;

/**
 * Namespaces this PR changes. `request.ts` merges English as the base, so a
 * missing translation is silently invisible in review — it has to be a test.
 */
const CHANGED_NAMESPACES = ["marketCore", "errors"] as const;

describe("message catalogue parity", () => {
  const allNamespaces = Object.keys(base);

  it("has EN/RU/KK key-set parity in every namespace", () => {
    for (const namespace of allNamespaces) {
      const expected = new Set(Object.keys(base[namespace]!));
      for (const [locale, catalog] of catalogs) {
        const actual = new Set(Object.keys(catalog[namespace] ?? {}));
        const missing = [...expected].filter((key) => !actual.has(key));
        const extra = [...actual].filter((key) => !expected.has(key));
        expect(missing, `${namespace} missing in ${locale}`).toEqual([]);
        expect(extra, `${namespace} extra in ${locale}`).toEqual([]);
      }
    }
  });

  /**
   * Ordering is asserted only for the namespaces this phase changed. Several
   * unrelated legacy namespaces have matching key sets but differing order, and
   * mass-reordering them is out of scope.
   */
  it.each(CHANGED_NAMESPACES)("keeps %s at identical key order", (namespace) => {
    const expected = Object.keys(base[namespace]!);
    for (const [locale, catalog] of catalogs) {
      expect(Object.keys(catalog[namespace]!), `${namespace} in ${locale}`).toEqual(
        expected,
      );
    }
  });

  it.each(CHANGED_NAMESPACES)("has no empty %s value in any locale", (namespace) => {
    for (const [locale, catalog] of [["en", base], ...catalogs] as Array<
      [string, Catalog]
    >) {
      for (const [key, value] of Object.entries(catalog[namespace]!)) {
        expect(typeof value, `${namespace}.${key} in ${locale}`).toBe("string");
        expect(value.trim().length, `${namespace}.${key} in ${locale}`).toBeGreaterThan(0);
      }
    }
  });

  it("localizes the error and not-found copy rendered by error.tsx and not-found.tsx", () => {
    const rendered = [
      "system",
      "unableTitle",
      "unableBody",
      "retry",
      "notFound",
      "recordTitle",
      "recordBody",
      "returnDashboard",
    ];
    for (const [locale, catalog] of catalogs) {
      for (const key of rendered) {
        const value = catalog.errors?.[key];
        expect(value, `errors.${key} missing in ${locale}`).toBeTruthy();
        // A translation that is byte-identical to English means the key was
        // copied rather than translated.
        expect(value, `errors.${key} not translated in ${locale}`).not.toBe(
          base.errors![key],
        );
      }
    }
  });

  it("localizes every hierarchy level label", () => {
    for (const level of HIERARCHY_LEVELS) {
      const key = HIERARCHY_LEVEL_KEYS[level];
      for (const [locale, catalog] of [["en", base], ...catalogs] as Array<
        [string, Catalog]
      >) {
        expect(catalog.marketCore?.[key], `${key} in ${locale}`).toBeTruthy();
      }
    }
  });

  it("localizes every governance note and its fail-closed fallback", () => {
    const keys = [
      ...protocolVersions.map((version) => PROTOCOL_VERSION_GOVERNANCE_KEYS[version.id]!),
      GOVERNANCE_NOTE_UNAVAILABLE_KEY,
    ];
    for (const key of keys) {
      expect(key).toBeTruthy();
      const values = [base, ru as unknown as Catalog, kk as unknown as Catalog].map(
        (catalog) => catalog.marketCore?.[key],
      );
      for (const value of values) {
        expect(value).toBeTruthy();
      }
      // Distinct per locale: canonical English must not leak into ru or kk.
      expect(new Set(values).size).toBe(3);
    }
  });

  it("never exposes a canonical English governance note as a message value", () => {
    const canonical = protocolVersions.map((version) => version.governanceNote);
    for (const [locale, catalog] of catalogs) {
      for (const value of Object.values(catalog.marketCore!)) {
        expect(canonical, `raw governance note leaked into ${locale}`).not.toContain(
          value,
        );
      }
    }
  });

  it("localizes the markets link to the protocol catalogue", () => {
    for (const [locale, catalog] of [["en", base], ...catalogs] as Array<
      [string, Catalog]
    >) {
      expect(catalog.marketCore?.browseProtocols, `browseProtocols in ${locale}`)
        .toBeTruthy();
    }
    // Distinct per locale, i.e. actually translated.
    expect(
      new Set([base, ru as unknown as Catalog, kk as unknown as Catalog].map(
        (c) => c.marketCore!.browseProtocols,
      )).size,
    ).toBe(3);
  });

  it("localizes both frozen states and the full rule-snapshot labels", () => {
    const keys = [
      "immutableRules",
      "rulesNotFrozen",
      "verification",
      "riskModel",
      "coverageModel",
      "issuanceModel",
      "redemptionModel",
      "versionLifecycle",
      "versionModules",
      "versionNoLifecycle",
      "versionNoModules",
      "recordedVersions",
      "currentUsableVersion",
      "noCurrentUsableVersion",
      "breadcrumbPlatform",
    ];
    for (const key of keys) {
      for (const [locale, catalog] of [["en", base], ...catalogs] as Array<
        [string, Catalog]
      >) {
        expect(catalog.marketCore?.[key], `${key} in ${locale}`).toBeTruthy();
      }
    }
  });
});
