import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function credentials() {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccount) {
    return cert(JSON.parse(serviceAccount));
  }
  return applicationDefault();
}

export function getAdminApp(): App | null {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;
  const inFirebaseRuntime = Boolean(projectId || process.env.FIREBASE_CONFIG || process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!inFirebaseRuntime) return null;
  if (getApps().length) return getApps()[0]!;
  return initializeApp({
    credential: credentials(),
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

export function getAdminServices() {
  const app = getAdminApp();
  if (!app) return null;
  return {
    app,
    auth: getAuth(app),
    appCheck: getAppCheck(app),
    db: getFirestore(app),
    storage: getStorage(app),
  };
}
