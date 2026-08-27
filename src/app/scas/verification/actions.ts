"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  FIELD_EVIDENCE_KINDS,
  OriginationError,
  type FieldEvidenceKind,
} from "@/domain/origination";
import { requireScasVerifier } from "@/lib/auth/guard";
import { originationService } from "@/services/origination-service";

function bounce(caseId: string, error: unknown): never {
  if (error instanceof OriginationError) {
    redirect(`/scas/verification/${caseId}?error=${encodeURIComponent(error.code)}`);
  }
  throw error;
}

export async function assignReviewerAction(formData: FormData) {
  const actor = await requireScasVerifier();
  const caseId = String(formData.get("caseId") ?? "");
  const reviewer = String(formData.get("reviewerUserId") ?? "").trim() || null;
  try {
    await originationService().assignReviewer(actor, caseId, reviewer);
    revalidatePath(`/scas/verification/${caseId}`);
  } catch (error) {
    bounce(caseId, error);
  }
}

export async function acceptDocumentAction(formData: FormData) {
  const actor = await requireScasVerifier();
  const caseId = String(formData.get("caseId") ?? "");
  try {
    await originationService().acceptDocument(actor, String(formData.get("documentId") ?? ""));
    revalidatePath(`/scas/verification/${caseId}`);
  } catch (error) {
    bounce(caseId, error);
  }
}

export async function requestReplacementAction(formData: FormData) {
  const actor = await requireScasVerifier();
  const caseId = String(formData.get("caseId") ?? "");
  try {
    await originationService().requestDocumentReplacement(
      actor,
      String(formData.get("documentId") ?? ""),
      String(formData.get("comment") ?? ""),
    );
    revalidatePath(`/scas/verification/${caseId}`);
  } catch (error) {
    bounce(caseId, error);
  }
}

export async function recordCadastreAction(formData: FormData) {
  const actor = await requireScasVerifier();
  const caseId = String(formData.get("caseId") ?? "");
  const area = String(formData.get("registeredAreaHa") ?? "").trim();
  try {
    await originationService().recordCadastreVerification(actor, caseId, {
      cadastreNumber: String(formData.get("cadastreNumber") ?? ""),
      rightHolder: String(formData.get("rightHolder") ?? ""),
      rightType: String(formData.get("rightType") ?? ""),
      registeredAreaHa: area ? Number(area) : null,
      region: String(formData.get("region") ?? "") || null,
      district: String(formData.get("district") ?? "") || null,
      validityStatus: String(formData.get("validityStatus") ?? ""),
      sourceReference: String(formData.get("sourceReference") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });
    revalidatePath(`/scas/verification/${caseId}`);
  } catch (error) {
    bounce(caseId, error);
  }
}

export async function addEvidenceAction(formData: FormData) {
  const actor = await requireScasVerifier();
  const caseId = String(formData.get("caseId") ?? "");
  const kind = String(formData.get("kind") ?? "") as FieldEvidenceKind;
  const file = formData.get("file");
  try {
    if (!FIELD_EVIDENCE_KINDS.includes(kind)) {
      throw new OriginationError("validation");
    }
    let bytes: Uint8Array | undefined;
    let filename: string | undefined;
    let mimeType: string | undefined;
    if (file instanceof File && file.size > 0) {
      bytes = new Uint8Array(await file.arrayBuffer());
      filename = file.name;
      mimeType = file.type;
    }
    await originationService().addScasEvidence(actor, {
      caseId,
      kind,
      notes: String(formData.get("notes") ?? ""),
      imageryDate: String(formData.get("imageryDate") ?? "") || null,
      filename,
      mimeType,
      bytes,
    });
    revalidatePath(`/scas/verification/${caseId}`);
  } catch (error) {
    bounce(caseId, error);
  }
}

export async function sendCaseMessageAction(formData: FormData) {
  const actor = await requireScasVerifier();
  const caseId = String(formData.get("caseId") ?? "");
  try {
    await originationService().sendMessage(actor, {
      caseId,
      body: String(formData.get("body") ?? ""),
    });
    revalidatePath(`/scas/verification/${caseId}`);
  } catch (error) {
    bounce(caseId, error);
  }
}

export async function requestChangesAction(formData: FormData) {
  const actor = await requireScasVerifier();
  const caseId = String(formData.get("caseId") ?? "");
  try {
    await originationService().requestChanges(actor, caseId, String(formData.get("explanation") ?? ""));
    revalidatePath("/scas/verification");
    redirect(`/scas/verification/${caseId}`);
  } catch (error) {
    bounce(caseId, error);
  }
}

export async function rejectFieldAction(formData: FormData) {
  const actor = await requireScasVerifier();
  const caseId = String(formData.get("caseId") ?? "");
  try {
    await originationService().rejectField(actor, caseId, String(formData.get("reason") ?? ""));
    revalidatePath("/scas/verification");
    redirect(`/scas/verification/${caseId}`);
  } catch (error) {
    bounce(caseId, error);
  }
}

export async function approveFieldAction(formData: FormData) {
  const actor = await requireScasVerifier();
  const caseId = String(formData.get("caseId") ?? "");
  try {
    await originationService().approveField(actor, caseId);
    revalidatePath("/scas/verification");
    redirect(`/scas/verification/${caseId}`);
  } catch (error) {
    bounce(caseId, error);
  }
}
