import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { signToken } from "../auth/jwt.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = LoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    if (user.role === "SUPPLIER_ENGINEER") {
      if (!user.supplierId) {
        res.status(403).json({ error: "account_disabled" });
        return;
      }
      const supplierExists = await prisma.supplier.findUnique({ where: { id: user.supplierId }, select: { id: true } });
      if (!supplierExists) {
        res.status(403).json({ error: "account_disabled" });
        return;
      }
    }
    const token = signToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      supplierId: user.supplierId,
    });
    res.json({
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
