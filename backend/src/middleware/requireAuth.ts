import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export interface AuthedRequest extends Request {
  userId?: string;
}

/**
 * Optional to use for now - the assignment doesn't require every route to
 * be locked down, but if you want /api/emails/* to only work when logged
 * in, add `requireAuth` as a middleware on that router, e.g.:
 *
 *   import { requireAuth } from "../middleware/requireAuth";
 *   emailsRouter.use(requireAuth);
 */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
