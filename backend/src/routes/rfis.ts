import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { ParameterDefinitionSchema } from "../domain/parameter.js";
import { rankSuppliers, type SupplierEvaluation } from "../ranking/score.js";
import { extractText } from "../documents/extract.js";
import { callLlm, llmAvailable } from "../llm/client.js";
import { env } from "../config/env.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_BYTES } });

const router = Router();
router.use(requireAuth);

const PARSE_SYSTEM = `You are an automotive RFI document parser. Extract every technical requirement from the document.

Output a JSON object with a single key "parameters" whose value is an array of requirement objects.

Each element in the array must have:
- "key": snake_case identifier, e.g. "max_braking_force_kn" (lowercase letters, digits, underscores only; must start with a letter)
- "label": human-readable description of the requirement
- "phase": one of "general" | "must_have" | "good_to_have" | "subjective"
  general = project info or basic qualification questions
  must_have = hard requirement — supplier failure here ends evaluation
  good_to_have = preferred but not mandatory
  subjective = qualitative, needs narrative answer
- "importance": mirrors phase — "general" | "must" | "good" | "subjective"
- "weight": number — must_have: 2.0, good_to_have: 1.0-1.5, general: 1.0, subjective: 1.0-1.5
- "spec": exactly one of these shapes:
  {"type":"boolean","expected":true}
  {"type":"numeric_range","min":28,"max":null,"unit":"kN"}
  {"type":"numeric_exact","value":12.5,"tolerance":0.5,"unit":"mm"}
  {"type":"numeric_subset_range","min":-30,"max":600,"unit":"C"}
  {"type":"enum","allowed":["ECE-R13","FMVSS-135"]}
  {"type":"subjective","description":"Describe...","acceptanceCriteria":"pass criteria here"}
  {"type":"text","prompt":"What is...","acceptanceCriteria":"required value or pass criteria — REQUIRED when phase is must_have"}

Rules:
- For text-type must_have parameters, always include acceptanceCriteria with the exact required value (e.g. "eAxle architecture", "Liquid/water cooling", "PMSM motor")
- Every key must be unique across the array
- Use numeric_subset_range when the RFI specifies an operating envelope the supplier must fully cover
- Use numeric_range when the RFI specifies a min OR max threshold the supplier value must meet
- Use null for unbounded sides of numeric_range`;

router.post(
  "/parse-file",
  requireRole("TML_ADMIN", "TML_ENGINEER"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "no_file" });
      return;
    }

    const ext = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
    console.log("[parse-file] mime:", req.file.mimetype, "filename:", req.file.originalname, "extractStatus:", ext.status, "textLen:", ext.text?.length ?? 0, "reason:", ext.reason);
    if (!ext.text) {
      res.status(422).json({ error: "could_not_extract_text", reason: ext.reason });
      return;
    }

    if (!llmAvailable()) {
      res.json({ parameters: [], note: "LLM not configured — parameters could not be auto-extracted." });
      return;
    }

    const truncated = ext.text.slice(0, 8000);
    const raw = await callLlm({
      system: PARSE_SYSTEM,
      user: `RFI document text:\n\n${truncated}`,
      json: true,
      maxTokens: 4096,
    });
    console.log("[parse-file] LLM raw response (first 500):", raw?.slice(0, 500));

    let parameters: unknown[] = [];
    if (raw) {
      try {
        // LLM sometimes wraps in {"parameters":[...]} — unwrap if needed
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed) ? parsed : (parsed.parameters ?? parsed.items ?? []);
        console.log("[parse-file] parsed array length:", Array.isArray(arr) ? arr.length : "not array", typeof arr);
        // Sanitize: fix keys, assign ordering, drop invalid entries
        let order = 0;
        for (const p of arr) {
          if (typeof p !== "object" || !p) continue;
          // Sanitize key: lowercase, replace spaces/hyphens, strip leading digits
          if (typeof p.key === "string") {
            p.key = p.key.toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "").replace(/^[0-9_]+/, "");
          }
          if (!p.key) continue;
          p.ordering = order++;
          parameters.push(p);
        }
      } catch (e) {
        console.log("[parse-file] JSON parse error:", e);
      }
    }

    res.json({ parameters, charactersRead: truncated.length });
  }),
);

const CreateRFISchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  componentCategory: z.string().min(1),
  parameters: z.array(ParameterDefinitionSchema).min(1),
});

router.post(
  "/",
  requireRole("TML_ADMIN", "TML_ENGINEER"),
  asyncHandler(async (req, res) => {
    const body = CreateRFISchema.parse(req.body);
    const project = await prisma.project.findFirst({
      where: { id: body.projectId, tenantId: req.auth!.tenantId },
    });
    if (!project) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }
    const rfi = await prisma.rFI.create({
      data: {
        projectId: project.id,
        title: body.title,
        componentCategory: body.componentCategory,
        status: "active",
        parameters: {
          create: body.parameters.map((p) => ({
            phase: p.phase,
            importance: p.importance,
            key: p.key,
            label: p.label,
            type: p.spec.type,
            spec: p.spec,
            weight: p.weight,
            ordering: p.ordering,
          })),
        },
      },
      include: { parameters: true },
    });
    res.status(201).json({ rfi });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const rfi = await prisma.rFI.findFirst({
      where: { id: String(req.params.id), project: { tenantId: req.auth!.tenantId } },
      include: {
        project: true,
        parameters: { orderBy: [{ phase: "asc" }, { ordering: "asc" }] },
        sessions: { include: { supplier: true } },
        documents: {
          select: {
            id: true,
            filename: true,
            mimeType: true,
            sizeBytes: true,
            extractionStatus: true,
            createdAt: true,
          },
        },
      },
    });
    if (!rfi) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ rfi });
  }),
);

router.get(
  "/:id/comparison",
  requireRole("TML_ADMIN", "TML_ENGINEER"),
  asyncHandler(async (req, res) => {
    const rfi = await prisma.rFI.findFirst({
      where: { id: String(req.params.id), project: { tenantId: req.auth!.tenantId } },
      include: {
        sessions: {
          include: {
            supplier: true,
            responses: { include: { parameter: true } },
          },
        },
      },
    });
    if (!rfi) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const evals: SupplierEvaluation[] = rfi.sessions.map((s) => ({
      supplierId: s.supplier.id,
      supplierName: s.supplier.name,
      sessionId: s.id,
      status: s.status === "paused" ? "active" : (s.status as SupplierEvaluation["status"]),
      responses: s.responses.map((r) => ({
        parameterId: r.parameterId,
        importance: r.parameter.importance,
        weight: r.parameter.weight,
        verdict: r.verdict,
        confidence: r.confidence,
        modificationDistance: r.modificationDistance,
      })),
    }));
    const ranked = rankSuppliers(evals);
    res.json({
      rfi: { id: rfi.id, title: rfi.title, componentCategory: rfi.componentCategory },
      ranked,
    });
  }),
);

router.delete(
  "/:id",
  requireRole("TML_ADMIN", "TML_ENGINEER"),
  asyncHandler(async (req, res) => {
    const rfi = await prisma.rFI.findFirst({
      where: { id: String(req.params.id), project: { tenantId: req.auth!.tenantId } },
    });
    if (!rfi) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await prisma.rFI.delete({ where: { id: rfi.id } });
    res.json({ ok: true });
  }),
);

export default router;
