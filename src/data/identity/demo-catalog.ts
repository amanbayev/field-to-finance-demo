import type {
  DemoPersonaRecord,
  OrganizationRecord,
  PersonaGroup,
  PlatformRoleId,
} from "@/domain/identity/types";
import { recordedPlacementProof } from "@/adapters/blockchain/solana/recorded-placement";

/**
 * Application-level mapping from demo organizations to existing Phase 2/4
 * business identifiers. Does not recreate blockchain records.
 */
export const PRODUCER_REF_TO_CONTRACT_PRODUCER_ID: Record<string, string> = {
  "PRODUCER-0001": "prd-akmola-agro",
  "PRODUCER-0002": "prd-kostanay-grain",
  "PRODUCER-0003": "prd-north-steppe",
  "PRODUCER-0004": "prd-pavlodar-harvest",
};

export const WHEAT_CONTRACT_IDS = [
  "DAC-2027-0001",
  "DAC-2027-0002",
  "DAC-2027-0003",
  "DAC-2027-0004",
] as const;

export const DEMO_ORGANIZATIONS: OrganizationRecord[] = [
  {
    id: "11111111-1111-4111-8111-111111111001",
    slug: "field-to-finance",
    name: "Field to Finance",
    type: "PLATFORM",
    status: "ACTIVE",
  },
  {
    id: "11111111-1111-4111-8111-111111111002",
    slug: "regulator",
    name: "Регулирующий орган",
    type: "REGULATOR",
    status: "ACTIVE",
  },
  {
    id: "11111111-1111-4111-8111-111111111003",
    slug: "agricultural-registrar",
    name: "Аграрный регистратор",
    type: "REGISTRAR",
    status: "ACTIVE",
  },
  {
    id: "11111111-1111-4111-8111-111111111004",
    slug: "scas",
    name: "СЦАС",
    type: "SCAS",
    status: "ACTIVE",
  },
  {
    id: "11111111-1111-4111-8111-111111111005",
    slug: "akmola-agro",
    name: "Akmola Agro LLP",
    type: "PRODUCER",
    status: "ACTIVE",
    externalProducerRef: "PRODUCER-0001",
  },
  {
    id: "11111111-1111-4111-8111-111111111006",
    slug: "steppe-grain",
    name: "Steppe Grain LLP",
    type: "PRODUCER",
    status: "ACTIVE",
    externalProducerRef: "PRODUCER-0002",
  },
  {
    id: "11111111-1111-4111-8111-111111111007",
    slug: "north-fields",
    name: "North Fields LLP",
    type: "PRODUCER",
    status: "ACTIVE",
    externalProducerRef: "PRODUCER-0003",
  },
  {
    id: "11111111-1111-4111-8111-111111111008",
    slug: "saryarka-agro",
    name: "Saryarka Agro LLP",
    type: "PRODUCER",
    status: "ACTIVE",
    externalProducerRef: "PRODUCER-0004",
  },
  {
    id: "11111111-1111-4111-8111-111111111009",
    slug: "agro-issuer",
    name: "Agro Issuer",
    type: "ISSUER",
    status: "ACTIVE",
  },
  {
    id: "11111111-1111-4111-8111-111111111010",
    slug: "steppe-capital",
    name: "Steppe Capital",
    type: "INVESTMENT_FUND",
    status: "ACTIVE",
    externalInvestorRef: "INVESTOR-0001",
  },
  {
    id: "11111111-1111-4111-8111-111111111011",
    slug: "grain-desk",
    name: "Grain Desk",
    type: "TRADING_FIRM",
    status: "ACTIVE",
  },
  {
    id: "11111111-1111-4111-8111-111111111012",
    slug: "commodity-desk",
    name: "Commodity Desk",
    type: "TRADING_FIRM",
    status: "ACTIVE",
  },
  {
    id: "11111111-1111-4111-8111-111111111013",
    slug: "compliance-provider",
    name: "Compliance Provider",
    type: "COMPLIANCE_PROVIDER",
    status: "ACTIVE",
  },
];

interface PersonaSeed {
  id: string;
  displayName: string;
  groupKey: PersonaGroup;
  organizationSlug: string;
  roleId: PlatformRoleId;
}

