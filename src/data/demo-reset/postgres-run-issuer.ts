import "server-only";
import { createServiceRoleClient } from "@/lib/auth/supabase/admin";
import { parseDemoRunIssuanceReceipt, type DemoRunIssuer } from "@/domain/demo-run/issuance";

export interface DemoRunIssuanceRpcClient {
  rpc(fn: string, args: {
    p_operator_principal_user_id: string;
    p_environment_name: string;
    p_dataset_id: string;
    p_database_ref: string;
    p_request_id: string;
    p_organization_names: { producer: string; issuer: string; investor: string };
  }): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

/** One RPC, one transaction. No organization lookup or separate client writes. */
export function createPostgresDemoRunIssuer(input: {
  createClient: () => DemoRunIssuanceRpcClient | null;
}): DemoRunIssuer {
  return {
    async issue(context, request) {
      try {
        const client = input.createClient();
        if (!client) return { kind: "UNCONFIRMED" };
        const { data, error } = await client.rpc("demo_reset_issue_run", {
          p_operator_principal_user_id: context.principalUserId,
          p_environment_name: context.environmentName,
          p_dataset_id: context.datasetId,
          p_database_ref: context.databaseRef,
          p_request_id: request.issuanceRequestId,
          p_organization_names: request.organizationNames,
        });
        if (error?.code === "P0001" && error.message === "demo_run_request_conflict") {
          return { kind: "REQUEST_CONFLICT" };
        }
        if (error) return { kind: "UNCONFIRMED" };
        const receipt = parseDemoRunIssuanceReceipt(data, request.issuanceRequestId);
        return receipt ? { kind: "ISSUED", receipt } : { kind: "UNCONFIRMED" };
      } catch {
        // Never claim rollback from an HTTP error, or retry with a fresh ID.
        return { kind: "UNCONFIRMED" };
      }
    },
  };
}

export function createProductionDemoRunIssuer(): DemoRunIssuer {
  return createPostgresDemoRunIssuer({ createClient: createServiceRoleClient });
}
