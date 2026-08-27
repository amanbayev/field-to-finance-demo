import type { FieldDocumentRecord, FieldVerificationEvidenceRecord } from "@/domain/origination";

export type ViewerItem = {
  id: string;
  title: string;
  mimeType: string;
  bucket: string;
  objectPath: string;
  versionLabel?: string;
};

export function documentsToViewerItems(documents: FieldDocumentRecord[]): ViewerItem[] {
  return [...documents]
    .sort((a, b) => Number(b.current) - Number(a.current) || b.version - a.version)
    .filter((document) => document.bucket && document.objectPath)
    .map((document) => ({
      id: document.id,
      title: document.originalFilename,
      mimeType: document.mimeType,
      bucket: document.bucket,
      objectPath: document.objectPath,
      versionLabel: `v${document.version}`,
    }));
}

export function evidenceToViewerItems(evidence: FieldVerificationEvidenceRecord[]): ViewerItem[] {
  return evidence
    .filter((item) => item.bucket && item.objectPath && item.mimeType)
    .map((item) => ({
      id: item.id,
      title: item.originalFilename ?? item.kind,
      mimeType: item.mimeType ?? "application/octet-stream",
      bucket: item.bucket!,
      objectPath: item.objectPath!,
    }));
}
