import { auditEvents } from "@/data/mock/audit";
import { systemOverview } from "@/data/mock/system";
import type { AuditEvent, SystemOverview } from "@/domain";

export function getSystemOverview(): SystemOverview {
  return systemOverview;
}

export function listAuditEvents(): AuditEvent[] {
  return auditEvents;
}

export const regulatorTopics = [
  "Asset provenance",
  "Contract verification",
  "Contract pool",
  "Producer scoring",
  "Satellite monitoring",
  "Insurance status",
  "Haircut calculation",
  "Contract coverage",
  "Token supply",
  "Compliance status",
  "Audit trail",
] as const;
