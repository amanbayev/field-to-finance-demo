import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ActorContext, Permission } from "@/domain/identity";
import { permissionsForRole } from "@/domain/identity";
import { InstrumentShellView } from "@/components/market-core/instrument-shell-view";
import type { InstrumentSection } from "@/domain/market-core";
import {
  F2F_PROTOCOL_INVESTMENT_ID,
  WHEAT_INSTRUMENT_ID,
} from "@/data/market-core/catalog";
import { getInstrumentShellContext } from "@/services/instrument-shell";
import en from "../../../messages/en.json";

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return {
    ...actual,
    useLocale: () => "en",
  };
});

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
});
