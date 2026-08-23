import { Connection, PublicKey } from "@solana/web3.js";
import { recordedPlacementProof } from "@/adapters/blockchain/solana/recorded-placement";
import { getPublicEnv } from "@/lib/public-env";
import { GRAIN_DESK_ID, REGISTRAR_ID, STEPPE_CAPITAL_ID } from "@/domain/market-core";

export type ReconciliationSource = "LIVE_RPC" | "CACHED_PROOF";

export interface WheatReconciliationRow {
  participantId: string;
  holderName: string;
  registeredOwned: number;
  chainBalance: number | null;
  chainAccountStatus: "FOUND" | "MISSING" | "NOT_MAPPED" | "UNAVAILABLE";
  ata: string | null;
  pendingIn: number;
  pendingOut: number;
  exception: boolean;
}

export interface WheatReconciliationReport {
  ok: boolean;
  source: ReconciliationSource;
  chainTruth: boolean;
  slot: number | null;
  observedAt: string;
  rpcUrl: string;
  rows: WheatReconciliationRow[];
  mintedTotal: number | null;
  error?: string;
}

interface RegisteredRow {
  participantId: string;
  holderName: string;
  registeredOwned: number;
  pendingIn: number;
  pendingOut: number;
}

async function readAtaBalance(
  connection: Connection,
  ata: string,
): Promise<{ amount: number | null; status: "FOUND" | "MISSING" | "UNAVAILABLE" }> {
  try {
    const pubkey = new PublicKey(ata);
    const account = await connection.getAccountInfo(pubkey, "confirmed");
    if (!account) {
      return { amount: null, status: "MISSING" };
    }
    const balance = await connection.getTokenAccountBalance(pubkey, "confirmed");
    return { amount: Number(balance.value.amount), status: "FOUND" };
  } catch {
    return { amount: null, status: "UNAVAILABLE" };
  }
}

export async function loadLiveWheatReconciliation(
  registered: readonly RegisteredRow[],
): Promise<WheatReconciliationReport> {
  const env = getPublicEnv();
  const proof = recordedPlacementProof();
  const observedAt = new Date().toISOString();
  const connection = new Connection(env.solanaRpcUrl, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });

  const registrarAta = proof.registrarInstrumentAta ?? null;
  const steppeAta = proof.investorInstrumentAta ?? null;
  const mint = proof.instrumentMint ?? null;

  try {
    const [slot, registrar, steppe, mintSupply] = await Promise.all([
      connection.getSlot("confirmed"),
      registrarAta
        ? readAtaBalance(connection, registrarAta)
        : Promise.resolve({ amount: null, status: "MISSING" as const }),
      steppeAta
        ? readAtaBalance(connection, steppeAta)
        : Promise.resolve({ amount: null, status: "MISSING" as const }),
      mint
        ? connection.getTokenSupply(new PublicKey(mint), "confirmed")
        : Promise.resolve(null),
    ]);

    const byParticipant: Record<string, { amount: number | null; status: WheatReconciliationRow["chainAccountStatus"]; ata: string | null }> =
      {
        [REGISTRAR_ID]: {
          amount: registrar.amount,
          status: registrar.status,
          ata: registrarAta,
        },
        [STEPPE_CAPITAL_ID]: {
          amount: steppe.amount,
          status: steppe.status,
          ata: steppeAta,
        },
        [GRAIN_DESK_ID]: {
          amount: null,
          status: "NOT_MAPPED",
          ata: null,
        },
      };

    const rows: WheatReconciliationRow[] = registered.map((row) => {
      const chain = byParticipant[row.participantId] ?? {
        amount: null,
        status: "NOT_MAPPED" as const,
        ata: null,
      };
      const chainBalance = chain.status === "FOUND" ? chain.amount : null;
      const exception =
        chain.status === "FOUND"
          ? Number(chain.amount ?? 0) !== row.registeredOwned
          : chain.status === "NOT_MAPPED"
            ? row.registeredOwned !== 0
            : true;
      return {
        participantId: row.participantId,
        holderName: row.holderName,
        registeredOwned: row.registeredOwned,
        chainBalance,
        chainAccountStatus: chain.status,
        ata: chain.ata,
        pendingIn: row.pendingIn,
        pendingOut: row.pendingOut,
        exception,
      };
    });

    return {
      ok: true,
      source: "LIVE_RPC",
      chainTruth: true,
      slot,
      observedAt,
      rpcUrl: env.solanaRpcUrl,
      mintedTotal: mintSupply ? Number(mintSupply.value.amount) : null,
      rows,
    };
  } catch (error) {
    return {
      ok: false,
      source: "CACHED_PROOF",
      chainTruth: false,
      slot: null,
      observedAt,
      rpcUrl: env.solanaRpcUrl,
      mintedTotal: null,
      rows: registered.map((row) => ({
        participantId: row.participantId,
        holderName: row.holderName,
        registeredOwned: row.registeredOwned,
        chainBalance: null,
        chainAccountStatus: "UNAVAILABLE",
        ata: null,
        pendingIn: row.pendingIn,
        pendingOut: row.pendingOut,
        exception: true,
      })),
      error: error instanceof Error ? error.message : "LIVE_RPC_UNAVAILABLE",
    };
  }
}
