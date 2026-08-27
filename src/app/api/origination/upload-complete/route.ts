import { NextResponse } from "next/server";
import { FIELD_DOCUMENT_TYPES, type FieldDocumentType } from "@/domain/origination";
import { requireActor } from "@/lib/auth/load-actor";
import { originationResponse } from "@/lib/origination/http";
import { originationService } from "@/services/origination-service";

export async function POST(request: Request) {
  try {
    const actor = await requireActor();
    const body = (await request.json()) as {
      fieldId?: string;
      documentId?: string;
      documentType?: string;
      filename?: string;
      mimeType?: string;
      objectPath?: string;
      version?: number;
      replacesDocumentId?: string | null;
    };
    if (
      !body.fieldId ||
      !body.documentId ||
      !body.filename ||
      !body.mimeType ||
      !body.objectPath ||
      !body.version ||
      !FIELD_DOCUMENT_TYPES.includes(body.documentType as FieldDocumentType)
    ) {
      return NextResponse.json({ error: "validation" }, { status: 400 });
    }
    const document = await originationService().commitDirectUpload(actor, {
      fieldId: body.fieldId,
      documentId: body.documentId,
      documentType: body.documentType as FieldDocumentType,
      filename: body.filename,
      mimeType: body.mimeType,
      objectPath: body.objectPath,
      version: body.version,
      replacesDocumentId: body.replacesDocumentId,
    });
    return NextResponse.json({ document });
  } catch (error) {
    return originationResponse(error);
  }
}
