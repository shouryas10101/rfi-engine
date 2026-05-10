import type { Request, Response, NextFunction, RequestHandler } from "express";

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  if (e?.name === "ZodError") {
    res.status(400).json({ error: "validation_error", details: e.issues });
    return;
  }
  if (e?.code === "P2002") {
    res.status(409).json({ error: "conflict", details: e.meta });
    return;
  }
  if (e?.code === "P2025") {
    res.status(404).json({ error: "not_found" });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal_server_error" });
}
