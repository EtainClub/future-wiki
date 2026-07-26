"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

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
  const app = clientApp();
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
  if (!app || !siteKey) return null;
  appCheck ??= initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
  return (await getToken(appCheck)).token;
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
