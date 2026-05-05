import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import type { FirebaseClientConfig } from "../types/domain";

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

function hasFirebaseConfig(config?: Partial<FirebaseClientConfig> | FirebaseOptions | null) {
  return Boolean(
    config?.apiKey &&
    config?.authDomain &&
    config?.projectId &&
    config?.storageBucket &&
    config?.messagingSenderId &&
    config?.appId
  );
}

export const firebaseConfigured = hasFirebaseConfig(firebaseConfig);

export let app: FirebaseApp | null = null;
export let auth: Auth | null = null;
export let db: Firestore | null = null;
export let storage: FirebaseStorage | null = null;
let activeFirebaseConfig: FirebaseClientConfig | null = firebaseConfigured ? firebaseConfig as FirebaseClientConfig : null;
let hostingConfigPromise: Promise<FirebaseClientConfig | null> | null = null;

export function configureFirebase(config?: Partial<FirebaseClientConfig> | null) {
  if (app) return app;
  const nextConfig = hasFirebaseConfig(config) ? config : firebaseConfigured ? firebaseConfig : null;
  if (!nextConfig) return null;

  app = getApps()[0] ?? initializeApp(nextConfig as FirebaseOptions);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  activeFirebaseConfig = nextConfig as FirebaseClientConfig;
  return app;
}

configureFirebase();

async function loadHostingFirebaseConfig() {
  if (typeof window === "undefined") return null;
  if (!hostingConfigPromise) {
    hostingConfigPromise = fetch("/__/firebase/init.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => (hasFirebaseConfig(config) ? config as FirebaseClientConfig : null))
      .catch(() => null);
  }
  return hostingConfigPromise;
}

export async function ensureFirebaseConfigured(config?: Partial<FirebaseClientConfig> | null) {
  const configured = configureFirebase(config);
  if (configured) return configured;

  const hostingConfig = await loadHostingFirebaseConfig();
  return configureFirebase(hostingConfig);
}

export function getActiveFirebaseConfig() {
  return activeFirebaseConfig;
}

export function getFirebaseDb(config?: Partial<FirebaseClientConfig> | null) {
  configureFirebase(config);
  return db;
}

export function getFirebaseStorage(config?: Partial<FirebaseClientConfig> | null) {
  configureFirebase(config);
  return storage;
}
