import {
  cloneElement,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ActorContext, Permission } from "@/domain/identity";
import { permissionsForRole } from "@/domain/identity";
import { InstrumentShellView } from "@/components/market-core/instrument-shell-view";
import { INSTRUMENT_SECTIONS, type InstrumentSection } from "@/domain/market-core";
import {
  F2F_PROTOCOL_INVESTMENT_ID,
  WHEAT_INSTRUMENT_ID,
} from "@/data/market-core/catalog";
import { isChainMintProofSlot } from "@/lib/market-core/instrument-basis-adapter";
import { getInstrumentShellContext } from "@/services/instrument-shell";
import en from "../../../messages/en.json";

function catalogLookup(namespace: string, key: string): string {
  const root = (en as Record<string, unknown>)[namespace];
  const parts = key.split(".");
  let current: unknown = root;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return key;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : key;
}

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return {
    ...actual,
    useLocale: () => "en",
    useTranslations: (namespace: string) => (key: string) =>
      catalogLookup(namespace, key),
  };
});

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string) =>
    catalogLookup(namespace, key),
}));

function actor(): ActorContext {
  const permissions: Permission[] = permissionsForRole("REGISTRAR_OPERATOR");
  return {
    principal: {
      userId: "test-user",
      email: "test@example.com",
      displayName: "Test",
      status: "ACTIVE",
      permissions,
      memberships: [],
      organizations: [],
      roleIds: [],
    },
    effective: { roleId: "REGISTRAR_OPERATOR", permissions, producerIds: [] },
    isImpersonating: false,
  };
}

const messages = en.marketCore as unknown as Record<string, string>;

function translate(key: never): string {
  return messages[key] ?? String(key);
}

function renderShell(
  context: NonNullable<Awaited<ReturnType<typeof getInstrumentShellContext>>>,
  section: InstrumentSection,
): string {
  return renderToStaticMarkup(
    createElement(InstrumentShellView, {
      context,
      section,
      locale: "en",
      translate,
      renderProtocolSlot: () => null,
    }),
  );
}

async function materialize(node: ReactNode): Promise<ReactNode> {
  if (node == null || typeof node === "boolean") {
    return node;
  }
  if (Array.isArray(node)) {
    return Promise.all(node.map(materialize));
  }
  if (!isValidElement(node)) {
    return node;
  }
  const type = node.type;
  if (typeof type === "function") {
    const rendered = (type as (props: object) => ReactNode | Promise<ReactNode>)(
      node.props as object,
    );
    return materialize(await Promise.resolve(rendered));
  }
  const children = (node.props as { children?: ReactNode }).children;
  if (children === undefined) {
    return node;
  }
  return cloneElement(node as ReactElement, undefined, await materialize(children));
}

async function renderDefaultShell(
  context: NonNullable<Awaited<ReturnType<typeof getInstrumentShellContext>>>,
  section: InstrumentSection,
): Promise<string> {
  const tree = createElement(InstrumentShellView, {
    context,
    section,
    locale: "en",
    translate,
  });
  const materialized = await materialize(tree);
  return renderToStaticMarkup(materialized as ReactElement);
}

function sectionLinkTag(html: string, section: string): string {
  const match = html.match(
    new RegExp(`<a[^>]*\\?section=${section}"[^>]*>|<a[^>]*\\?section=${section}(?:&quot;)?[^>]*>`),
  );
  if (match) {
    return match[0];
  }
  const tags = html.match(/<a\b[^>]*>/g) ?? [];
  return tags.find((tag) => tag.includes(`?section=${section}`)) ?? "";
}

