import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";
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

export async function getUsageData(): Promise<{ count: number; lastReset: string } | null> {
  const db = getFirebaseDb();
  if (!db) return null;
  
  const snapshot = await getDoc(doc(db, configCollection, usageDocId));
  if (!snapshot.exists()) return { count: 0, lastReset: new Date().toISOString() };
  
  return snapshot.data() as { count: number; lastReset: string };
}

export async function updateUsageCount(count: number, lastReset: string) {
  const db = getFirebaseDb();
  if (!db) return;
  
  await setDoc(doc(db, configCollection, usageDocId), {
    count,
    lastReset
  });
}

export async function incrementUsageInDb(amount = 1) {
  const db = getFirebaseDb();
  if (!db) return;
  
  const docRef = doc(db, configCollection, usageDocId);
  await updateDoc(docRef, {
    count: increment(amount)
  });
}
