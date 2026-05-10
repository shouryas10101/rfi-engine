import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../db/client.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { signToken } from "../auth/jwt.js";
import { env } from "../config/env.js";

const router = Router();

function genToken(): string {
  return randomBytes(32).toString("base64url");
}

function expiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + env.INVITATION_TTL_DAYS);
  return d;
}

router.get(
  "/",
  requireAuth,
  requireRole("TML_ADMIN", "TML_ENGINEER"),
  asyncHandler(async (req, res) => {
    const invitations = await prisma.invitation.findMany({
      where: { tenantId: req.auth!.tenantId },
      include: { issuedBy: { select: { email: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      invitations: invitations.map((inv) => ({
        ...inv,
        link: inv.status === "pending" ? `${env.PUBLIC_FRONTEND_URL}/onboard/${inv.token}` : null,
      })),
    });
  }),
);

const IssueSchema = z.object({
  email: z.string().email(),
  role: z.enum(["TML_ADMIN", "TML_ENGINEER", "SUPPLIER_ENGINEER"]),
  supplierId: z.string().optional(),
});

router.post(
  "/",
  requireAuth,
  requireRole("TML_ADMIN", "TML_ENGINEER"),
  asyncHandler(async (req, res) => {
    const body = IssueSchema.parse(req.body);

    if (body.role === "SUPPLIER_ENGINEER" && !body.supplierId) {
      res.status(400).json({ error: "supplier_id_required" });
      return;
    }
    if (body.supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: body.supplierId, tenantId: req.auth!.tenantId },
      });
      if (!supplier) {
        res.status(404).json({ error: "supplier_not_found" });
        return;
      }
    }
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      res.status(409).json({ error: "user_with_email_already_exists" });
      return;
    }

    const invitation = await prisma.invitation.create({
      data: {
        token: genToken(),
        tenantId: req.auth!.tenantId,
        email: body.email,
        role: body.role,
        supplierId: body.supplierId ?? null,
        issuedById: req.auth!.userId,
        expiresAt: expiryDate(),
      },
    });

    res.status(201).json({
      invitation: {
        ...invitation,
        link: `${env.PUBLIC_FRONTEND_URL}/onboard/${invitation.token}`,
      },
    });
  }),
);

router.post(
  "/:id/revoke",
  requireAuth,
  requireRole("TML_ADMIN", "TML_ENGINEER"),
  asyncHandler(async (req, res) => {
    const inv = await prisma.invitation.findFirst({
      where: { id: String(req.params.id), tenantId: req.auth!.tenantId },
    });
    if (!inv) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (inv.status !== "pending") {
      res.status(400).json({ error: "invitation_not_pending" });
      return;
    }
    const updated = await prisma.invitation.update({
      where: { id: inv.id },
      data: { status: "revoked", revokedAt: new Date() },
    });
    res.json({ invitation: updated });
  }),
);

router.get(
  "/onboard/:token",
  asyncHandler(async (req, res) => {
    const inv = await prisma.invitation.findUnique({
      where: { token: String(req.params.token) },
      include: {
        tenant: { select: { name: true } },
        issuedBy: { select: { email: true, fullName: true } },
      },
    });
    if (!inv || inv.status !== "pending" || inv.expiresAt < new Date()) {
      res.status(404).json({ error: "invalid_or_expired_invitation" });
      return;
    }
    const supplier = inv.supplierId
      ? await prisma.supplier.findUnique({ where: { id: inv.supplierId }, select: { name: true } })
      : null;
    res.json({
      invitation: {
        email: inv.email,
        role: inv.role,
        tenantName: inv.tenant.name,
        supplierName: supplier?.name ?? null,
        issuedByName: inv.issuedBy.fullName ?? inv.issuedBy.email,
        expiresAt: inv.expiresAt,
      },
    });
  }),
);

const AcceptSchema = z.object({
  fullName: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
});

router.post(
  "/onboard/:token",
  asyncHandler(async (req, res) => {
    const body = AcceptSchema.parse(req.body);
    const inv = await prisma.invitation.findUnique({ where: { token: String(req.params.token) } });
    if (!inv || inv.status !== "pending" || inv.expiresAt < new Date()) {
      res.status(404).json({ error: "invalid_or_expired_invitation" });
      return;
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          tenantId: inv.tenantId,
          email: inv.email,
          fullName: body.fullName,
          passwordHash,
          role: inv.role,
          supplierId: inv.supplierId,
        },
      });
      await tx.invitation.update({
        where: { id: inv.id },
        data: { status: "accepted", acceptedAt: new Date() },
      });
      return u;
    });

    const token = signToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      supplierId: user.supplierId,
    });
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        supplierId: user.supplierId,
      },
    });
  }),
);

export default router;
