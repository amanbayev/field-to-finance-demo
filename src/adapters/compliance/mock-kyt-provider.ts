import type { RiskBand } from "@/domain";
import { complianceRecords } from "@/data/mock/compliance";
import type { KytProvider } from "./types";

export class MockKytProvider implements KytProvider {
  getKytStatus(participantId: string): RiskBand {
    return (
      complianceRecords.find((record) => record.participantId === participantId)
        ?.kyt ?? "PENDING"
    );
  }
}