describe("universal instrument shell view", () => {
  it("renders all five ownership buckets in compact and wide layouts", async () => {
    const context = await getInstrumentShellContext(WHEAT_INSTRUMENT_ID, actor());
    const html = renderShell(context!, "ownership");
    expect(html).toContain("Owned");
    expect(html).toContain("Available");
    expect(html).toContain("Reserved for orders");
    expect(html).toContain("Pledged");
    expect(html).toContain("Blocked");
    expect(html).toContain("Agricultural Registrar");
    expect(html).toContain("Steppe Capital");
    expect(html).toContain("Grain Desk");
    expect(html).toContain("<table");
    expect(html).toContain("<dl");
  });

  it("keeps WHEAT overview truthful and bound to F2F-V1.1", async () => {
    const context = await getInstrumentShellContext(WHEAT_INSTRUMENT_ID, actor());
    const html = renderShell(context!, "overview");
    expect(html).toContain("WHEAT-2027");
    expect(html).toContain("F2F-V1.1");
    expect(html).toContain("ISS-001");
    expect(html).toContain("Demo Agro Issuer Ltd");
    expect(html).toContain("Minted supply");
    expect(html).toContain("Circulating supply");
    expect(html).not.toContain("Held by Steppe Capital");
    expect(html).not.toContain(">Owned<");
    expect(html).not.toMatch(/settlement finality/i);
  });

  it("renders canonical WHEAT terms including the recorded redemption window", async () => {
    const context = await getInstrumentShellContext(WHEAT_INSTRUMENT_ID, actor());
    const html = renderShell(context!, "terms");
    expect(html).toContain("1 token = claim for 1 tonne of Wheat Class 3 against the Issuer");
    expect(html).toContain("Aug–Oct 2027");
    expect(html).toContain("DEMO-KZT is a demo settlement asset with no monetary value.");
    expect(html).not.toContain("Possible future economic rights");
  });

  it("renders F2F basis from the adapter without page-level wheat branches", async () => {
    const context = await getInstrumentShellContext(WHEAT_INSTRUMENT_ID, actor());
    const html = renderShell(context!, "basis");
    expect(html).toContain("Agriculture-specific basis");
    expect(html).toContain("POOL-WHEAT-2027-01");
    expect(html).not.toContain("futureWaterBasis");
    expect(html).not.toContain("Future water basis");
  });

  it("renders F2F risk and clearing evidence only from adapter data", async () => {
    const context = await getInstrumentShellContext(WHEAT_INSTRUMENT_ID, actor());
    const risk = renderShell(context!, "risk");
    expect(risk).toContain("Risk haircut applies to issuance capacity");
    expect(risk).not.toContain("Offering risk metrics are not shown");

    const market = renderShell(context!, "market");
    expect(market).toContain("/secondary");
    expect(market).toContain("MKT-WHEAT-2027-DEMO-KZT");
    expect(market).not.toMatch(/settlement finality/i);

    const clearing = renderShell(context!, "clearing");
    expect(clearing).toContain("Primary placement evidence");
    expect(clearing).toContain("This is not a secondary-market clearing event.");

    const documents = renderShell(context!, "documents");
    expect(documents).toContain("No additional offering documents");

    const audit = renderShell(context!, "audit");
    expect(audit).toContain("Instrument admission workflow");
    expect(audit).toContain("On-chain token proof is demonstrator evidence");
  });

  it("suppresses offer, price, yield and possible-model terms for the protocol investment", async () => {
    const context = await getInstrumentShellContext(
      F2F_PROTOCOL_INVESTMENT_ID,
      actor(),
    );
    const html = renderShell(context!, "terms");
    expect(html).toContain("This instrument is not offered");
    expect(html).not.toContain("Possible future economic rights");
    expect(html).not.toContain("Use of proceeds");
    expect(html).not.toContain("Not structured.");
    expect(html).not.toContain("open subscription");
    expect(html).not.toContain("Aug–Oct 2027");
    expect(html).not.toContain("empty-silo-light.png");

    const overview = renderShell(context!, "overview");
    expect(overview).toContain("CONCEPT / STRUCTURING");
    expect(overview).toContain("NO OFFERING");
    expect(overview).not.toContain("POOL-WHEAT-2027-01");
    expect(overview).not.toContain("WHEAT-2027");

    const market = renderShell(context!, "market");
    expect(market).toContain("not offered");
    expect(market).not.toContain("/secondary");
    expect(market).not.toContain("WHEAT-2027");
    expect(market).not.toContain("MKT-WHEAT-2027-DEMO-KZT");

    const risk = renderShell(context!, "risk");
    expect(risk).toContain("not offered");
    expect(risk).not.toContain("Risk haircut applies to issuance capacity");

    const basis = renderShell(context!, "basis");
    expect(basis).not.toContain("Agriculture-specific basis");
    expect(basis).not.toContain("POOL-WHEAT-2027-01");
  });

  it("marks exactly one section link as the current page", async () => {
    const context = await getInstrumentShellContext(WHEAT_INSTRUMENT_ID, actor());
    const overview = renderShell(context!, "overview");
    const terms = renderShell(context!, "terms");
    expect(overview.match(/aria-current="page"/g)).toHaveLength(1);
    expect(sectionLinkTag(overview, "overview")).toContain('aria-current="page"');
    expect(sectionLinkTag(overview, "terms")).not.toContain("aria-current");
    expect(terms.match(/aria-current="page"/g)).toHaveLength(1);
    expect(sectionLinkTag(terms, "terms")).toContain('aria-current="page"');
    expect(sectionLinkTag(terms, "overview")).not.toContain("aria-current");
    for (const section of INSTRUMENT_SECTIONS) {
      expect(overview).toContain(`?section=${section}`);
      if (section !== "overview") {
        expect(sectionLinkTag(overview, section)).not.toContain("aria-current");
      }
    }
  });

  it("renders the default chainMintProof panel on audit without a custom slot renderer", async () => {
    const context = await getInstrumentShellContext(WHEAT_INSTRUMENT_ID, actor());
    expect(context!.basis.kind).toBe("AVAILABLE");
    if (context!.basis.kind !== "AVAILABLE") {
      throw new Error("expected AVAILABLE");
    }
    const slot = context!.basis.protocolSlot;
    expect(slot !== null && isChainMintProofSlot(slot)).toBe(true);
    const html = await renderDefaultShell(context!, "audit");
    expect(html).toContain("Token-2022 mint");
    expect(html).toContain("Not Yet Deployed");
    expect(html).toContain(
      "No Token-2022 mint, mint authority or issuance transaction is recorded.",
    );
    expect(html).toContain(
      "On-chain token proof is demonstrator evidence. It is not legal ownership and not settlement finality.",
    );
    expect(html).not.toContain("Mint (Registrar)");
    expect(html).not.toMatch(/legal book of record/i);
  });
});
