import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

export const ADMIN_EMAIL = "sfiliaggi@box.com";

export async function getRequestAccess(req: Request): Promise<{
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
  canWrite: boolean;
}> {
  const { userId } = getAuth(req);
  if (!userId) {
    return { userId: null, email: null, isAdmin: false, canWrite: false };
  }

  const user = await clerkClient.users.getUser(userId);
  const email = user.primaryEmailAddress?.emailAddress
    ?? user.emailAddresses[0]?.emailAddress
    ?? null;
  const isAdmin = user.emailAddresses.some(
    ({ emailAddress }) => emailAddress.toLowerCase() === ADMIN_EMAIL,
  );
  const canWrite = isAdmin || user.publicMetadata?.role === "writer";

  return { userId, email, isAdmin, canWrite };
}

export function requireAuthenticatedUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to access this resource." });
      return;
    }

    next();
  } catch (error) {
    console.error("Unable to verify authenticated access", error);
    res.status(503).json({ error: "Unable to verify authenticated access." });
  }
}

export async function requireWriteAccessForWrites(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }

  try {
    const access = await getRequestAccess(req);
    if (!access.userId) {
      res.status(401).json({ error: "Sign in with a write-enabled account to make changes." });
      return;
    }
    if (!access.canWrite) {
      res.status(403).json({ error: "This account has view-only access." });
      return;
    }

    next();
  } catch (error) {
    console.error("Unable to verify write access", error);
    res.status(503).json({ error: "Unable to verify write access." });
  }
}