const PERSONA_SEEDS: PersonaSeed[] = [
  {
    id: "DEMO-ADMIN-001",
    displayName: "Администратор платформы",
    groupKey: "system",
    organizationSlug: "field-to-finance",
    roleId: "SYSTEM_ADMIN",
  },
  {
    id: "DEMO-REGULATOR-001",
    displayName: "Регулятор",
    groupKey: "control",
    organizationSlug: "regulator",
    roleId: "REGULATOR",
  },
  {
    id: "DEMO-REGISTRAR-001",
    displayName: "Регистратор — сотрудник 1",
    groupKey: "control",
    organizationSlug: "agricultural-registrar",
    roleId: "REGISTRAR_OPERATOR",
  },
  {
    id: "DEMO-SCAS-001",
    displayName: "СЦАС — сотрудник 1",
    groupKey: "control",
    organizationSlug: "scas",
    roleId: "SCAS_OPERATOR",
  },
  {
    id: "DEMO-COMPLIANCE-001",
    displayName: "Комплаенс — сотрудник 1",
    groupKey: "control",
    organizationSlug: "compliance-provider",
    roleId: "COMPLIANCE_OFFICER",
  },
  {
    id: "DEMO-FARM-001",
    displayName: "Фермер 1 — Akmola Agro LLP",
    groupKey: "agro",
    organizationSlug: "akmola-agro",
    roleId: "PRODUCER_ADMIN",
  },
  {
    id: "DEMO-FARM-002",
    displayName: "Хозяйство 2 — Steppe Grain LLP",
    groupKey: "agro",
    organizationSlug: "steppe-grain",
    roleId: "PRODUCER_ADMIN",
  },
  {
    id: "DEMO-FARM-003",
    displayName: "Хозяйство 3 — North Fields LLP",
    groupKey: "agro",
    organizationSlug: "north-fields",
    roleId: "PRODUCER_ADMIN",
  },
  {
    id: "DEMO-FARM-004",
    displayName: "Хозяйство 4 — Saryarka Agro LLP",
    groupKey: "agro",
    organizationSlug: "saryarka-agro",
    roleId: "PRODUCER_ADMIN",
  },
  {
    id: "DEMO-ISSUER-001",
    displayName: "Эмитент — Agro Issuer",
    groupKey: "agro",
    organizationSlug: "agro-issuer",
    roleId: "ISSUER_OPERATOR",
  },
  {
    id: "DEMO-FUND-001",
    displayName: "Инвестфонд 1 — Steppe Capital",
    groupKey: "market",
    organizationSlug: "steppe-capital",
    roleId: "INVESTOR",
  },
  {
    id: "DEMO-TRADER-001",
    displayName: "Трейдер 1 — Grain Desk",
    groupKey: "market",
    organizationSlug: "grain-desk",
    roleId: "TRADER",
  },
  {
    id: "DEMO-TRADER-002",
    displayName: "Трейдер 2 — Commodity Desk",
    groupKey: "market",
    organizationSlug: "commodity-desk",
    roleId: "TRADER",
  },
];

function orgBySlug(slug: string): OrganizationRecord {
  const org = DEMO_ORGANIZATIONS.find((item) => item.slug === slug);
  if (!org) {
    throw new Error(`Demo organization ${slug} is missing.`);
  }
  return org;
}

export function demoPersonas(): DemoPersonaRecord[] {
  const placement = recordedPlacementProof();
  return PERSONA_SEEDS.map((seed) => {
    const organization = orgBySlug(seed.organizationSlug);
    const isFund = seed.id === "DEMO-FUND-001";
    return {
      id: seed.id,
      displayName: seed.displayName,
      groupKey: seed.groupKey,
      organizationId: organization.id,
      roleId: seed.roleId,
      status: "ACTIVE",
      externalProducerRef: organization.externalProducerRef,
      externalInvestorRef: organization.externalInvestorRef,
      walletAddress: isFund ? placement.investorWallet : null,
      investorAta: isFund ? placement.investorInstrumentAta : null,
    };
  });
}

export function demoPersonaById(id: string): DemoPersonaRecord | undefined {
  return demoPersonas().find((persona) => persona.id === id);
}

export function organizationById(id: string): OrganizationRecord | undefined {
  return DEMO_ORGANIZATIONS.find((org) => org.id === id);
}

export function producerAppIdFromRef(ref: string | null | undefined): string | null {
  if (!ref) {
    return null;
  }
  return PRODUCER_REF_TO_CONTRACT_PRODUCER_ID[ref] ?? null;
}
