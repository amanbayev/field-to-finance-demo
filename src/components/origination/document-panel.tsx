"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createBrowserSupabaseClient } from "@/lib/auth/supabase/browser";
import {
  FIELD_DOCUMENT_TYPES,
  type FieldDocumentRecord,
  type FieldDocumentType,
} from "@/domain/origination";
import { removeDraftDocumentAction } from "@/app/fields/actions";
import { FormSubmitButton } from "@/components/identity/form-submit-button";
import { StatusBadge } from "@/components/shared/status-badge";

export function DocumentPanel({
  fieldId,
  fieldPublicId,
  documents,
  canEdit,
  canReplace,
}: {
  fieldId: string;
  fieldPublicId: string;
  documents: FieldDocumentRecord[];
  canEdit: boolean;
  canReplace: boolean;
}) {
  const t = useTranslations("origination");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File, documentType: FieldDocumentType, replacesDocumentId?: string) {
    setBusy(true);
    setError(null);
    try {
      const intentRes = await fetch("/api/origination/upload-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldId,
          documentType,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          replacesDocumentId,
        }),
      });
      const intent = (await intentRes.json()) as {
        mode?: string;
        bucket?: string;
        objectPath?: string;
        token?: string;
        documentId?: string;
        version?: number;
        error?: string;
        message?: string;
      };
      if (!intentRes.ok) {
        throw new Error(intent.message ?? intent.error ?? "upload");
      }
      if (intent.mode === "signed" && intent.bucket && intent.token && intent.objectPath) {
        const supabase = createBrowserSupabaseClient();
        const { error: uploadError } = await supabase.storage
          .from(intent.bucket)
          .uploadToSignedUrl(intent.objectPath, intent.token, file);
        if (uploadError) {
          throw uploadError;
        }
        const complete = await fetch("/api/origination/upload-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fieldId,
            documentId: intent.documentId,
            documentType,
            filename: file.name,
            mimeType: file.type,
            objectPath: intent.objectPath,
            version: intent.version,
            replacesDocumentId,
          }),
        });
        if (!complete.ok) {
          throw new Error("commit");
        }
      } else {
        const form = new FormData();
        form.set("fieldId", fieldId);
        form.set("documentType", documentType);
        if (replacesDocumentId) {
          form.set("replacesDocumentId", replacesDocumentId);
        }
        form.set("file", file);
        const local = await fetch("/api/origination/upload", { method: "POST", body: form });
        if (!local.ok) {
          throw new Error("upload");
        }
      }
      router.refresh();
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  const current = documents.filter((document) => document.current);

  return (
    <div className="grid gap-8">
      {canEdit || canReplace ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELD_DOCUMENT_TYPES.map((type) => {
            const existing = current.find((document) => document.documentType === type);
            return (
              <label key={type} className="grid gap-2 border-b border-harvest/15 pb-4">
                <span className="label-caps">{t(type)}</span>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  disabled={busy || (!canEdit && Boolean(existing) && !canReplace)}
                  className="desk-control h-10 w-full max-w-full text-xs file:mr-3 file:border-0 file:bg-transparent file:text-harvest"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    void upload(file, type, existing && canReplace ? existing.id : undefined);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            );
          })}
        </div>
      ) : null}
      {error ? <p className="text-sm text-ember">{error}</p> : null}
      <ul className="divide-y divide-harvest/15 border-y border-harvest/20">
        {documents.map((document) => (
          <li key={document.id} className="flex flex-wrap items-baseline justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="label-caps text-straw">{t(document.documentType)}</p>
              <p className="mt-1 truncate text-bone">{document.originalFilename}</p>
              <p className="mt-1 font-tabular text-xs text-straw">
                v{document.version}
                {document.current ? ` · ${t("current")}` : ` · ${t("history")}`}
                {" · "}
                {(document.sizeBytes / 1024).toFixed(0)} KB
                {" · "}
                {t("scanNotScanned")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge value={document.status} />
              <a
                className="text-sm text-harvest"
                href={`/api/origination/file?bucket=${encodeURIComponent(document.bucket)}&path=${encodeURIComponent(document.objectPath)}`}
                target="_blank"
                rel="noreferrer"
              >
                {t("preview")}
              </a>
              {canEdit && document.current ? (
                <form action={removeDraftDocumentAction}>
                  <input type="hidden" name="fieldId" value={fieldPublicId} />
                  <input type="hidden" name="documentId" value={document.id} />
                  <FormSubmitButton variant="ghost" size="xs" pendingLabel={t("remove")}>
                    {t("remove")}
                  </FormSubmitButton>
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MessageForm({
  action,
  caseId,
  fieldId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  caseId: string;
  fieldId?: string;
}) {
  const t = useTranslations("origination");
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="caseId" value={caseId} />
      {fieldId ? <input type="hidden" name="fieldId" value={fieldId} /> : null}
      <label className="grid gap-2">
        <span className="label-caps">{t("message")}</span>
        <textarea name="body" required rows={3} className="desk-control min-h-[5rem] w-full py-2" />
      </label>
      <FormSubmitButton pendingLabel={t("send")}>{t("send")}</FormSubmitButton>
    </form>
  );
}

export function ActionError({ show }: { show: boolean }) {
  const t = useTranslations("origination");
  if (!show) {
    return null;
  }
  return <p className="text-sm text-ember">{t("error")}</p>;
}
