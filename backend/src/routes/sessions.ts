import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  startSession,
  pauseSession,
  runOneStep,
  runUntilBlocked,
  submitHumanTurn,
  getSessionDetail,
  generateAndStoreReport,
} from "../services/sessionService.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const where =
      auth.role === "SUPPLIER_ENGINEER" && auth.supplierId
        ? { supplierId: auth.supplierId }
        : { supplier: { tenantId: auth.tenantId } };

    const sessions = await prisma.session.findMany({
      where,
      include: {
        rfi: { include: { project: true } },
        supplier: true,
        _count: { select: { responses: true, turns: true } },
      },
      orderBy: { startedAt: "desc" },
    });
    res.json({ sessions });
  }),
);

const CreateSessionSchema = z.object({
  rfiId: z.string().min(1),
  supplierId: z.string().min(1),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = CreateSessionSchema.parse(req.body);
    const auth = req.auth!;

    const rfi = await prisma.rFI.findFirst({
      where: { id: body.rfiId, project: { tenantId: auth.tenantId } },
    });
    if (!rfi) {
      res.status(404).json({ error: "rfi_not_found" });
      return;
    }
    const supplier = await prisma.supplier.findFirst({
      where: { id: body.supplierId, tenantId: auth.tenantId },
    });
    if (!supplier) {
      res.status(404).json({ error: "supplier_not_found" });
      return;
    }
    const onBidlist = await prisma.bidlistEntry.findUnique({
      where: { rfiId_supplierId: { rfiId: rfi.id, supplierId: supplier.id } },
    });
    if (!onBidlist) {
      res.status(400).json({ error: "supplier_not_on_bidlist" });
      return;
    }

    const catalogueItem = await prisma.catalogueItem.findFirst({
      where: { supplierId: supplier.id, componentCategory: rfi.componentCategory },
    });

    const session = await prisma.session.upsert({
      where: { rfiId_supplierId: { rfiId: rfi.id, supplierId: supplier.id } },
      update: {},
      create: {
        rfiId: rfi.id,
        supplierId: supplier.id,
        initiatedBy: auth.userId,
        catalogueItemId: catalogueItem?.id ?? null,
      },
    });
    res.status(201).json({ session });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const session = await getSessionDetail(id, req.auth!.tenantId, req.auth!.role, req.auth!.supplierId ?? null);
    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }
    res.json({ session });
  }),
);

router.post(
  "/:id/start",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const tenantId = req.auth!.tenantId;
    try {
      await startSession(id, tenantId);
      res.json({ ok: true });
      // Run evaluation in background — do not block the HTTP response
      setImmediate(() => {
        runUntilBlocked(id, tenantId, 999).catch((e) => console.error("[auto-run]", e));
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }),
);

router.post(
  "/:id/step",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    try {
      const advanced = await runOneStep(id, req.auth!.tenantId);
      res.json({ advanced });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }),
);

router.post(
  "/:id/run",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    try {
      const result = await runUntilBlocked(id, req.auth!.tenantId);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }),
);

router.post(
  "/:id/pause",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    try {
      await pauseSession(id, req.auth!.tenantId);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }),
);

router.post(
  "/:id/resume",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const tenantId = req.auth!.tenantId;
    try {
      await startSession(id, tenantId);
      res.json({ ok: true });
      setImmediate(() => {
        runUntilBlocked(id, tenantId, 999).catch((e) => console.error("[auto-run]", e));
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }),
);

const InterjectSchema = z.object({
  content: z.string().min(1).max(5000),
  documentIds: z.array(z.string()).optional(),
});

router.post(
  "/:id/interject",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const body = InterjectSchema.parse(req.body);
    const auth = req.auth!;

    const session = await prisma.session.findFirst({
      where:
        auth.role === "SUPPLIER_ENGINEER" && auth.supplierId
          ? { id, supplierId: auth.supplierId }
          : { id, supplier: { tenantId: auth.tenantId } },
    });
    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }

    try {
      const result = await submitHumanTurn({
        sessionId: id,
        tenantId: auth.tenantId,
        userId: auth.userId,
        authorRole: auth.role === "SUPPLIER_ENGINEER" ? "supplier_user" : "tml_user",
        content: body.content,
        documentIds: body.documentIds,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const auth = req.auth!;
    if (auth.role === "SUPPLIER_ENGINEER") {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const session = await prisma.session.findFirst({
      where: { id, supplier: { tenantId: auth.tenantId } },
    });
    if (!session) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await prisma.complianceReport.deleteMany({ where: { sessionId: session.id } });
    await prisma.parameterResponse.deleteMany({ where: { sessionId: session.id } });
    await prisma.turn.deleteMany({ where: { sessionId: session.id } });
    await prisma.session.delete({ where: { id: session.id } });
    res.json({ ok: true });
  }),
);

router.get(
  "/:id/report",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const auth = req.auth!;
    const where =
      auth.role === "SUPPLIER_ENGINEER" && auth.supplierId
        ? { sessionId: id, session: { supplierId: auth.supplierId } }
        : { sessionId: id, session: { supplier: { tenantId: auth.tenantId } } };

    const report = await prisma.complianceReport.findFirst({
      where,
      orderBy: { generatedAt: "desc" },
    });
    if (!report) {
      res.status(404).json({ error: "report_not_yet_generated" });
      return;
    }
    res.json({ report });
  }),
);

router.post(
  "/:id/report/regenerate",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const auth = req.auth!;
    if (auth.role === "SUPPLIER_ENGINEER") {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const session = await prisma.session.findFirst({
      where: { id, supplier: { tenantId: auth.tenantId } },
    });
    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }
    await generateAndStoreReport(id);
    const report = await prisma.complianceReport.findFirst({
      where: { sessionId: id },
      orderBy: { generatedAt: "desc" },
    });
    res.json({ report });
  }),
);

export default router;
