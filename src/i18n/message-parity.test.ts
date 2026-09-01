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
  it.each(CHANGED_NAMESPACES)("keeps %s at identical key set and order", (namespace) => {
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
});
