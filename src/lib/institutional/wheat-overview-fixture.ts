import {
  buildPrincipal,
  resolveActorContext,
  type ActorContext,
} from "@/domain/identity";
import { LEGAL_OPERATOR } from "@/domain/market-core";
import { DEMO_ORGANIZATIONS } from "@/data/identity/demo-catalog";
import { seedFirstWheatSecondaryScenario } from "@/data/market-core/seed-scenario";
import {
  DESIGN_REVIEW_INSTRUMENT_ID,
  DESIGN_REVIEW_MARKET_ID,
} from "@/lib/institutional/design-review";
import {
  loadInstrumentOverview,
  type InstrumentOverviewModel,
} from "@/lib/institutional/load-overview";
import { loadMarketWorkstation } from "@/lib/institutional/load-market-workstation";
import { DESIGN_REVIEW_INSTRUMENT_SHELL_BASE } from "@/lib/institutional/tabs";
import {
  placementManifest,
  recordedPlacementProof,
} from "@/adapters/blockchain/solana/recorded-placement";
import {
  fallbackSupply,
  type PlacementSnapshot,
} from "@/services/placement-service";

const missing = { status: "missing" as const };

function recordedPlacementSnapshot(): PlacementSnapshot {
  return {
    recorded: recordedPlacementProof(),
    manifest: placementManifest,
    lookup: missing,
    registrarWheat: missing,
    investorWheat: missing,
    mintLookup: missing,
    supply: fallbackSupply(),
    liveBalances: false,
  };
}

export function designReviewActor(): ActorContext {
  const platform = DEMO_ORGANIZATIONS.find((organization) => organization.slug === "field-to-finance");
  if (!platform) {
    throw new Error("Design-review fixture is missing the platform organization.");
  }
  const principal = buildPrincipal({
    userId: "design-review-fixture",
    email: null,
    displayName: "Design Review",
    status: "ACTIVE",
    organizations: [platform],
    memberships: [
      {
        id: "mem-design-review",
        userId: "design-review-fixture",
        organizationId: platform.id,
        roleIds: ["SYSTEM_ADMIN"],
        status: "ACTIVE",
      },
    ],
  });
  return resolveActorContext({
    principal,
    session: null,
    persona: undefined,
    personaOrganization: undefined,
  });
}

export function designReviewWorkspaceName(): string {
  return LEGAL_OPERATOR;
}

export async function loadDesignReviewInstrumentOverview(
  instrumentId: string,
): Promise<InstrumentOverviewModel | null> {
  if (instrumentId !== DESIGN_REVIEW_INSTRUMENT_ID) {
    return null;
  }
  return loadInstrumentOverview(instrumentId, designReviewActor(), {
    engine: seedFirstWheatSecondaryScenario(),
    placement: recordedPlacementSnapshot(),
  });
}

export async function loadDesignReviewMarketWorkstation(marketId: string) {
  if (marketId !== DESIGN_REVIEW_MARKET_ID) {
    return null;
  }
  return loadMarketWorkstation(marketId, designReviewActor(), {
    engine: seedFirstWheatSecondaryScenario(),
    instrumentHref: `${DESIGN_REVIEW_INSTRUMENT_SHELL_BASE}/${DESIGN_REVIEW_INSTRUMENT_ID}`,
  });
}
