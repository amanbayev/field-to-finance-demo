import { DevnetSettlementNotEnabledError } from "./settlement-provider";
import {
  LOCKED_SEED_TRADE,
  assertSettlementMatchesLockedTrade,
  type SecondarySettlementInstructionArgs,
} from "./secondary-settlement-binding";
import { currentProgramCanSettleSecondaryDvp } from "./secondary-dvp";

export const SECONDARY_SETTLEMENT_ENABLED = false;

export class SecondarySettlementProvider {
  readonly enabled = SECONDARY_SETTLEMENT_ENABLED;
  readonly instruction = "settle_secondary_dvp";

  constructor(
    private readonly config: {
      settlementEnabled: boolean;
      deployedProgramHasInstruction: boolean;
    } = {
      settlementEnabled: false,
      deployedProgramHasInstruction: false,
    },
  ) {}

  canExecute(): boolean {
    const programReady: boolean = currentProgramCanSettleSecondaryDvp();
    return (
      this.enabled &&
      this.config.settlementEnabled &&
      this.config.deployedProgramHasInstruction &&
      programReady
    );
  }

  settle(_args: SecondarySettlementInstructionArgs): never {
    void _args;
    throw new DevnetSettlementNotEnabledError();
  }

  bindToLockedTrade(args: SecondarySettlementInstructionArgs) {
    return assertSettlementMatchesLockedTrade(LOCKED_SEED_TRADE, args);
  }
}

export const secondarySettlementProvider = new SecondarySettlementProvider();
