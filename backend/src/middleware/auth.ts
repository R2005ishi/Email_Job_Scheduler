import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, verifySession } from '../services/authService';

export interface AuthedRequest extends Request {
  userId: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    (req as AuthedRequest).userId = verifySession(token).sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
}
