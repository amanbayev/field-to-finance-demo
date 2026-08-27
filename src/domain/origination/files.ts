import {
  ALLOWED_FIELD_MIME_TYPES,
  MAX_FIELD_FILE_BYTES,
  type AllowedFieldMimeType,
} from "./types";
import { OriginationError } from "./types";

const MIME_EXTENSIONS: Record<AllowedFieldMimeType, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

export function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  if (index < 0) {
    return "";
  }
  return filename.slice(index).toLowerCase();
}

export function assertAllowedUpload(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): asserts input is {
  filename: string;
  mimeType: AllowedFieldMimeType;
  sizeBytes: number;
} {
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_FIELD_FILE_BYTES) {
    throw new OriginationError("validation", "File size is outside the allowed range.");
  }
  if (!ALLOWED_FIELD_MIME_TYPES.includes(input.mimeType as AllowedFieldMimeType)) {
    throw new OriginationError("validation", "Only PDF, JPEG and PNG are accepted.");
  }
  const allowed = MIME_EXTENSIONS[input.mimeType as AllowedFieldMimeType];
  const extension = extensionOf(input.filename);
  if (!allowed.includes(extension)) {
    throw new OriginationError("validation", "File extension does not match the declared type.");
  }
}

export function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim().replace(/[/\\]+/g, "-");
  const safe = trimmed.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 180);
  return safe || "document";
}

export function fieldDocumentObjectPath(input: {
  organizationId: string;
  fieldId: string;
  submissionId: string;
  documentId: string;
  version: number;
  filename: string;
}): string {
  return [
    "org",
    input.organizationId,
    "fields",
    input.fieldId,
    "submissions",
    input.submissionId,
    "documents",
    input.documentId,
    `v${input.version}`,
    sanitizeFilename(input.filename),
  ].join("/");
}

export function scasEvidenceObjectPath(input: {
  organizationId: string;
  caseId: string;
  evidenceId: string;
  filename: string;
}): string {
  return [
    "org",
    input.organizationId,
    "cases",
    input.caseId,
    "evidence",
    input.evidenceId,
    sanitizeFilename(input.filename),
  ].join("/");
}
