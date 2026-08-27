import { NextResponse } from "next/server";
import { FIELD_DOCUMENT_TYPES, type FieldDocumentType } from "@/domain/origination";
import { requireActor } from "@/lib/auth/load-actor";
import { originationResponse } from "@/lib/origination/http";
import { originationService } from "@/services/origination-service";

export async function POST(request: Request) {
  try {
    const actor = await requireActor();
    const form = await request.formData();
    const fieldId = String(form.get("fieldId") ?? "");
    const documentType = String(form.get("documentType") ?? "");
    const replacesDocumentId = String(form.get("replacesDocumentId") ?? "") || null;
    const file = form.get("file");
    if (!(file instanceof File) || !fieldId || !FIELD_DOCUMENT_TYPES.includes(documentType as FieldDocumentType)) {
      return NextResponse.json({ error: "validation" }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const document = await originationService().uploadDocument(actor, {
      fieldId,
      documentType: documentType as FieldDocumentType,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes,
      replacesDocumentId,
    });
    return NextResponse.json({ document });
  } catch (error) {
    return originationResponse(error);
  }
}
