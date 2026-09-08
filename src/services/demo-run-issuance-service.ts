import "server-only";
import { createProductionDemoRunIssuer } from "@/data/demo-reset/postgres-run-issuer";
import { type ActorContext } from "@/domain/identity";
import {
  parseDemoRunIssuanceRequest,
  type DemoRunIssuer,
  type DemoRunIssuanceOutcome,
} from "@/domain/demo-run/issuance";
import { requireActor } from "@/lib/auth/load-actor";
import { resolveDemoResetRunContext } from "@/lib/demo-reset";
import { authorizeDemoResetDryRun } from "@/services/demo-reset-service";

/** Internal test/wiring seam. Authority and the issuer are never request data. */
export async function composeDemoRunIssuance(input: {
  actor: ActorContext;
  request: unknown;
  issuer: DemoRunIssuer;
}): Promise<DemoRunIssuanceOutcome> {
  // Reuse the full existing environment + principal policy, including production
  // denial priority. An invalid context reaches neither client creation nor RPC.
  const precondition = resolveDemoResetRunContext(authorizeDemoResetDryRun(input.actor));
  if (precondition.kind !== "READY") return { kind: "DENIED", refusal: precondition.refusal };
  const request = parseDemoRunIssuanceRequest(input.request);
  if (!request) return { kind: "INVALID_REQUEST" };
  try {
    return await input.issuer.issue(precondition.context, request);
  } catch {
    return { kind: "UNCONFIRMED" };
  }
}

const PRODUCTION_ISSUER = createProductionDemoRunIssuer();

/**
 * Explicit server capability, with no route, Server Action, UI or CLI in this
 * slice. The actor comes from the verified session, never from request data.
 * The only accepted caller values are a retry UUID and three business names.
 * Dry-run inspection has no dependency on this module and never calls it.
 */
export async function issueDemoDatasetV2Run(request: unknown): Promise<DemoRunIssuanceOutcome> {
  const actor = await requireActor();
  return composeDemoRunIssuance({ actor, request, issuer: PRODUCTION_ISSUER });
}
