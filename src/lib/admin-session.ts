import "server-only";

import { getAdminServices } from "./firebase/admin";

export const ADMIN_SESSION_COOKIE = "future_wiki_admin";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5;

export async function verifyAdminSessionValue(value: string | undefined): Promise<{ uid: string } | null> {
  const services = getAdminServices();
  if (!services || !value) return null;
  try {
    const decoded = await services.auth.verifySessionCookie(value, true);
    return decoded.admin === true ? { uid: decoded.uid } : null;
  } catch {
    return null;
  }
}

export function cookieValue(request: Request, name: string): string | undefined {
  const pair = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}