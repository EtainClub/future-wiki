import "server-only";

import { createHash } from "node:crypto";
import { ADMIN_SESSION_COOKIE, cookieValue, verifyAdminSessionValue } from "./admin-session";
import { getAdminServices } from "./firebase/admin";

const localRateLimits = new Map<string, { count: number; resetAt: number }>();

export async function verifyAppCheck(request: Request): Promise<void> {
  if (process.env.NODE_ENV !== "production" && process.env.REQUIRE_APP_CHECK !== "true") return;
  const services = getAdminServices();
  const token = request.headers.get("x-firebase-appcheck");
  if (!services || !token) throw new Error("APP_CHECK_REQUIRED");
  try {
    await services.appCheck.verifyToken(token);
  } catch {
    throw new Error("APP_CHECK_REQUIRED");
  }
}

export async function verifyAdmin(request: Request): Promise<{ uid: string }> {
  if (process.env.NODE_ENV !== "production" && request.headers.get("x-demo-admin") === "true") {
    return { uid: "local-admin" };
  }
  const services = getAdminServices();
  if (!services) throw new Error("ADMIN_REQUIRED");
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const decoded = await services.auth.verifyIdToken(authorization.slice(7));
    if (decoded.admin === true) return { uid: decoded.uid };
  }
  const session = await verifyAdminSessionValue(cookieValue(request, ADMIN_SESSION_COOKIE));
  if (!session) throw new Error("ADMIN_REQUIRED");
  return session;
}

function clientKeys(request: Request): string[] {
  const forwarded = (request.headers.get("x-forwarded-for") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const clientIp = forwarded.length > 1 ? forwarded.at(-2)! : forwarded[0] ?? request.headers.get("x-real-ip")?.trim() ?? "local";
  const rawDevice = request.headers.get("x-device-id")?.trim();
  const device = rawDevice && rawDevice.length <= 128 && /^[a-zA-Z0-9-]+$/.test(rawDevice) ? rawDevice : null;
  const candidates = new Set([`ip:${clientIp}`]);
  if (device) candidates.add(`device:${device}`);
  return [...candidates].map((value) => createHash("sha256").update(value).digest("hex"));
}

function nextLimitState(current: { count?: number; resetAt?: number } | undefined, now: number, resetAt: number) {
  return !current?.resetAt || current.resetAt <= now
    ? { count: 1, resetAt }
    : { count: (current.count ?? 0) + 1, resetAt: current.resetAt };
}

export async function enforceRateLimit(request: Request, limit = 10): Promise<{ remaining: number; resetAt: number }> {
  const keys = clientKeys(request);
  const now = Date.now();
  const resetAt = now + 60 * 60 * 1000;
  const services = getAdminServices();

  if (services) {
    return services.db.runTransaction(async (transaction) => {
      const refs = keys.map((key) => services.db.collection("rate_limits").doc(key));
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const states = snapshots.map((snapshot) => nextLimitState(snapshot.data() as { count?: number; resetAt?: number } | undefined, now, resetAt));
      if (states.some((state) => state.count > limit)) throw new Error("RATE_LIMITED");
      refs.forEach((ref, index) => transaction.set(ref, states[index]));
      return {
        remaining: Math.min(...states.map((state) => limit - state.count)),
        resetAt: Math.max(...states.map((state) => state.resetAt)),
      };
    });
  }

  const states = keys.map((key) => nextLimitState(localRateLimits.get(key), now, resetAt));
  if (states.some((state) => state.count > limit)) throw new Error("RATE_LIMITED");
  keys.forEach((key, index) => localRateLimits.set(key, states[index]));
  return {
    remaining: Math.min(...states.map((state) => limit - state.count)),
    resetAt: Math.max(...states.map((state) => state.resetAt)),
  };
}
