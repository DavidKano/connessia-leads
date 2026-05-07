import { doc, getDoc, runTransaction, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import { encrypt, decrypt } from "../utils/encryption";

const configCollection = "appConfig";
const googleMapsDocId = "googleMaps";

export async function saveGoogleMapsApiKey(apiKey: string) {
  const db = getFirebaseDb();
  if (!db) {
    throw new Error("Firebase not configured");
  }
  
  const encryptedKey = await encrypt(apiKey);
  await setDoc(doc(db, configCollection, googleMapsDocId), {
    apiKey: encryptedKey,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Returns the decrypted API key from Firestore.
 */
export async function getGoogleMapsApiKey(): Promise<string | null> {
  const db = getFirebaseDb();
  if (!db) return null;
  
  const snapshot = await getDoc(doc(db, configCollection, googleMapsDocId));
  if (!snapshot.exists()) return null;
  
  const data = snapshot.data();
  if (!data.apiKey) return null;
  
  try {
    return await decrypt(data.apiKey);
  } catch (err) {
    console.error("Error decrypting API Key from Firestore", err);
    return null;
  }
}

/**
 * Checks if an API key exists in Firestore without decrypting it.
 */
const usageDocId = "usage";
const usageStorageKey = "connessia-google-maps-usage";

export interface UsageData {
  count: number;
  lastReset: string;
  monthKey: string;
  updatedAt?: string;
}

export function getCurrentUsageMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getDaysUntilUsageReset(date = new Date()) {
  const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return Math.ceil((nextMonth.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function getMonthStartIso(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
}

function emptyUsage(date = new Date()): UsageData {
  return {
    count: 0,
    lastReset: getMonthStartIso(date),
    monthKey: getCurrentUsageMonthKey(date),
    updatedAt: date.toISOString()
  };
}

function normalizeUsageData(data: Partial<UsageData> | undefined, date = new Date()): UsageData {
  const currentMonthKey = getCurrentUsageMonthKey(date);
  const stored = data ?? {};
  if (!stored.monthKey) {
    const lastReset = stored.lastReset ? new Date(stored.lastReset) : null;
    const legacyMonthKey = lastReset && !Number.isNaN(lastReset.getTime()) ? getCurrentUsageMonthKey(lastReset) : "";
    if (legacyMonthKey !== currentMonthKey) return emptyUsage(date);
    return {
      count: Number(stored.count) || 0,
      lastReset: stored.lastReset ?? getMonthStartIso(date),
      monthKey: currentMonthKey,
      updatedAt: stored.updatedAt ?? date.toISOString()
    };
  }

  if (stored.monthKey !== currentMonthKey) return emptyUsage(date);

  return {
    count: Number(stored.count) || 0,
    lastReset: stored.lastReset ?? getMonthStartIso(date),
    monthKey: currentMonthKey,
    updatedAt: stored.updatedAt ?? date.toISOString()
  };
}

function readLocalUsage(): UsageData {
  if (typeof localStorage === "undefined") return emptyUsage();
  try {
    const stored = localStorage.getItem(usageStorageKey);
    return normalizeUsageData(stored ? JSON.parse(stored) : undefined);
  } catch {
    return emptyUsage();
  }
}

function saveLocalUsage(usage: UsageData) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(usageStorageKey, JSON.stringify(usage));
}

export async function getUsageData(): Promise<UsageData> {
  const db = getFirebaseDb();
  if (!db) return readLocalUsage();

  try {
    const snapshot = await getDoc(doc(db, configCollection, usageDocId));
    const usage = normalizeUsageData(snapshot.exists() ? (snapshot.data() as Partial<UsageData>) : undefined);
    
    if (!snapshot.exists() || snapshot.data().monthKey !== usage.monthKey) {
      await setDoc(doc(db, configCollection, usageDocId), usage);
    }

    saveLocalUsage(usage);
    return usage;
  } catch (error) {
    console.error("No se pudo leer el uso de Google Maps en Firestore", error);
    return readLocalUsage();
  }
}

export async function updateUsageCount(count: number, lastReset: string) {
  const db = getFirebaseDb();
  const usage = normalizeUsageData({ count, lastReset });
  if (!db) {
    saveLocalUsage(usage);
    return;
  }
  
  await setDoc(doc(db, configCollection, usageDocId), usage);
  saveLocalUsage(usage);
}

export async function incrementUsageInDb(amount = 1): Promise<UsageData> {
  const db = getFirebaseDb();
  if (!db) {
    const current = readLocalUsage();
    const next = normalizeUsageData({ ...current, count: current.count + amount, updatedAt: new Date().toISOString() });
    saveLocalUsage(next);
    return next;
  }
  
  const docRef = doc(db, configCollection, usageDocId);
  try {
    const nextUsage = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(docRef);
      const current = normalizeUsageData(snapshot.exists() ? (snapshot.data() as Partial<UsageData>) : undefined);
      const next = {
        ...current,
        count: current.count + amount,
        updatedAt: new Date().toISOString()
      };
      transaction.set(docRef, next);
      return next;
    });

    saveLocalUsage(nextUsage);
    return nextUsage;
  } catch (error) {
    console.error("No se pudo guardar el uso de Google Maps en Firestore", error);
    const current = readLocalUsage();
    const fallback = normalizeUsageData({ ...current, count: current.count + amount, updatedAt: new Date().toISOString() });
    saveLocalUsage(fallback);
    return fallback;
  }
}
