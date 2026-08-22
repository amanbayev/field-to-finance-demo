import type { DistributionChannel, DistributionChannelRecord, Trade } from "./types";

export function channelRoutesToMarketCore(
  channel: DistributionChannelRecord,
): channel is DistributionChannelRecord & { routesToMarketCore: true } {
  return channel.routesToMarketCore === true;
}

export function assertChannelsShareMarketCore(
  channels: readonly DistributionChannelRecord[],
): boolean {
  return channels.every((channel) => channel.routesToMarketCore);
}

export function isSecondaryTrade(trade: Trade): boolean {
  return trade.kind === "SECONDARY";
}

export function phaseCreatesNoSecondaryTrade(
  trades: readonly Trade[],
): boolean {
  return trades.every((trade) => trade.kind !== "SECONDARY");
}

export const FUTURE_CHANNELS: readonly DistributionChannel[] = [
  "RETAIL_APP",
  "API",
  "BROKER",
];
