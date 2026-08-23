export const INSTRUMENT_SHELL_TABS = [
  "overview",
  "terms",
  "basis",
  "risks",
  "market",
  "clearing",
  "ownership",
  "documents",
  "audit",
] as const;

export type InstrumentShellTab = (typeof INSTRUMENT_SHELL_TABS)[number];

export function parseInstrumentShellTab(value: string | undefined): InstrumentShellTab {
  if (value && (INSTRUMENT_SHELL_TABS as readonly string[]).includes(value)) {
    return value as InstrumentShellTab;
  }
  return "overview";
}

export function instrumentShellHref(instrumentId: string, tab: InstrumentShellTab): string {
  if (tab === "overview") {
    return `/ui-v2/instruments/${instrumentId}`;
  }
  return `/ui-v2/instruments/${instrumentId}?tab=${tab}`;
}
