import "server-only";
import { createProductionDemoRunParticipantBinder } from "@/data/demo-reset/postgres-participant-binder";
import type { ActorContext } from "@/domain/identity";
import { parseDemoRunParticipantRequest, type DemoRunParticipantBinder, type DemoRunParticipantOutcome } from "@/domain/demo-run/participant-binding";
import { requireActor } from "@/lib/auth/load-actor";
import { resolveDemoResetRunContext } from "@/lib/demo-reset";
import { authorizeDemoResetDryRun } from "@/services/demo-reset-service";

/** Internal test/wiring seam, never a handler accepting authority from a request. */
export async function composeDemoRunParticipantBinding(input: {
  actor: ActorContext;
  request: unknown;
  binder: DemoRunParticipantBinder;
}): Promise<DemoRunParticipantOutcome> {
  const precondition = resolveDemoResetRunContext(authorizeDemoResetDryRun(input.actor));
  if (precondition.kind !== "READY") return { kind: "DENIED", refusal: precondition.refusal };
  const request = parseDemoRunParticipantRequest(input.request);
  if (!request) return { kind: "INVALID_REQUEST" };
  try {
    return await input.binder.bind(precondition.context, request);
  } catch {
    return { kind: "UNCONFIRMED" };
  }
}

const PRODUCTION_BINDER = createProductionDemoRunParticipantBinder();

/** Explicit server capability only. No route, Server Action, UI or signup flow. */
export async function bindDemoDatasetV2RunParticipants(request: unknown): Promise<DemoRunParticipantOutcome> {
  const actor = await requireActor();
  return composeDemoRunParticipantBinding({ actor, request, binder: PRODUCTION_BINDER });
}
