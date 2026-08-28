import type { ActorContext } from "@/domain/identity";
import {
  isIssuerOperator,
  isProducerOperator,
  isRegistrarIntakeOperator,
  isScasVerifier,
} from "@/domain/origination/access";
import { contracts as demonstratorContracts } from "@/data/mock/contracts";

const DEMONSTRATOR_CONTRACT_IDS = new Set(demonstratorContracts.map((item) => item.id));

export function originationFieldPath(publicId: string) {
  return `/fields/${publicId}`;
}

export function demonstratorContractPath(contractId: string) {
  return `/contracts/${contractId}`;
}

export function isDemonstratorContractId(id: string) {
  return DEMONSTRATOR_CONTRACT_IDS.has(id);
}

export function originationDacDeskPath(publicId: string) {
  return `/scas/dacs/${publicId}`;
}

export function registrarIntakePath(publicId: string) {
  return `/registrar/intake/${publicId}`;
}

export function issuerDacPath(publicId: string) {
  return `/issuer/dacs/${publicId}`;
}

export function producerDacStatusPath(fieldPublicId: string) {
  return `/fields/${fieldPublicId}?tab=contracts`;
}

export function liveOriginatedDacHref(
  actor: ActorContext,
  dacPublicId: string,
  fieldPublicId: string,
) {
  if (isScasVerifier(actor)) {
    return originationDacDeskPath(dacPublicId);
  }
  if (isRegistrarIntakeOperator(actor)) {
    return registrarIntakePath(dacPublicId);
  }
  if (isIssuerOperator(actor)) {
    return issuerDacPath(dacPublicId);
  }
  if (isProducerOperator(actor) && fieldPublicId) {
    return producerDacStatusPath(fieldPublicId);
  }
  return undefined;
}
