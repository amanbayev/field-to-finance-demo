export function originationFieldPath(publicId: string) {
  return `/fields/${publicId}`;
}

export function demonstratorContractPath(contractId: string) {
  return `/contracts/${contractId}`;
}

export function isDemonstratorContractId(id: string) {
  return id.startsWith("DAC-");
}
