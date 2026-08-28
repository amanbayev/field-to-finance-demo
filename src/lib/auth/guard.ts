import { forbidden, redirect, unauthorized } from "next/navigation";
import {
  actorCan,
  AuthorizationError,
  isOwnProducerWorkspace,
  type ActorContext,
  type Permission,
} from "@/domain/identity";
import { requireActor } from "@/lib/auth/load-actor";
import { isAuthConfigured } from "@/lib/auth/env";

async function loadAuthorizedActor(): Promise<ActorContext> {
  try {
    return await requireActor();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.code === "unauthenticated") {
        unauthorized();
      }
      if (error.code === "not_configured") {
        redirect("/login?reason=not_configured");
      }
      if (
        error.code === "suspended_user" ||
        error.code === "suspended_membership" ||
        error.code === "suspended_organization"
      ) {
        redirect(`/login?reason=${error.code}`);
      }
      if (error.code === "auth_unavailable") {
        redirect("/login?reason=auth_unavailable");
      }
      forbidden();
    }
    throw error;
  }
}

export async function requirePermission(...permissions: Permission[]) {
  const actor = await loadAuthorizedActor();
  if (!permissions.some((permission) => actorCan(actor, permission))) {
    forbidden();
  }
  return actor;
}

export async function requireAllPermissions(...permissions: Permission[]) {
  const actor = await loadAuthorizedActor();
  if (!permissions.every((permission) => actorCan(actor, permission))) {
    forbidden();
  }
  return actor;
}

export async function requireAnyPermission(permissions: Permission[]) {
  return requirePermission(...permissions);
}

export async function requireRegistrarOrRegulator() {
  const actor = await requirePermission("regulator.read", "issuance.manage");
  if (actorCan(actor, "regulator.read")) {
    return actor;
  }
  if (actorCan(actor, "issuance.manage") && actorCan(actor, "audit.read")) {
    return actor;
  }
  forbidden();
}

export async function requireOwnProducerWorkspace(options?: {
  manage?: boolean;
}) {
  const actor = await loadAuthorizedActor();
  if (!isOwnProducerWorkspace(actor)) {
    forbidden();
  }
  if (
    options?.manage &&
    !actorCan(actor, "fields.manage.own") &&
    !actorCan(actor, "contracts.manage.own")
  ) {
    forbidden();
  }
  return actor;
}

export async function requireScasVerifier() {
  const actor = await loadAuthorizedActor();
  if (
    actor.effective.organization?.type !== "SCAS" ||
    !actorCan(actor, "scas.verify")
  ) {
    forbidden();
  }
  return actor;
}

export async function requireIssuerOperator() {
  const actor = await loadAuthorizedActor();
  if (
    actor.effective.organization?.type !== "ISSUER" ||
    !actorCan(actor, "issuance.manage")
  ) {
    forbidden();
  }
  return actor;
}

export async function requireRegistrarIntake() {
  const actor = await loadAuthorizedActor();
  if (
    actor.effective.organization?.type !== "REGISTRAR" ||
    !actorCan(actor, "issuance.manage") ||
    !actorCan(actor, "audit.read")
  ) {
    forbidden();
  }
  return actor;
}

export function assertAuthConfigured() {
  if (!isAuthConfigured()) {
    redirect("/login?reason=not_configured");
  }
}
