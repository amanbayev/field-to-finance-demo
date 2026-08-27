export interface NormalizedCadastralRecord {
  cadastreNumber: string;
  rightHolder: string;
  rightType: string;
  registeredAreaHa: number | null;
  region: string | null;
  district: string | null;
  validityStatus: string;
  sourceReference: string;
  notes: string;
  providerId: string;
}

export interface CadastreProvider {
  readonly id: string;
  normalizeManualEntry(
    input: Omit<NormalizedCadastralRecord, "providerId">,
  ): NormalizedCadastralRecord;
}

export class ManualScasCadastreProvider implements CadastreProvider {
  readonly id = "manual-scas";

  normalizeManualEntry(
    input: Omit<NormalizedCadastralRecord, "providerId">,
  ): NormalizedCadastralRecord {
    return { ...input, providerId: this.id };
  }
}

/**
 * Reserved for a later national cadastre connection. O1 must not call it.
 */
export class NationalLandCadastreProvider implements CadastreProvider {
  readonly id = "national-land-cadastre";

  normalizeManualEntry(
    _input?: Omit<NormalizedCadastralRecord, "providerId">,
  ): NormalizedCadastralRecord {
    void _input;
    throw new Error("National land cadastre is not connected in origination O1.");
  }
}

export function defaultCadastreProvider(): CadastreProvider {
  return new ManualScasCadastreProvider();
}
