import { auditEvents } from "@/data/mock/audit";
import { systemOverview } from "@/data/mock/system";
import type { AuditEvent, SystemOverview } from "@/domain";

export function getSystemOverview(): SystemOverview {
  return systemOverview;
}

export function listAuditEvents(): AuditEvent[] {
  return auditEvents;
}
