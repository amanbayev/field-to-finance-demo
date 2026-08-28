import { DEMO_ORGANIZATIONS } from "@/data/identity/demo-catalog";
import type { OrganizationRecord } from "@/domain/identity";

export function listPermittedIssuerOrganizations(): OrganizationRecord[] {
  return DEMO_ORGANIZATIONS.filter(
    (organization) => organization.type === "ISSUER" && organization.status === "ACTIVE",
  );
}

export function isPermittedIssuerOrganizationId(id: string | null | undefined): boolean {
  if (!id) {
    return false;
  }
  return listPermittedIssuerOrganizations().some((organization) => organization.id === id);
}
