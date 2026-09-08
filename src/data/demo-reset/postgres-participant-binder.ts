import "server-only";
import { createServiceRoleClient } from "@/lib/auth/supabase/admin";
import { parseDemoRunParticipantReceipt, type DemoRunParticipantBinder, type DemoRunParticipantResult } from "@/domain/demo-run/participant-binding";

export interface DemoRunParticipantRpcClient {
  rpc(fn: string, args: {
    p_operator_principal_user_id: string;
    p_environment_name: string;
    p_dataset_id: string;
    p_database_ref: string;
    p_request_id: string;
    p_producer_user_id: string;
    p_issuer_user_id: string;
    p_investor_user_id: string;
  }): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

const REFUSALS = new Map<string, Exclude<DemoRunParticipantResult["kind"], "BOUND">>([
  ["demo_participant_request_conflict", "REQUEST_CONFLICT"],
  ["demo_participant_run_changed", "RUN_CHANGED"],
  ["demo_participant_current_run_missing", "CURRENT_RUN_MISSING"],
  ["demo_participant_run_mismatch", "RUN_MISMATCH"],
  ["demo_participant_profile_unavailable", "PROFILE_UNAVAILABLE"],
]);

/** CURRENT lookup, receipt verification and every write happen in one RPC. */
export function createPostgresDemoRunParticipantBinder(input: {
  createClient: () => DemoRunParticipantRpcClient | null;
}): DemoRunParticipantBinder {
  return {
    async bind(context, request) {
      try {
        const client = input.createClient();
        if (!client) return { kind: "UNCONFIRMED" };
        const { data, error } = await client.rpc("demo_reset_bind_run_participants", {
          p_operator_principal_user_id: context.principalUserId,
          p_environment_name: context.environmentName,
          p_dataset_id: context.datasetId,
          p_database_ref: context.databaseRef,
          p_request_id: request.requestId,
          p_producer_user_id: request.producerUserId,
          p_issuer_user_id: request.issuerUserId,
          p_investor_user_id: request.investorUserId,
        });
        const refusal = error?.code === "P0001" ? REFUSALS.get(error.message ?? "") : undefined;
        if (refusal) return { kind: refusal };
        if (error) return { kind: "UNCONFIRMED" };
        const receipt = parseDemoRunParticipantReceipt(data, request);
        return receipt ? { kind: "BOUND", receipt } : { kind: "UNCONFIRMED" };
      } catch {
        // A lost response can follow a commit. Never claim rollback or retry with
        // a new key; the operator must retry this same command and assignment.
        return { kind: "UNCONFIRMED" };
      }
    },
  };
}

export function createProductionDemoRunParticipantBinder(): DemoRunParticipantBinder {
  return createPostgresDemoRunParticipantBinder({ createClient: createServiceRoleClient });
}
