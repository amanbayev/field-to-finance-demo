import type {
  AssetProtocol,
  InstrumentStatus,
  InstrumentType,
  MarketInstrument,
} from "@/domain/market-core";

/**
 * Production grouping for the instrument catalogue:
 *
 *   protocol -> instrument family -> lifecycle status
 *
 * Pure and generic. It reports only what the records say: it invents no
 * instrument, economics or version binding, and it never lets one family's
 * labelling colour another's.
 */
export const INSTRUMENT_FAMILY_KEYS: Record<InstrumentType, string> = {
  ASSET_TOKEN: "familyAssetToken",
  PROTOCOL_INVESTMENT: "familyProtocolInvestment",
};

/** Display order for families and statuses. Issued first, then structuring work. */
const FAMILY_ORDER: readonly InstrumentType[] = ["ASSET_TOKEN", "PROTOCOL_INVESTMENT"];
const STATUS_ORDER: readonly InstrumentStatus[] = [
  "ISSUED",
  "ADMITTED",
  "STRUCTURING",
  "FUTURE",
];

export interface InstrumentStatusGroup {
  status: InstrumentStatus;
  instruments: readonly MarketInstrument[];
}

export interface InstrumentFamilyGroup {
  instrumentType: InstrumentType;
  labelKey: string;
  statuses: readonly InstrumentStatusGroup[];
}

export interface InstrumentProtocolGroup {
  protocol: AssetProtocol;
  families: readonly InstrumentFamilyGroup[];
}

function statusRank(status: InstrumentStatus): number {
  const index = STATUS_ORDER.indexOf(status);
  return index === -1 ? STATUS_ORDER.length : index;
}

export function groupInstrumentCatalogue(
  protocols: readonly AssetProtocol[],
  instruments: readonly MarketInstrument[],
): readonly InstrumentProtocolGroup[] {
  return protocols
    .map((protocol) => {
      const owned = instruments.filter(
        (instrument) => instrument.assetProtocolId === protocol.id,
      );
      const families = FAMILY_ORDER.map((instrumentType) => {
        const inFamily = owned.filter(
          (instrument) => instrument.instrumentType === instrumentType,
        );
        const statuses = [...new Set(inFamily.map((item) => item.status))]
          .sort((a, b) => statusRank(a) - statusRank(b))
          .map((status) => ({
            status,
            instruments: inFamily.filter((item) => item.status === status),
          }));
        return { instrumentType, labelKey: INSTRUMENT_FAMILY_KEYS[instrumentType], statuses };
      })
        // An empty family is omitted rather than shown as an empty heading.
        .filter((family) => family.statuses.length > 0);
      return { protocol, families };
    })
    // A protocol with no instruments is omitted, never padded with demo rows.
    .filter((group) => group.families.length > 0);
}
