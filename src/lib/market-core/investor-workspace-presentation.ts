import {
  presentEligibilityExplanation,
  presentNewOrderAdmission,
  type EligibilityPresentation,
  type NewOrderAdmissionPresentation,
} from "./eligibility-presentation";
import type {
  WorkspaceEligibilityRow,
  WorkspaceExecutionRow,
  WorkspaceOrderRow,
  WorkspaceReservationLink,
} from "./investor-workspace";

/**
 * Presentation selectors for the investor workspace. They map recorded
 * domain states to message keys and never emit raw status, reservation or
 * settlement codes as UI copy.
 */

export const WORKSPACE_ORDER_STATUS_KEYS = {
  OPEN: "orderStatusOpen",
  PARTIALLY_FILLED: "orderStatusPartiallyFilled",
} as const;

export const WORKSPACE_RESERVATION_STATUS_KEYS = {
  ACTIVE: "reservationActive",
  RELEASED: "reservationReleased",
  HELD_PENDING_SETTLEMENT: "reservationHeldPendingSettlement",
} as const;

export const WORKSPACE_LIFECYCLE_KEYS = {
  MATCHED: "lifecycleMatched",
  CLEARING_READY: "lifecycleClearingReady",
  AWAITING_DEVNET_SETTLEMENT: "lifecycleAwaitingDevnetSettlement",
} as const;

export const WORKSPACE_ORDER_STATUS_UNAVAILABLE_KEY = "orderStatusUnavailable";
export const WORKSPACE_RESERVATION_NONE_KEY = "reservationNone";
export const WORKSPACE_RESERVATION_UNAVAILABLE_KEY = "reservationUnavailable";
export const WORKSPACE_LIFECYCLE_UNAVAILABLE_KEY = "lifecycleUnavailable";
export const WORKSPACE_SIDE_BUY_KEY = "sideBuy";
export const WORKSPACE_SIDE_SELL_KEY = "sideSell";
export const WORKSPACE_SIDE_UNAVAILABLE_KEY = "sideUnavailable";

const SETTLED_OR_FINAL_CODES = [
  "SETTLED",
  "FINAL",
  "PAID",
  "CUSTODIED",
  "DVP_COMPLETE",
] as const;

export function workspaceOrderStatusKey(status: string): string {
  if (status === "OPEN") {
    return WORKSPACE_ORDER_STATUS_KEYS.OPEN;
  }
  if (status === "PARTIALLY_FILLED") {
    return WORKSPACE_ORDER_STATUS_KEYS.PARTIALLY_FILLED;
  }
  return WORKSPACE_ORDER_STATUS_UNAVAILABLE_KEY;
}

export function workspaceReservationStatusKey(
  reservation: WorkspaceReservationLink | null,
): string {
  if (!reservation) {
    return WORKSPACE_RESERVATION_NONE_KEY;
  }
  if (reservation.status === "ACTIVE") {
    return WORKSPACE_RESERVATION_STATUS_KEYS.ACTIVE;
  }
  if (reservation.status === "RELEASED") {
    return WORKSPACE_RESERVATION_STATUS_KEYS.RELEASED;
  }
  if (reservation.status === "HELD_PENDING_SETTLEMENT") {
    return WORKSPACE_RESERVATION_STATUS_KEYS.HELD_PENDING_SETTLEMENT;
  }
  return WORKSPACE_RESERVATION_UNAVAILABLE_KEY;
}

export function workspaceTradeLifecycleKey(status: string): string {
  if (status === "MATCHED") {
    return WORKSPACE_LIFECYCLE_KEYS.MATCHED;
  }
  if (status === "CLEARING_READY") {
    return WORKSPACE_LIFECYCLE_KEYS.CLEARING_READY;
  }
  if (status === "AWAITING_DEVNET_SETTLEMENT") {
    return WORKSPACE_LIFECYCLE_KEYS.AWAITING_DEVNET_SETTLEMENT;
  }
  return WORKSPACE_LIFECYCLE_UNAVAILABLE_KEY;
}

export function workspaceOrderSideKey(side: string): string {
  if (side === "BUY") {
    return WORKSPACE_SIDE_BUY_KEY;
  }
  if (side === "SELL") {
    return WORKSPACE_SIDE_SELL_KEY;
  }
  return WORKSPACE_SIDE_UNAVAILABLE_KEY;
}

export function lifecycleClaimsSettlementFinality(status: string): boolean {
  return (SETTLED_OR_FINAL_CODES as readonly string[]).includes(status);
}

export interface WorkspaceEligibilityPresentation {
  readonly eligibility: EligibilityPresentation;
  readonly admission: NewOrderAdmissionPresentation;
  readonly cancellationIndependentOfEligibility: true;
}

export function presentWorkspaceEligibility(
  row: WorkspaceEligibilityRow,
): WorkspaceEligibilityPresentation {
  const eligibility = presentEligibilityExplanation(row.explanation);
  return {
    eligibility,
    admission: presentNewOrderAdmission({
      canSubmit: row.canSubmitNewOrder,
      hasParticipant: true,
      explanation: row.explanation,
    }),
    cancellationIndependentOfEligibility: true,
  };
}

export interface WorkspaceOrderPresentation {
  readonly statusKey: string;
  readonly sideKey: string;
  readonly reservationKey: string;
}

export function presentWorkspaceOrder(row: WorkspaceOrderRow): WorkspaceOrderPresentation {
  return {
    statusKey: workspaceOrderStatusKey(row.status),
    sideKey: workspaceOrderSideKey(row.side),
    reservationKey: workspaceReservationStatusKey(row.reservation),
  };
}

export interface WorkspaceExecutionPresentation {
  readonly lifecycleKey: string;
  readonly claimsSettlementFinality: false;
}

export function presentWorkspaceExecution(
  row: WorkspaceExecutionRow,
): WorkspaceExecutionPresentation {
  const lifecycleKey = workspaceTradeLifecycleKey(row.status);
  return {
    lifecycleKey,
    claimsSettlementFinality: false,
  };
}

export function allInvestorWorkspacePresentationKeys(): readonly string[] {
  return Object.freeze([
    ...Object.values(WORKSPACE_ORDER_STATUS_KEYS),
    ...Object.values(WORKSPACE_RESERVATION_STATUS_KEYS),
    ...Object.values(WORKSPACE_LIFECYCLE_KEYS),
    WORKSPACE_ORDER_STATUS_UNAVAILABLE_KEY,
    WORKSPACE_RESERVATION_NONE_KEY,
    WORKSPACE_RESERVATION_UNAVAILABLE_KEY,
    WORKSPACE_LIFECYCLE_UNAVAILABLE_KEY,
    WORKSPACE_SIDE_BUY_KEY,
    WORKSPACE_SIDE_SELL_KEY,
    WORKSPACE_SIDE_UNAVAILABLE_KEY,
  ]);
}
