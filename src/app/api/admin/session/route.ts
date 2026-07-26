import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE_SECONDS } from "@/lib/admin-session";
import { getAdminServices } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const services = getAdminServices();
  const authorization = request.headers.get("authorization");
  if (!services || !authorization?.startsWith("Bearer ")) return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 });
  try {
    const idToken = authorization.slice(7);
    const decoded = await services.auth.verifyIdToken(idToken);
    if (decoded.admin !== true) return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 });
    const sessionCookie = await services.auth.createSessionCookie(idToken, { expiresIn: ADMIN_SESSION_MAX_AGE_SECONDS * 1000 });
    (await cookies()).set(ADMIN_SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
      priority: "high",
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 });
  }
}

export async function DELETE() {
  (await cookies()).set(ADMIN_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return Response.json({ ok: true });
}