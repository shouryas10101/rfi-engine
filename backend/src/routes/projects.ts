import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const projects = await prisma.project.findMany({
      where: { tenantId: req.auth!.tenantId },
      include: { _count: { select: { rfis: true, bidlist: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ projects });
  }),
);

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  vehicleType: z.string().min(1),
  sop: z.string().datetime().optional(),
  targetMarket: z.string().optional(),
});

router.post(
  "/",
  requireRole("TML_ADMIN", "TML_ENGINEER"),
  asyncHandler(async (req, res) => {
    const body = CreateProjectSchema.parse(req.body);
    const project = await prisma.project.create({
      data: {
        tenantId: req.auth!.tenantId,
        name: body.name,
        vehicleType: body.vehicleType,
        sop: body.sop ? new Date(body.sop) : null,
        targetMarket: body.targetMarket ?? null,
      },
    });
    res.status(201).json({ project });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.id), tenantId: req.auth!.tenantId },
      include: {
        rfis: { orderBy: { createdAt: "desc" } },
        bidlist: { include: { supplier: true } },
      },
    });
    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ project });
  }),
);

const AddBidlistSchema = z.object({ supplierId: z.string().min(1) });

router.post(
  "/:id/bidlist",
  requireRole("TML_ADMIN", "TML_ENGINEER"),
  asyncHandler(async (req, res) => {
    const body = AddBidlistSchema.parse(req.body);
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.id), tenantId: req.auth!.tenantId },
    });
    if (!project) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }
    const supplier = await prisma.supplier.findFirst({
      where: { id: body.supplierId, tenantId: req.auth!.tenantId },
    });
    if (!supplier) {
      res.status(404).json({ error: "supplier_not_found" });
      return;
    }
    const entry = await prisma.bidlistEntry.upsert({
      where: { projectId_supplierId: { projectId: project.id, supplierId: supplier.id } },
      update: {},
      create: { projectId: project.id, supplierId: supplier.id },
    });
    res.status(201).json({ bidlistEntry: entry });
  }),
);

router.delete(
  "/:id",
  requireRole("TML_ADMIN", "TML_ENGINEER"),
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.id), tenantId: req.auth!.tenantId },
    });
    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await prisma.project.delete({ where: { id: project.id } });
    res.json({ ok: true });
  }),
);

export default router;
