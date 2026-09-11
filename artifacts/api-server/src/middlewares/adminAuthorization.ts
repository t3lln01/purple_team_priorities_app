import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

const ADMIN_EMAIL = "sfiliaggi@box.com";

export async function requireAdminForWrites(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }

  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in with an administrator account to make changes." });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const isAdmin = user.emailAddresses.some(
      ({ emailAddress }) => emailAddress.toLowerCase() === ADMIN_EMAIL,
    );

    if (!isAdmin) {
      res.status(403).json({ error: "This account has view-only access." });
      return;
    }

    next();
  } catch (error) {
    console.error("Unable to verify administrator access", error);
    res.status(503).json({ error: "Unable to verify administrator access." });
  }
}