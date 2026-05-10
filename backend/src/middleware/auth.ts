import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../auth/jwt.js";

declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_authorization" });
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }
  req.auth = payload;
  next();
}

export function requireRole(
  ...roles: JwtPayload["role"][]
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: "forbidden", required: roles });
      return;
    }
    next();
  };
}

export function isTml(role: JwtPayload["role"]): boolean {
  return role === "TML_ADMIN" || role === "TML_ENGINEER";
}
