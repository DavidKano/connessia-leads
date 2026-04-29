import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import type { FirebaseClientConfig } from "../types/domain";

const envFirebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

function getSavedFirebaseConfig(): FirebaseOptions | null {
  try {
    const raw = localStorage.getItem("connessia-leads-demo-state");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { settings?: { firebaseConfig?: FirebaseClientConfig } };
    const config = parsed.settings?.firebaseConfig;
    if (!config?.apiKey || !config.projectId) return null;
    return {
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
      measurementId: config.measurementId
    };
  } catch {
    return null;
  }
}

function getFirebaseConfig() {
  return getSavedFirebaseConfig() ?? envFirebaseConfig;
}

const firebaseConfig = getFirebaseConfig();

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const app = firebaseConfigured ? (getApps()[0] ?? initializeApp(firebaseConfig)) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;

export function getFirebaseDb() {
  const config = getFirebaseConfig();
  if (!config.apiKey || !config.projectId) return null;
  const firebaseApp = getApps()[0] ?? initializeApp(config);
  return getFirestore(firebaseApp);
}
