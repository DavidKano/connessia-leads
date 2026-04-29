import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyDETrbWHyd5Zw53RDyRj68ys5rGH60RH4Q",
  authDomain: "connessia-leads.firebaseapp.com",
  projectId: "connessia-leads",
  storageBucket: "connessia-leads.firebasestorage.app",
  messagingSenderId: "1004194060634",
  appId: "1:1004194060634:web:c49f33c862280942c97b63"
};

export const firebaseConfigured = true;

export const app = getApps()[0] ?? initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export function getFirebaseDb() {
  return db;
}

export function getFirebaseStorage() {
  return storage;
}
