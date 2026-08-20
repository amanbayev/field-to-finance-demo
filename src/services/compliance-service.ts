import { participants } from "@/data/mock/participants";
import { complianceRecords } from "@/data/mock/compliance";
import { kybProvider, kycProvider, kytProvider } from "@/services/providers";
import type { ComplianceRecord, Participant } from "@/domain";

export interface ParticipantCompliance {
  participant: Participant;
  record: ComplianceRecord;
  liveKyc: ReturnType<typeof kycProvider.getKycStatus>;
  liveKyb: ReturnType<typeof kybProvider.getKybStatus>;
  liveKyt: ReturnType<typeof kytProvider.getKytStatus>;
}

export function listParticipantCompliance(): ParticipantCompliance[] {
  return participants.map((participant) => {
    const record = complianceRecords.find(
      (item) => item.participantId === participant.id,
    );
    if (!record) {
      throw new Error(`Compliance record missing for ${participant.id}.`);
    }

    return {
      participant,
      record,
      liveKyc: kycProvider.getKycStatus(participant.id),
      liveKyb: kybProvider.getKybStatus(participant.id),
      liveKyt: kytProvider.getKytStatus(participant.id),
    };
  });
}

export const complianceControls = [
  "KYC",
  "KYB",
  "KYT",
  "Wallet Ownership",
  "Sanctions Screening",
  "PEP Screening",
  "Participant Eligibility",
] as const;
