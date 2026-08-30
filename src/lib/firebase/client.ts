"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
import { getAuth, GoogleAuthProvider, signInAnonymously, signInWithPopup, signOut } from "firebase/auth";
import { IS_TOSS_APP } from "@/lib/platform";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
let appCheck: AppCheck | null = null;

function clientApp(): FirebaseApp | null {
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) return null;
  return getApps()[0] ?? initializeApp(config);
}

export function clientAuth() {
  const app = clientApp();
  return app ? getAuth(app) : null;
}

export async function getAppCheckToken(): Promise<string | null> {
  // App Check는 reCAPTCHA Enterprise가 등록된 도메인에서만 통과한다.
  // 토스 웹뷰는 로컬 번들을 실행해 등록 도메인이 없으므로 익명 로그인으로 대체한다.
  if (IS_TOSS_APP) return null;
  const app = clientApp();
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
  if (!app || !siteKey) return null;
  appCheck ??= initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
  return (await getToken(appCheck)).token;
}

/** 토스 빌드의 클라이언트 신원. 팝업이 필요 없는 Firebase 익명 로그인을 쓴다. */
async function anonymousIdToken(): Promise<string | null> {
  const auth = clientAuth();
  if (!auth) return null;
  try {
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * /api/ask에 붙일 클라이언트 증명 헤더.
 *
 * 웹은 App Check 토큰, 토스 번들은 익명 사용자의 ID 토큰을 보낸다.
 * 두 경로 모두 서버가 Firebase로 직접 검증하므로 클라이언트에 비밀값을 심지 않는다.
 */
export async function clientAttestationHeaders(): Promise<Record<string, string>> {
  if (IS_TOSS_APP) {
    const token = await anonymousIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  const token = await getAppCheckToken();
  return token ? { "x-firebase-appcheck": token } : {};
}

export async function signInAdmin(): Promise<string | null> {
  const auth = clientAuth();
  if (!auth) return null;
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user.getIdToken(true);
}

export async function signOutAdmin() {
  const auth = clientAuth();
  if (auth) await signOut(auth);
}
