"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OriginationError } from "@/domain/origination";
import { requireOwnProducerWorkspace } from "@/lib/auth/guard";
import { originationService } from "@/services/origination-service";

function declaredFrom(formData: FormData) {
  const area = String(formData.get("declaredAreaHa") ?? "").trim();
  return {
    name: String(formData.get("name") ?? ""),
    season: Number(formData.get("season") ?? 2027),
    crop: String(formData.get("crop") ?? ""),
    cadastreNumber: String(formData.get("cadastreNumber") ?? ""),
    declaredAreaHa: area ? Number(area) : null,
    region: String(formData.get("region") ?? "") || null,
    district: String(formData.get("district") ?? "") || null,
  };
}

function fail(error: unknown): never {
  if (error instanceof OriginationError) {
    redirect(`/fields/new?error=${encodeURIComponent(error.code)}`);
  }
  throw error;
}

export async function createFieldAction(formData: FormData) {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  try {
    const field = await originationService().createDraft(
      actor,
      declaredFrom(formData),
      String(formData.get("createRequestId") ?? ""),
    );
    revalidatePath("/fields");
    redirect(`/fields/${field.publicId}?tab=documents`);
  } catch (error) {
    if (error instanceof OriginationError) {
      fail(error);
    }
    throw error;
  }
}

export async function updateFieldAction(formData: FormData) {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const fieldId = String(formData.get("fieldId") ?? "");
  try {
    const field = await originationService().updateDraft(actor, fieldId, declaredFrom(formData));
    revalidatePath(`/fields/${field.publicId}`);
    redirect(`/fields/${field.publicId}?tab=overview`);
  } catch (error) {
    if (error instanceof OriginationError) {
      redirect(`/fields/${fieldId}?error=${encodeURIComponent(error.code)}`);
    }
    throw error;
  }
}

export async function submitFieldAction(formData: FormData) {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const fieldId = String(formData.get("fieldId") ?? "");
  try {
    const result = await originationService().submitToScas(actor, fieldId);
    revalidatePath("/fields");
    redirect(`/fields/${result.field.publicId}?tab=verification`);
  } catch (error) {
    if (error instanceof OriginationError) {
      redirect(`/fields/${fieldId}?error=${encodeURIComponent(error.code)}`);
    }
    throw error;
  }
}

export async function resubmitFieldAction(formData: FormData) {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const fieldId = String(formData.get("fieldId") ?? "");
  try {
    const result = await originationService().resubmit(actor, fieldId);
    revalidatePath("/fields");
    redirect(`/fields/${result.field.publicId}?tab=verification`);
  } catch (error) {
    if (error instanceof OriginationError) {
      redirect(`/fields/${fieldId}?error=${encodeURIComponent(error.code)}`);
    }
    throw error;
  }
}

export async function removeDraftDocumentAction(formData: FormData) {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const fieldId = String(formData.get("fieldId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  await originationService().removeDraftDocument(actor, documentId);
  revalidatePath(`/fields/${fieldId}`);
}

export async function sendFieldMessageAction(formData: FormData) {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const caseId = String(formData.get("caseId") ?? "");
  const fieldId = String(formData.get("fieldId") ?? "");
  await originationService().sendMessage(actor, {
    caseId,
    body: String(formData.get("body") ?? ""),
  });
  revalidatePath(`/fields/${fieldId}`);
}

export async function confirmDacTermsAction(formData: FormData) {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const dacId = String(formData.get("dacId") ?? "");
  const fieldId = String(formData.get("fieldId") ?? "");
  try {
    await originationService().confirmDacAsProducer(actor, dacId);
    revalidatePath(`/fields/${fieldId}`);
    revalidatePath("/issuer/dacs");
    revalidatePath("/scas/dacs");
  } catch (error) {
    if (error instanceof OriginationError) {
      redirect(`/fields/${fieldId}?tab=contracts&error=${encodeURIComponent(error.code)}`);
    }
    throw error;
  }
}

export async function returnDacTermsAction(formData: FormData) {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const dacId = String(formData.get("dacId") ?? "");
  const fieldId = String(formData.get("fieldId") ?? "");
  try {
    await originationService().returnDacAsProducer(actor, dacId, String(formData.get("reason") ?? ""));
    revalidatePath(`/fields/${fieldId}`);
    revalidatePath("/scas/dacs");
  } catch (error) {
    if (error instanceof OriginationError) {
      redirect(`/fields/${fieldId}?tab=contracts&error=${encodeURIComponent(error.code)}`);
    }
    throw error;
  }
}
