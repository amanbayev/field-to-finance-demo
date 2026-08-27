import type { PlatformRoleId } from "@/domain/identity";

export type KenBurnsOrigin = "center" | "left" | "right" | "bottom";

export interface RoleStageMedia {
  src: string;
  position: string;
  kenBurnsOrigin: KenBurnsOrigin;
  altKey: "photoAltAdmin" | "photoAltProducer" | "photoAltScas" | "photoAltCompliance" | "photoAltRegistrar" | "photoAltRegulator" | "photoAltInvestor" | "photoAltIssuer" | "photoAltTrader";
}

export const ROLE_STAGE_MEDIA: Record<PlatformRoleId, RoleStageMedia> = {
  SYSTEM_ADMIN: {
    src: "/media/grain-kernel-macro.png",
    position: "center",
    kenBurnsOrigin: "center",
    altKey: "photoAltAdmin",
  },
  PRODUCER_ADMIN: {
    src: "/media/hero-harvest-dusk.png",
    position: "center bottom",
    kenBurnsOrigin: "bottom",
    altKey: "photoAltProducer",
  },
  SCAS_OPERATOR: {
    src: "/media/role-scas-contours.png",
    position: "center",
    kenBurnsOrigin: "bottom",
    altKey: "photoAltScas",
  },
  COMPLIANCE_OFFICER: {
    src: "/media/role-compliance-seal.png",
    position: "left center",
    kenBurnsOrigin: "left",
    altKey: "photoAltCompliance",
  },
  REGISTRAR_OPERATOR: {
    src: "/media/role-registrar-sacks.png",
    position: "center",
    kenBurnsOrigin: "right",
    altKey: "photoAltRegistrar",
  },
  REGULATOR: {
    src: "/media/role-regulator-steppe.png",
    position: "center top",
    kenBurnsOrigin: "center",
    altKey: "photoAltRegulator",
  },
  INVESTOR: {
    src: "/media/role-investor-hopper.png",
    position: "center",
    kenBurnsOrigin: "center",
    altKey: "photoAltInvestor",
  },
  ISSUER_OPERATOR: {
    src: "/media/role-issuer-stream.png",
    position: "center",
    kenBurnsOrigin: "left",
    altKey: "photoAltIssuer",
  },
  TRADER: {
    src: "/media/empty-silo-light.png",
    position: "center",
    kenBurnsOrigin: "center",
    altKey: "photoAltTrader",
  },
};

export function stageMediaForRole(role: PlatformRoleId): RoleStageMedia {
  return ROLE_STAGE_MEDIA[role];
}
