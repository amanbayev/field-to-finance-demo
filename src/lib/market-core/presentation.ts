import { actorCan, type ActorContext } from "@/domain/identity";
import {
  INSTRUMENT_SECTIONS,
  type AssetClass,
  type InstrumentSection,
  type ProtocolInvestmentModel,
  type ProtocolStatus,
} from "@/domain/market-core";

export const INSTRUMENT_SECTION_KEYS: Record<InstrumentSection, string> = {
  overview: "sectionOverview",
  terms: "sectionTerms",
  basis: "sectionBasis",
  risk: "sectionRisk",
  market: "sectionMarket",
  clearing: "sectionClearing",
  ownership: "sectionOwnership",
  documents: "sectionDocuments",
  audit: "sectionAudit",
};

export const LIFECYCLE_KEYS: Record<string, string> = {
  field: "lifecycleField",
  dac: "lifecycleDac",
  verification: "lifecycleVerification",
  pool: "lifecyclePool",
  coverage: "lifecycleCoverage",
  instrument: "lifecycleInstrument",
  issuance: "lifecycleIssuance",
  placement: "lifecyclePlacement",
  market: "lifecycleMarket",
  redemption: "lifecycleRedemption",
};

export const MODULE_KEYS: Record<string, string> = {
  fields: "moduleFields",
  dacs: "moduleDacs",
  scas: "moduleScas",
  pools: "modulePools",
  coverage: "moduleCoverage",
  monitoring: "moduleMonitoring",
};

export const PROTOCOL_INVESTMENT_MODEL_KEYS: Record<
  ProtocolInvestmentModel,
  string
> = {
  EQUITY_LIKE: "equityLike",
  REVENUE_PARTICIPATION: "revenue",
  DEBT_LIKE: "debt",
  CONVERTIBLE: "convertible",
  STRUCTURED_INVESTMENT_RIGHT: "structured",
};

export const ASSET_CLASS_KEYS: Record<AssetClass, string> = {
  AGRICULTURE: "classAGRICULTURE",
  WATER: "classWATER",
  MUSIC_RIGHTS: "classMUSIC_RIGHTS",
  GAMING_ASSETS: "classGAMING_ASSETS",
};

export function protocolStatusKey(status: ProtocolStatus): string {
  switch (status) {
    case "ACTIVE":
      return "activeProtocol";
    case "STRUCTURING":
      return "protocolStructuring";
    case "CONCEPT":
      return "statusCONCEPT";
    default:
      return `status${status}`;
  }
}

export function protocolWorldKey(protocolId: string): string {
  switch (protocolId) {
    case "WATER":
      return "worldWater";
    case "MUSIC_RIGHTS":
      return "worldMusic";
    case "GAMING_ASSETS":
      return "worldGaming";
    default:
      return "worldF2F";
  }
}

export function parseInstrumentSection(value: string | undefined): InstrumentSection {
  if (value && (INSTRUMENT_SECTIONS as readonly string[]).includes(value)) {
    return value as InstrumentSection;
  }
  return "overview";
}

export function f2fModuleHref(
  moduleId: string,
  actor: ActorContext,
): string | undefined {
  switch (moduleId) {
    case "fields":
      return actorCan(actor, "contracts.manage.own") ? "/fields" : undefined;
    case "dacs":
      return actorCan(actor, "contracts.read.all") || actorCan(actor, "contracts.read.own")
        ? "/contracts"
        : undefined;
    case "scas":
      return actorCan(actor, "scas.read") ? "/scas" : undefined;
    case "pools":
      return actorCan(actor, "pools.read") ? "/pools" : undefined;
    case "coverage":
      return actorCan(actor, "scas.read") ||
        actorCan(actor, "regulator.read") ||
        actorCan(actor, "issuance.manage")
        ? "/coverage"
        : undefined;
    case "monitoring":
      if (actorCan(actor, "scas.read")) {
        return "/scas/monitoring";
      }
      if (actorCan(actor, "contracts.read.own")) {
        return "/monitoring";
      }
      return undefined;
    default:
      return undefined;
  }
}
