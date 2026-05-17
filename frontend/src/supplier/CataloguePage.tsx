import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { DocumentList } from "../components/DocumentList";

type CatalogueItem = {
  id: string;
  componentCategory: string;
  productCode: string;
  parameters: Record<string, unknown>;
  documents: { id: string; filename: string; mimeType: string; sizeBytes: number; extractionStatus: string }[];
};

type Supplier = {
  id: string;
  name: string;
  catalogue: CatalogueItem[];
};

type ExtractedVariant = {
  productCode: string;
  parameters: Record<string, unknown>;
  selected: boolean;
};

export default function CataloguePage() {
  const { user } = useAuth();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [category, setCategory] = useState("");
  const [productCode, setProductCode] = useState("");
  const [paramsText, setParamsText] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [extractedVariants, setExtractedVariants] = useState<ExtractedVariant[] | null>(null);
  const [variantCategory, setVariantCategory] = useState("");
  const [savingVariants, setSavingVariants] = useState(false);
  const [parsedFile, setParsedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const variantFileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!user?.supplierId) return;
    const r = await api.get(`/suppliers/${user.supplierId}`);
    setSupplier(r.data.supplier);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.supplierId]);

  function startNew() {
    setEditing("new");
    setCategory("");
    setProductCode("");
    setParamsText("{}");
    setError(null);
    setParseNote(null);
    setExtractedVariants(null);
  }

  function startEdit(item: CatalogueItem) {
    setEditing(item.id);
    setCategory(item.componentCategory);
    setProductCode(item.productCode);
    setParamsText(JSON.stringify(item.parameters, null, 2));
    setError(null);
    setParseNote(null);
    setExtractedVariants(null);
  }

  async function parseFromFile(file: File) {
    setParsing(true);
    setParseNote(null);
    setError(null);
    setExtractedVariants(null);
    setParsedFile(file);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post(`/suppliers/${user!.supplierId}/catalogue/parse-file`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const { variants, note } = r.data as {
        variants?: { productCode: string; parameters: Record<string, unknown> }[];
        note?: string;
      };

      if (note) {
        setParseNote(note);
        return;
      }

      if (!variants || variants.length === 0) {
        setParseNote("No variants could be extracted. Try a clearer document or add manually.");
        return;
      }

      if (variants.length === 1) {
        // Single variant — fall through to the single-item form
        setProductCode(variants[0].productCode);
        setParamsText(JSON.stringify(variants[0].parameters, null, 2));
        setParseNote(`Extracted 1 variant (${variants[0].productCode}) with ${Object.keys(variants[0].parameters).length} parameter(s). Review and save.`);
      } else {
        // Multiple variants — show variant selector
        setExtractedVariants(variants.map((v) => ({ ...v, selected: true })));
        setParseNote(`Found ${variants.length} variants in the catalogue. Select which ones to add.`);
      }
    } catch (err) {
      const e = err as { response?: { data?: { error?: string; reason?: string } } };
      setError(e.response?.data?.error?.replace(/_/g, " ") ?? "parse_failed");
      setParsedFile(null);
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (variantFileInputRef.current) variantFileInputRef.current.value = "";
    }
  }

  async function saveVariants(e: FormEvent) {
    e.preventDefault();
    if (!extractedVariants || !variantCategory.trim()) return;
    const selected = extractedVariants.filter((v) => v.selected);
    if (selected.length === 0) {
      setError("Select at least one variant to add.");
      return;
    }
    setSavingVariants(true);
    setError(null);
    try {
      const createdIds: string[] = [];
      for (const v of selected) {
        const r = await api.post(`/suppliers/${user!.supplierId}/catalogue`, {
          componentCategory: variantCategory.trim(),
          productCode: v.productCode,
          parameters: v.parameters,
        });
        createdIds.push(r.data.catalogueItem.id);
      }
      if (parsedFile) {
        for (const itemId of createdIds) {
          await uploadDocFor(itemId, parsedFile);
        }
      }
      setExtractedVariants(null);
      setVariantCategory("");
      setParseNote(null);
      setParsedFile(null);
      await load();
    } catch (err) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setError(e2.response?.data?.error ?? "save_failed");
    } finally {
      setSavingVariants(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let parameters: Record<string, unknown>;
    try {
      parameters = JSON.parse(paramsText);
      if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
        throw new Error("Parameters must be a JSON object.");
      }
    } catch (err) {
      setError(`Invalid JSON: ${(err as Error).message}`);
      return;
    }
    setSubmitting(true);
    try {
      const payload = { componentCategory: category, productCode, parameters };
      if (editing === "new") {
        await api.post(`/suppliers/${user!.supplierId}/catalogue`, payload);
      } else {
        await api.put(`/suppliers/${user!.supplierId}/catalogue/${editing}`, payload);
      }
      setEditing(null);
      await load();
    } catch (err) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setError(e2.response?.data?.error ?? "save_failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadDocFor(itemId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("catalogueItemId", itemId);
    await api.post("/documents/upload", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    await load();
  }

  async function deleteDoc(docId: string) {
    await api.delete(`/documents/${docId}`);
    await load();
  }

  if (!user?.supplierId) {
    return <div className="card text-sm text-ink-400">This page is only available to supplier engineers.</div>;
  }
  if (!supplier) return <div className="text-ink-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium">{supplier.name} catalogue</h1>
          <p className="text-sm text-ink-400 mt-1">
            Define the products you can offer. The supplier agent will use these to answer TML's RFI questions.
          </p>
        </div>
        <div className="flex gap-2">
          {editing === null && !extractedVariants && (
            <>
              <input
                ref={variantFileInputRef}
                type="file"
                accept=".pdf,.xlsx,.xls,.csv,.txt"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFromFile(f); }}
              />
              <button
                onClick={() => variantFileInputRef.current?.click()}
                disabled={parsing}
                className="btn-secondary"
              >
                {parsing ? "Extracting…" : "Import from catalogue file"}
              </button>
              <button onClick={startNew} className="btn-primary">+ Add item</button>
            </>
          )}
        </div>
      </div>

      {/* Multi-variant import panel */}
      {extractedVariants && (
        <form onSubmit={saveVariants} className="card mb-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-medium">Variants extracted from catalogue</h2>
              <p className="text-xs text-ink-400 mt-1">Select the variants to add. Set the component category to match TML's RFI exactly.</p>
            </div>
            <button type="button" onClick={() => { setExtractedVariants(null); setParseNote(null); setParsedFile(null); }} className="text-xs text-ink-400 hover:text-ink-600">Discard</button>
          </div>

          <div>
            <label className="label">Component category (must match RFI exactly)</label>
            <input
              className="input"
              value={variantCategory}
              onChange={(e) => setVariantCategory(e.target.value)}
              placeholder="e.g. eAxle"
              required
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {extractedVariants.map((v, i) => (
              <button
                key={i}
                type="button"
                onClick={() =>
                  setExtractedVariants((prev) =>
                    prev ? prev.map((x, j) => j === i ? { ...x, selected: !x.selected } : x) : prev
                  )
                }
                className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                  v.selected
                    ? "bg-accent-600 text-white border-accent-600"
                    : "bg-white text-ink-400 border-ink-300 hover:border-ink-500"
                }`}
              >
                {v.selected ? "✓ " : ""}{v.productCode}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={savingVariants} className="btn-primary">
              {savingVariants ? "Saving…" : `Add ${extractedVariants.filter((v) => v.selected).length} variant(s)`}
            </button>
            <button type="button" onClick={() => { setExtractedVariants(null); setParseNote(null); setParsedFile(null); }} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {parseNote && !extractedVariants && (
        <p className="text-sm text-accent-600 mb-4">{parseNote}</p>
      )}

      {/* Single item form */}
      {editing !== null && (
        <form onSubmit={save} className="card mb-4 space-y-4">
          <h2 className="text-sm font-medium">{editing === "new" ? "New catalogue item" : "Edit catalogue item"}</h2>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">Component category</label>
              <input
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Brake Caliper"
                required
              />
              <p className="text-xs text-ink-400 mt-1">Must exactly match the RFI's component category.</p>
            </div>
            <div>
              <label className="label">Product code</label>
              <input
                className="input"
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                placeholder="e.g. BC-EV-X40"
                required
              />
            </div>
          </div>

          <div className="border border-dashed border-ink-300 rounded-md p-4 bg-ink-50">
            <p className="text-sm font-medium mb-1">Auto-fill parameters from datasheet</p>
            <p className="text-xs text-ink-400 mb-3">
              Upload a product datasheet and AI will extract technical specifications. For multi-variant catalogues, use "Import from catalogue file" above instead.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFromFile(f); }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="btn-secondary text-sm"
            >
              {parsing ? "Extracting…" : "Upload datasheet to extract parameters"}
            </button>
            {parseNote && <p className="text-xs text-accent-600 mt-2">{parseNote}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Parameters (JSON)</label>
              <span className="text-xs text-ink-400">{Object.keys((() => { try { return JSON.parse(paramsText); } catch { return {}; } })()).length} keys</span>
            </div>
            <textarea
              className="input font-mono text-xs min-h-[200px]"
              value={paramsText}
              onChange={(e) => setParamsText(e.target.value)}
              spellCheck={false}
            />
            <p className="text-xs text-ink-400 mt-1">
              Keys must match RFI parameter keys. Subset ranges as <code>[min, max]</code> arrays.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={submitting || parsing} className="btn-primary">
              {submitting ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {supplier.catalogue.length === 0 && editing === null && !extractedVariants && (
        <div className="card text-sm text-ink-400">No catalogue items yet.</div>
      )}

      <div className="space-y-3">
        {supplier.catalogue.map((item) => (
          <div key={item.id} className="card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-medium">{item.productCode}</p>
                <p className="text-xs text-ink-400">{item.componentCategory}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(item)} className="btn-secondary text-xs">Edit</button>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete "${item.productCode}"? This cannot be undone.`)) return;
                    await api.delete(`/suppliers/${user!.supplierId}/catalogue/${item.id}`);
                    await load();
                  }}
                  className="btn-secondary text-xs text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
            <details className="text-xs mb-3">
              <summary className="cursor-pointer text-ink-400 hover:text-ink-600">
                Parameters ({Object.keys(item.parameters).length})
              </summary>
              <pre className="mt-2 bg-ink-50 p-3 rounded-md overflow-x-auto">{JSON.stringify(item.parameters, null, 2)}</pre>
            </details>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400 mb-2">Datasheets</p>
              <DocumentList
                documents={item.documents}
                onUpload={(f) => uploadDocFor(item.id, f)}
                onDelete={deleteDoc}
                emptyText="No datasheets attached. Upload spec sheets so the agent can cite them."
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
