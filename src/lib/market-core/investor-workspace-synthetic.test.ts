import { describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/domain/identity";
import type {
  AssetProtocol,
  EligibilityExplanation,
  Holding,
  Market,
  MarketInstrument,
  ProtocolVersion,
} from "@/domain/market-core";
import {
  DEMO_ORGANIZATIONS,
  demoPersonaById,
  organizationById,
} from "@/data/identity/demo-catalog";
import { marketInstruments } from "@/data/market-core/catalog";
import {
  buildPrincipal,
  resolveActorContext,
  type MembershipRecord,
} from "@/domain/identity";
import {
  composeInvestorWorkspace,
  type InvestorWorkspaceCanonicalSource,
  type InvestorWorkspaceReady,
} from "./investor-workspace";
import { createF2fInstrumentBasisAdapter } from "@/lib/protocols/f2f/f2f-instrument-basis-adapter";

const TIDAL_PROTOCOL: AssetProtocol = {
  id: "TIDAL",
  name: "Tidal Energy",
  assetClass: "WATER",
  protocolOwner: "Not appointed",
  operator: "Test operator",
  status: "STRUCTURING",
  regulatoryStatus: "NOT_SUBMITTED",
  currentVersionId: "TIDAL-V9.9",
};

const TIDAL_BOUND_VERSION: ProtocolVersion = {
  id: "TIDAL-V3.2",
  protocolId: "TIDAL",
  displayVersion: "3.2",
  state: "ACTIVE",
  frozen: true,
  activatedAt: null,
  frozenAt: null,
  supersedesVersionId: null,
  supersededByVersionId: null,
  governanceNote: "Synthetic non-agriculture version",
  rules: {
    verificationModel: "Metering",
    riskModel: "Offtake concentration",
    coverageModel: "Contracted revenue",
    issuanceModel: "Claim against issuer",
    redemptionModel: "Scheduled",
    lifecycle: ["site", "commissioning"],
    modules: ["metering"],
  },
};

const TIDAL_INSTRUMENT: MarketInstrument = {
  id: "TIDE-2030",
  symbol: "TIDE-2030",
  name: "Synthetic tidal instrument",
  instrumentType: "ASSET_TOKEN",
  assetProtocolId: "TIDAL",
  protocolVersionId: "TIDAL-V3.2",
  assetClass: "WATER",
  issuerId: "test-issuer",
  issuerName: "Test Issuer",
  issuanceId: "TIDE-ISS-001",
  legalClassification: "Test",
  denomination: "1 metered unit",
  decimals: 0,
  currencyOrUnit: "u",
  transferPolicy: "Test",
  eligibilityPolicy: "Participant × instrument",
  settlementPolicy: "Test",
  custodyPolicy: "Test",
  status: "ISSUED",
};

const TIDAL_MARKET: Market = {
  id: "MKT-TIDE-2030",
  instrumentId: "TIDE-2030",
  phase: "CLOSED",
  activeChannel: "DIRECT_MTP",
  transacting: false,
  matchingEnabled: false,
  settlementEnabled: false,
  demonstratorStatus: "DEMO_CLOSED",
  settlementAssetId: "DEMO-KZT",
  settlementAssetLabel: "DEMO-KZT",
  settlementHasMonetaryValue: false,
  marketType: "REGULATED_INSTITUTIONAL_DEMONSTRATOR",
  allowedOrderTypes: ["LIMIT"],
  wholeQuantityOnly: true,
};

const TIDAL_HOLDING: Holding = {
  id: "hld-tide",
  instrumentId: "TIDE-2030",
  holderReference: "INVESTOR-0001",
  holderName: "Test Holder",
  buckets: {
    owned: 4,
    reservedForOrders: 1,
    pledged: 1,
    blocked: 1,
    pendingIn: 0,
    pendingOut: 0,
  },
  available: 1,
};

const TIDAL_EXPLANATION: EligibilityExplanation = {
  participantReference: "INVESTOR-0001",
  instrumentId: "TIDE-2030",
  state: "NOT_ASSESSED",
  organizationId: null,
  membershipId: null,
  assessmentId: null,
  reasonCode: null,
  authorityRole: null,
  evidenceRefs: [],
  recordedAt: null,
  missing: ["ASSESSMENT_MISSING"],
  inconsistencies: [],
  attributionComplete: true,
};

const platform = DEMO_ORGANIZATIONS.find((item) => item.slug === "field-to-finance")!;

function membership(
  overrides: Partial<MembershipRecord> & Pick<MembershipRecord, "organizationId" | "roleIds">,
): MembershipRecord {
  return {
    id: overrides.id ?? "mem-1",
    userId: overrides.userId ?? "admin-1",
    status: overrides.status ?? "ACTIVE",
    organizationId: overrides.organizationId,
    roleIds: overrides.roleIds,
  };
}

function fundActor(): ActorContext {
  const persona = demoPersonaById("DEMO-FUND-001")!;
  const organization = organizationById(persona.organizationId)!;
  const principal = buildPrincipal({
    userId: "admin-1",
    email: "admin@example.com",
    displayName: "Admin",
    status: "ACTIVE",
    organizations: [platform, organization],
    memberships: [
      membership({
        userId: "admin-1",
        organizationId: platform.id,
        roleIds: ["SYSTEM_ADMIN"],
      }),
    ],
  });
  return resolveActorContext({
    principal,
    session: { principalUserId: "admin-1", effectiveDemoPersonaId: persona.id },
    persona,
    personaOrganization: organization,
  });
}

describe("investor workspace synthetic non-agriculture protocol", () => {
  const f2fAdapter = createF2fInstrumentBasisAdapter();
  const explain = vi.fn(() => TIDAL_EXPLANATION);
  const submit = vi.fn(() => false);
  const cancel = vi.fn(() => false);

  const canonical: InvestorWorkspaceCanonicalSource = {
    listHoldings: () => [TIDAL_HOLDING],
    getInstrumentMarketContext: (instrumentId) => {
      if (instrumentId !== "TIDE-2030") {
        return null;
      }
      return {
        instrument: TIDAL_INSTRUMENT,
        protocol: TIDAL_PROTOCOL,
        market: TIDAL_MARKET,
        protocolVersion: TIDAL_BOUND_VERSION,
      };
    },
    explainActorEligibility: explain,
    actorMaySubmitOrder: submit,
    actorMayCancelOrder: cancel,
  };

  it("groups TIDE-2030 under TIDAL without calling the F2F adapter", async () => {
    const resolveSpy = vi.spyOn(f2fAdapter, "resolve");
    const workspace = composeInvestorWorkspace({
      actor: fundActor(),
      canonical,
      activity: { kind: "UNAVAILABLE" },
      navigation: { secondaryHref: undefined, marketsHref: undefined },
    });
    expect(workspace.kind).toBe("WORKSPACE");
    const ready = workspace as InvestorWorkspaceReady;
    expect(ready.protocolGroups).toEqual([
      expect.objectContaining({
        protocolId: "TIDAL",
        protocolName: "Tidal Energy",
      }),
    ]);
    expect(ready.protocolGroups[0]?.instruments[0]?.instrumentId).toBe("TIDE-2030");
    expect(ready.protocolGroups[0]?.instruments[0]?.protocolVersionId).toBe("TIDAL-V3.2");
    expect(ready.protocolGroups[0]?.instruments[0]?.buckets).toEqual({
      owned: 4,
      available: 1,
      reserved: 1,
      pledged: 1,
      blocked: 1,
    });
    expect(JSON.stringify(ready)).not.toMatch(/WHEAT-2027|Field to Finance|F2F-V1.1/);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(explain).toHaveBeenCalledWith(expect.anything(), "INVESTOR-0001", "TIDE-2030");
    expect(marketInstruments.map((item) => item.id)).not.toContain("TIDE-2030");
    expect(marketInstruments.map((item) => item.assetProtocolId)).not.toContain("TIDAL");
    resolveSpy.mockRestore();
  });
});
