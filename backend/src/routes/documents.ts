import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getStorage } from "../documents/storage.js";
import { extractText } from "../documents/extract.js";
import { env } from "../config/env.js";
import { isTml } from "../middleware/auth.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES },
});

router.use(requireAuth);

const ScopeSchema = z.object({
  rfiId: z.string().optional(),
  catalogueItemId: z.string().optional(),
});

router.post(
  "/upload",
  upload.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    if (!req.file) {
      res.status(400).json({ error: "no_file" });
      return;
    }
    const params = ScopeSchema.parse({
      rfiId: req.body.rfiId,
      catalogueItemId: req.body.catalogueItemId,
    });
    const scopeCount = [params.rfiId, params.catalogueItemId].filter(Boolean).length;
    if (scopeCount !== 1) {
      res.status(400).json({ error: "exactly_one_scope_required" });
      return;
    }

    // Authorization: TML must own the RFI's tenant; supplier must own the catalogue item
    if (params.rfiId) {
      if (!isTml(auth.role)) {
        res.status(403).json({ error: "tml_only" });
        return;
      }
      const rfi = await prisma.rFI.findFirst({
        where: { id: params.rfiId, project: { tenantId: auth.tenantId } },
      });
      if (!rfi) {
        res.status(404).json({ error: "rfi_not_found" });
        return;
      }
    }
    if (params.catalogueItemId) {
      if (auth.role !== "SUPPLIER_ENGINEER") {
        res.status(403).json({ error: "supplier_engineer_only" });
        return;
      }
      const item = await prisma.catalogueItem.findFirst({
        where: { id: params.catalogueItemId, supplierId: auth.supplierId ?? "" },
      });
      if (!item) {
        res.status(404).json({ error: "catalogue_item_not_found" });
        return;
      }
    }

    const storage = getStorage();
    const storageKey = `${nanoid(12)}/${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await storage.put(storageKey, req.file.buffer, req.file.mimetype);

    const ext = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);

    const doc = await prisma.document.create({
      data: {
        scope: params.rfiId ? "rfi" : "catalogue_item",
        rfiId: params.rfiId ?? null,
        catalogueItemId: params.catalogueItemId ?? null,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        storageKey,
        storageProvider: storage.providerName(),
        extractedText: ext.text,
        extractionStatus: ext.status,
        uploadedById: auth.userId,
      },
    });

    res.status(201).json({ document: { ...doc, extractedText: undefined } });
  }),
);

router.post(
  "/upload-for-turn",
  upload.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    if (!req.file) {
      res.status(400).json({ error: "no_file" });
      return;
    }

    const storage = getStorage();
    const storageKey = `${nanoid(12)}/${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await storage.put(storageKey, req.file.buffer, req.file.mimetype);

    const ext = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);

    const doc = await prisma.document.create({
      data: {
        scope: "turn",
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        storageKey,
        storageProvider: storage.providerName(),
        extractedText: ext.text,
        extractionStatus: ext.status,
        uploadedById: auth.userId,
      },
    });

    res.status(201).json({ document: { ...doc, extractedText: undefined } });
  }),
);

router.get(
  "/:id/download",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        rfi: { include: { project: true } },
        catalogueItem: { include: { supplier: true } },
        turn: { include: { session: { include: { supplier: true } } } },
      },
    });
    if (!doc) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const tenantId =
      doc.rfi?.project.tenantId ??
      doc.catalogueItem?.supplier.tenantId ??
      doc.turn?.session.supplier.tenantId;
    if (tenantId !== auth.tenantId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const storage = getStorage();
    if (storage.providerName() === "r2") {
      const url = await storage.signedDownloadUrl(doc.storageKey, 300);
      res.json({ url });
      return;
    }

    const buffer = await storage.get(doc.storageKey);
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${doc.filename}"`);
    res.send(buffer);
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        rfi: { include: { project: true } },
        catalogueItem: { include: { supplier: true } },
      },
    });
    if (!doc) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const isOwner = doc.uploadedById === auth.userId;
    const isTmlAdmin = auth.role === "TML_ADMIN";
    if (!isOwner && !isTmlAdmin) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const storage = getStorage();
    await storage.delete(doc.storageKey);
    await prisma.document.delete({ where: { id: doc.id } });
    res.json({ ok: true });
  }),
);

export default router;
