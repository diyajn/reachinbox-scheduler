import { Router } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db";

type GoogleTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
};

type GoogleProfile = {
  id: string;
  email: string;
  name?: string;
  picture?: string;
};

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

/**
 * Step 1: send the browser to Google's consent screen.
 * The frontend just links a button to GET /auth/google - no JS needed there.
 */
authRouter.get("/google", (_req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

/**
 * Step 2: Google redirects back here with a one-time `code`. We exchange it
 * for tokens, use the access token to fetch the user's profile, upsert a
 * User row, sign our own JWT, and hand it to the frontend.
 *
 * We pass the JWT back via a URL query param on a redirect to the frontend
 * (rather than a cross-origin cookie) because localhost:3000 and
 * localhost:4000 are different origins - a cookie set by :4000 needs
 * SameSite=None + Secure to be readable from :3000's fetch calls, which is
 * extra complexity not worth it for this assignment. The frontend's
 * /auth/callback page reads the token from the URL once and stores it in
 * localStorage; every subsequent API call sends it as an Authorization
 * header (see requireAuth.ts and frontend/src/lib/auth.ts).
 */
authRouter.get("/google/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    if (!code) return res.status(400).send("Missing code");

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
        grant_type: "authorization_code",
      }),
    });
    const tokenData = (await tokenRes.json()) as GoogleTokenResponse;

    if (!tokenData.access_token) {
      console.error("Google token exchange failed:", tokenData);
      return res.status(500).send("Google login failed");
    }

    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const profile = (await profileRes.json()) as GoogleProfile;
    // profile: { id, email, name, picture, ... }

    const user = await prisma.user.upsert({
      where: { email: profile.email },
      update: { name: profile.name, avatarUrl: profile.picture },
      create: {
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.picture,
      },
    });

    const sessionToken = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.redirect(`${FRONTEND_URL}/auth/callback?token=${sessionToken}`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("Login failed");
  }
});

/**
 * GET /api/me - the frontend calls this with `Authorization: Bearer <token>`
 * on load to find out who's logged in (and whether the token is still valid).
 */
authRouter.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ error: "User not found" });
    res.json({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});
