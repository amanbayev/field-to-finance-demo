import type { ScasAttestation, ScasBid, ScasListing } from "@/domain";

export interface ScasProvider {
  listAttestations(): ScasAttestation[];
  listListings(): ScasListing[];
  listBids(): ScasBid[];
  getOperatorLabel(): string;
}
