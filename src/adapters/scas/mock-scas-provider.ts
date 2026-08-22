import { scasAttestations, scasOperatorLabel } from "@/data/mock/scas";
import { scasBids, scasListings } from "@/data/mock/scas-matching";
import type { ScasAttestation, ScasBid, ScasListing } from "@/domain";
import type { ScasProvider } from "./types";

export class MockScasProvider implements ScasProvider {
  listAttestations(): ScasAttestation[] {
    return scasAttestations;
  }

  listListings(): ScasListing[] {
    return scasListings;
  }

  listBids(): ScasBid[] {
    return scasBids;
  }

  getOperatorLabel(): string {
    return scasOperatorLabel;
  }
}
