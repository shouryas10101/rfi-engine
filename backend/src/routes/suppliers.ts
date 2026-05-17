import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import * as XLSX from "xlsx";
import { prisma } from "../db/client.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { env } from "../config/env.js";
import { callLlm, llmAvailable } from "../llm/client.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_BYTES } });

async function fetchLogoUrl(name: string): Promise<string | null> {
  try {
    // Resolve the real domain via Clearbit autocomplete
    const acRes = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(name)}`,
      { signal: AbortSignal.timeout(4000) },
    );
    let domain: string | null = null;
    if (acRes.ok) {
      const data = await acRes.json() as { domain?: string }[];
      domain = data[0]?.domain ?? null;
    }
    // Fall back to slug-guessing if autocomplete failed
    if (!domain) {
      domain = `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
    }
    // Google favicon service — always returns a PNG, never 404s
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch {
    return null;
  }
}

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const suppliers = await prisma.supplier.findMany({
      where: { tenantId: req.auth!.tenantId },
      include: {
        _count: { select: { users: true, catalogue: true } },
      },
      orderBy: { name: "asc" },
    });
    res.json({ suppliers });
  }),
);

const CreateSupplierSchema = z.object({
  name: z.string().min(1).max(200),
  contactEmail: z.string().email(),
});

router.post(
  "/",
  requireRole("TML_ADMIN", "TML_ENGINEER"),
  asyncHandler(async (req, res) => {
    const body = CreateSupplierSchema.parse(req.body);
    const logoUrl = await fetchLogoUrl(body.name);
    const supplier = await prisma.supplier.create({
      data: {
        tenantId: req.auth!.tenantId,
        name: body.name,
        contactEmail: body.contactEmail,
        logoUrl,
      },
    });
    res.status(201).json({ supplier });
  }),
);

const UpdateSupplierSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  contactEmail: z.string().email().optional(),
  logoUrl: z.string().url().nullable().optional(),
});

router.patch(
  "/:id",
  requireRole("TML_ADMIN", "TML_ENGINEER"),
  asyncHandler(async (req, res) => {
    const supplier = await prisma.supplier.findFirst({
      where: { id: String(req.params.id), tenantId: req.auth!.tenantId },
    });
    if (!supplier) { res.status(404).json({ error: "not_found" }); return; }
    const body = UpdateSupplierSchema.parse(req.body);
    const updated = await prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.contactEmail !== undefined && { contactEmail: body.contactEmail }),
        ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
      },
    });
    res.json({ supplier: updated });
  }),
);

router.delete(
  "/:id",
  requireRole("TML_ADMIN", "TML_ENGINEER"),
  asyncHandler(async (req, res) => {
    const supplier = await prisma.supplier.findFirst({
      where: { id: String(req.params.id), tenantId: req.auth!.tenantId },
    });
    if (!supplier) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await prisma.user.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
    res.json({ ok: true });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role === "SUPPLIER_ENGINEER" && auth.supplierId !== String(req.params.id)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const supplier = await prisma.supplier.findFirst({
      where: { id: String(req.params.id), tenantId: auth.tenantId },
      include: {
        users: { select: { id: true, email: true, fullName: true, createdAt: true } },
        catalogue: { include: { documents: true } },
      },
    });
    if (!supplier) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (!supplier.logoUrl) {
      const logoUrl = await fetchLogoUrl(supplier.name);
      if (logoUrl) {
        await prisma.supplier.update({ where: { id: supplier.id }, data: { logoUrl } });
        res.json({ supplier: { ...supplier, logoUrl } });
        return;
      }
    }
    res.json({ supplier });
  }),
);

const CatalogueItemSchema = z.object({
  componentCategory: z.string().min(1),
  productCode: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()),
});

router.post(
  "/:id/catalogue",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role === "SUPPLIER_ENGINEER" && auth.supplierId !== String(req.params.id)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const supplier = await prisma.supplier.findFirst({
      where: { id: String(req.params.id), tenantId: auth.tenantId },
    });
    if (!supplier) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const body = CatalogueItemSchema.parse(req.body);
    const item = await prisma.catalogueItem.create({
      data: {
        supplierId: supplier.id,
        componentCategory: body.componentCategory,
        productCode: body.productCode,
        parameters: body.parameters as never,
      },
    });
    res.status(201).json({ catalogueItem: item });
  }),
);

/**
 * Parse an Excel catalogue file directly — no LLM.
 * Expected table layout:
 *   Row 1: [param label/key col] [Variant A] [Variant B] ...
 *   Row N: [param_key]           [value A]   [value B]  ...
 * Returns { variants: [{ productCode, parameters }] }
 */
