import type { CheckResult, RiskBand } from "@/domain";

export interface KycProvider {
  getKycStatus(participantId: string): CheckResult;
}

export interface KybProvider {
  getKybStatus(participantId: string): CheckResult;
}

export interface KytProvider {
  getKytStatus(participantId: string): RiskBand;
}
