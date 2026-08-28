import type { OrganizationRecord } from "@/domain/identity";

export function isActiveIssuerOrganization(
  organization: OrganizationRecord | null | undefined,
): boolean {
  return organization?.type === "ISSUER" && organization.status === "ACTIVE";
}