router.post(
  "/:id/catalogue/parse-file",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role === "SUPPLIER_ENGINEER" && auth.supplierId !== String(req.params.id)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "no_file" });
      return;
    }

    const filename = req.file.originalname.toLowerCase();
    if (!/\.(xlsx|xls)$/.test(filename)) {
      res.status(422).json({ error: "unsupported_format", reason: "Only .xlsx and .xls files are supported for variant detection." });
      return;
    }

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];

    if (rawRows.length < 2) {
      res.json({ variants: [] });
      return;
    }

    function toSnakeKey(s: string): string {
      return String(s)
        .toLowerCase()
        .replace(/[\s\-/()*.,–—]+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .replace(/^[0-9_]+/, "")
        .replace(/_+$/, "");
    }

    const MODEL_COL_RE = /model|set[\s._-]?code|product[\s._-]?code|part[\s._-]?no/i;
    const INDEX_COL_RE = /^s_?no$|^s_?n$|^sr_?no$|^serial_?no$|^index$/;

    type Variant = { productCode: string; parameters: Record<string, unknown> };

    // ── 1. Row-per-variant parser ─────────────────────────────────────────────
    // Scan first 20 rows for the real header row (must have ≥4 non-empty cells
    // AND contain a "model / set code" style column).
    let headerRowIdx = -1;
    let modelColIdx = -1;

    for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
      const row = rawRows[i];
      const nonEmpty = row.filter((c) => String(c ?? "").trim() !== "").length;
      if (nonEmpty < 4) continue;
      const mcIdx = row.findIndex((c) => MODEL_COL_RE.test(String(c ?? "")));
      if (mcIdx !== -1) { headerRowIdx = i; modelColIdx = mcIdx; break; }
    }

    if (headerRowIdx !== -1) {
      const headers = rawRows[headerRowIdx];
      const variants: Variant[] = [];

      for (const row of rawRows.slice(headerRowIdx + 1)) {
        const productCode = String(row[modelColIdx] ?? "").trim();
        if (!productCode) continue;
        const params: Record<string, unknown> = {};
        for (let c = 0; c < headers.length; c++) {
          if (c === modelColIdx) continue;
          const val = row[c];
          if (val === "" || val == null) continue;
          const key = toSnakeKey(String(headers[c] ?? ""));
          if (!key || INDEX_COL_RE.test(key)) continue;
          const num = typeof val === "number" ? val : Number(String(val));
          params[key] = Number.isFinite(num) && String(val).trim() !== "" ? num : String(val).trim();
        }
        if (Object.keys(params).length > 0) variants.push({ productCode, parameters: params });
      }

      if (variants.length > 0) { res.json({ variants }); return; }
    }

    // ── 2. Column-per-variant parser ──────────────────────────────────────────
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    if (rows.length >= 1) {
      const keys = Object.keys(rows[0]);
      const paramCol = keys.find((k) => /param/i.test(k)) ?? keys[1] ?? keys[0];
      const paramColIdx = keys.indexOf(paramCol);
      const vCols = keys.slice(paramColIdx + 1).filter((k) =>
        !k.startsWith("__") || rows.some((r) => String(r[k] ?? "").trim() !== ""),
      );
      const variantNames = vCols
        .map((c) => (c.startsWith("__") ? String(rows[0]?.[c] ?? c) : c).trim())
        .filter((n) => n && n !== "Parameter");

      if (variantNames.length > 0) {
        const paramMaps: Record<string, unknown>[] = variantNames.map(() => ({}));
        for (const row of rows) {
          const rawKey = String(row[paramCol] ?? "").trim();
          if (!rawKey || rawKey.toLowerCase() === "parameter") continue;
          const key = toSnakeKey(rawKey);
          if (!key) continue;
          for (let c = 0; c < vCols.length; c++) {
            const raw = row[vCols[c]];
            if (raw === "" || raw == null) continue;
            const num = typeof raw === "number" ? raw : Number(raw);
            paramMaps[c][key] = Number.isFinite(num) ? num : String(raw).trim();
          }
        }
        const variants = variantNames
          .map((name, i) => ({ productCode: name, parameters: paramMaps[i] }))
          .filter((v) => Object.keys(v.parameters).length > 0);
        if (variants.length > 0) { res.json({ variants }); return; }
      }
    }

    // ── 3. LLM fallback ───────────────────────────────────────────────────────
    if (!llmAvailable()) {
      res.json({ variants: [] });
      return;
    }

    // Convert sheet to CSV and truncate to keep within token limits (~6000 chars)
    const csvText = XLSX.utils.sheet_to_csv(ws, { skipHidden: true }).slice(0, 6000);

    const llmRaw = await callLlm({
      system: `You are a data extraction assistant. Extract product variants from a manufacturer's catalogue spreadsheet provided as CSV.
Return a JSON object with a single key "variants" containing an array of objects, each with:
- "productCode": string — the model number or product code
- "parameters": object — all technical specs as key/value pairs, with snake_case keys

Rules:
- Skip section header rows (rows where most cells are empty)
- Skip the serial number / S.No. column
- Use the model/product code column as productCode
- Numeric values should be numbers, not strings
- Only include rows that are actual products`,
      user: `Extract all product variants from this catalogue CSV:\n\n${csvText}`,
      json: true,
      maxTokens: 4000,
      temperature: 0,
    });

    if (!llmRaw) { res.json({ variants: [] }); return; }

    try {
      const parsed = JSON.parse(llmRaw) as { variants?: Variant[] };
      const variants = (parsed.variants ?? []).filter(
        (v) => v.productCode && typeof v.parameters === "object",
      );
      res.json({ variants, note: variants.length > 0 ? `LLM extracted ${variants.length} variant(s). Review before saving.` : undefined });
    } catch {
      res.json({ variants: [] });
    }
  }),
);

router.delete(
  "/:id/catalogue/:itemId",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role === "SUPPLIER_ENGINEER" && auth.supplierId !== String(req.params.id)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const item = await prisma.catalogueItem.findFirst({
      where: { id: String(req.params.itemId), supplierId: String(req.params.id) },
    });
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await prisma.document.deleteMany({ where: { catalogueItemId: item.id } });
    await prisma.catalogueItem.delete({ where: { id: item.id } });
    res.json({ ok: true });
  }),
);

router.put(
  "/:id/catalogue/:itemId",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role === "SUPPLIER_ENGINEER" && auth.supplierId !== String(req.params.id)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const item = await prisma.catalogueItem.findFirst({
      where: { id: String(req.params.itemId), supplierId: String(req.params.id) },
    });
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const body = CatalogueItemSchema.parse(req.body);
    const updated = await prisma.catalogueItem.update({
      where: { id: item.id },
      data: {
        componentCategory: body.componentCategory,
        productCode: body.productCode,
        parameters: body.parameters as never,
      },
    });
    res.json({ catalogueItem: updated });
  }),
);

export default router;
