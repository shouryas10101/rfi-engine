import { useRef, useState } from "react";
import { api } from "../api/client";

type Doc = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  extractionStatus: string;
};

type Props = {
  documents: Doc[];
  onUpload?: (file: File) => Promise<void>;
  onDelete?: (docId: string) => Promise<void>;
  readOnly?: boolean;
  emptyText?: string;
};

function fileTypeLabel(mime: string, name: string): string {
  if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) return "PDF";
  if (mime.includes("wordprocessing") || name.toLowerCase().endsWith(".docx")) return "DOCX";
  if (mime.includes("spreadsheet") || /\.xlsx?$/i.test(name)) return "XLS";
  if (mime.startsWith("image/")) return "IMG";
  if (name.toLowerCase().endsWith(".md")) return "MD";
  if (mime.startsWith("text/") || /\.(txt|csv)$/i.test(name)) return "TXT";
  return "FILE";
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function statusLabel(s: string): string {
  if (s === "extracted") return "text extracted";
  if (s === "stored_only") return "stored only";
  if (s === "failed") return "extraction failed";
  return s;
}

export function DocumentList({ documents, onUpload, onDelete, readOnly, emptyText }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(f: File) {
    if (!onUpload) return;
    setBusy(true);
    try {
      await onUpload(f);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function downloadDoc(id: string, filename: string) {
    const resp = await api.get(`/documents/${id}/download`, { responseType: "blob" });
    if (resp.headers["content-type"]?.includes("application/json")) {
      // R2 — backend returned a JSON with a signed URL
      const text = await (resp.data as Blob).text();
      const { url } = JSON.parse(text);
      window.open(url, "_blank");
      return;
    }
    const blobUrl = URL.createObjectURL(resp.data as Blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
  }

  return (
    <div>
      {documents.length === 0 && (
        <p className="text-xs text-ink-400 mb-2">{emptyText ?? "No documents."}</p>
      )}
      <div className="space-y-1.5">
        {documents.map((d) => (
          <div key={d.id} className="flex items-center gap-2 px-2 py-1.5 bg-ink-50 rounded-md">
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-800">
              {fileTypeLabel(d.mimeType, d.filename)}
            </span>
            <button
              type="button"
              onClick={() => downloadDoc(d.id, d.filename)}
              className="flex-1 min-w-0 text-left text-xs hover:text-accent-600 truncate"
            >
              {d.filename}
            </button>
            <span className="text-[10px] text-ink-400 whitespace-nowrap">
              {bytes(d.sizeBytes)} · {statusLabel(d.extractionStatus)}
            </span>
            {!readOnly && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(d.id)}
                className="text-[10px] text-red-600 hover:text-red-800"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && onUpload && (
        <div className="mt-3">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.xls,application/pdf"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="btn-secondary text-xs"
          >
            {busy ? "Uploading..." : "+ Upload document"}
          </button>
        </div>
      )}
    </div>
  );
}
