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
      include: { _count: { select: { rfis: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ projects });
  }),
);

const milestoneFields = {
  milestoneKO:  z.string().datetime().nullable().optional(),
  milestoneDR0: z.string().datetime().nullable().optional(),
  milestoneDR1: z.string().datetime().nullable().optional(),
  milestoneDR2: z.string().datetime().nullable().optional(),
  milestoneDR3: z.string().datetime().nullable().optional(),
  milestoneDR4: z.string().datetime().nullable().optional(),
  milestoneDR5: z.string().datetime().nullable().optional(),
};

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  vehicleType: z.string().min(1),
  sop: z.string().datetime().optional(),
  targetMarket: z.string().optional(),
  ...milestoneFields,
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
        milestoneKO:  body.milestoneKO  ? new Date(body.milestoneKO)  : null,
        milestoneDR0: body.milestoneDR0 ? new Date(body.milestoneDR0) : null,
        milestoneDR1: body.milestoneDR1 ? new Date(body.milestoneDR1) : null,
        milestoneDR2: body.milestoneDR2 ? new Date(body.milestoneDR2) : null,
        milestoneDR3: body.milestoneDR3 ? new Date(body.milestoneDR3) : null,
        milestoneDR4: body.milestoneDR4 ? new Date(body.milestoneDR4) : null,
        milestoneDR5: body.milestoneDR5 ? new Date(body.milestoneDR5) : null,
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
        rfis: {
          orderBy: { createdAt: "desc" },
          include: { bidlist: { include: { supplier: true } } },
        },
      },
    });
    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ project });
  }),
);

const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  vehicleType: z.string().min(1).optional(),
  sop: z.string().datetime().nullable().optional(),
  targetMarket: z.string().nullable().optional(),
  ...milestoneFields,
});

router.patch(
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
    const body = UpdateProjectSchema.parse(req.body);
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.vehicleType !== undefined && { vehicleType: body.vehicleType }),
        ...(body.sop !== undefined && { sop: body.sop ? new Date(body.sop) : null }),
        ...(body.targetMarket !== undefined && { targetMarket: body.targetMarket }),
        ...(body.milestoneKO  !== undefined && { milestoneKO:  body.milestoneKO  ? new Date(body.milestoneKO)  : null }),
        ...(body.milestoneDR0 !== undefined && { milestoneDR0: body.milestoneDR0 ? new Date(body.milestoneDR0) : null }),
        ...(body.milestoneDR1 !== undefined && { milestoneDR1: body.milestoneDR1 ? new Date(body.milestoneDR1) : null }),
        ...(body.milestoneDR2 !== undefined && { milestoneDR2: body.milestoneDR2 ? new Date(body.milestoneDR2) : null }),
        ...(body.milestoneDR3 !== undefined && { milestoneDR3: body.milestoneDR3 ? new Date(body.milestoneDR3) : null }),
        ...(body.milestoneDR4 !== undefined && { milestoneDR4: body.milestoneDR4 ? new Date(body.milestoneDR4) : null }),
        ...(body.milestoneDR5 !== undefined && { milestoneDR5: body.milestoneDR5 ? new Date(body.milestoneDR5) : null }),
      },
    });
    res.json({ project: updated });
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
