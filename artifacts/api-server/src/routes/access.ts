import { clerkClient } from "@clerk/express";
import { Router, type NextFunction, type Request, type Response } from "express";
import { ADMIN_EMAIL, getRequestAccess } from "../middlewares/adminAuthorization";

export const accessRouter = Router();

async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const access = await getRequestAccess(req);
    if (!access.userId) {
      res.status(401).json({ error: "Sign in as the administrator." });
      return;
    }
    if (!access.isAdmin) {
      res.status(403).json({ error: "Only the administrator can manage users." });
      return;
    }
    next();
  } catch (error) {
    console.error("Unable to verify administrator access", error);
    res.status(503).json({ error: "Unable to verify administrator access." });
  }
}

accessRouter.get("/access/me", async (req, res) => {
  try {
    const access = await getRequestAccess(req);
    res.json(access);
  } catch (error) {
    console.error("Unable to load access details", error);
    res.status(503).json({ error: "Unable to load access details." });
  }
});

accessRouter.get("/access/users", requireAdmin, async (_req, res) => {
  try {
    const result = await clerkClient.users.getUserList({ limit: 100 });
    const users = result.data.map((user) => {
      const email = user.primaryEmailAddress?.emailAddress
        ?? user.emailAddresses[0]?.emailAddress
        ?? "";
      const isAdmin = user.emailAddresses.some(
        ({ emailAddress }) => emailAddress.toLowerCase() === ADMIN_EMAIL,
      );
      return {
        id: user.id,
        email,
        isAdmin,
        canWrite: isAdmin || user.publicMetadata?.role === "writer",
        createdAt: user.createdAt,
        lastSignInAt: user.lastSignInAt,
      };
    });
    res.json({ users });
  } catch (error) {
    console.error("Unable to list users", error);
    res.status(503).json({ error: "Unable to list users." });
  }
});

accessRouter.post("/access/users", requireAdmin, async (req, res) => {
  const email = typeof req.body?.email === "string"
    ? req.body.email.trim().toLowerCase()
    : "";
  const password = typeof req.body?.password === "string"
    ? req.body.password
    : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must contain at least 8 characters." });
    return;
  }
  if (email === ADMIN_EMAIL) {
    res.status(409).json({ error: "The administrator account already exists." });
    return;
  }

  try {
    const existing = await clerkClient.users.getUserList({
      emailAddress: [email],
      limit: 1,
    });
    if (existing.data.length > 0) {
      res.status(409).json({ error: "An account already exists for this username." });
      return;
    }

    const user = await clerkClient.users.createUser({
      emailAddress: [email],
      password,
      publicMetadata: { role: "writer" },
    });
    res.status(201).json({
      user: {
        id: user.id,
        email,
        isAdmin: false,
        canWrite: true,
        createdAt: user.createdAt,
        lastSignInAt: user.lastSignInAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create user.";
    console.error("Unable to create write-enabled user", error);
    res.status(400).json({ error: message });
  }
});