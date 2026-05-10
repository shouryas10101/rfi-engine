import "dotenv/config";
import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { errorHandler } from "./middleware/asyncHandler.js";
import authRoutes from "./routes/auth.js";
import projectsRoutes from "./routes/projects.js";
import rfisRoutes from "./routes/rfis.js";
import sessionsRoutes from "./routes/sessions.js";
import suppliersRoutes from "./routes/suppliers.js";
import documentsRoutes from "./routes/documents.js";
import invitationsRoutes from "./routes/invitations.js";

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path }, "request");
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, env: env.NODE_ENV, time: new Date().toISOString() });
});

app.use("/auth", authRoutes);
app.use("/projects", projectsRoutes);
app.use("/rfis", rfisRoutes);
app.use("/sessions", sessionsRoutes);
app.use("/suppliers", suppliersRoutes);
app.use("/documents", documentsRoutes);
app.use("/invitations", invitationsRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "route_not_found" });
});
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`RFI engine API listening on :${env.PORT}`);
  logger.info(`Storage: ${env.STORAGE_PROVIDER}`);
  logger.info(`LLM: ${env.OPENAI_API_KEY ? "configured" : "fallback (template-only)"}`);
});
