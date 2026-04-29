import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import type { Lead } from "../types/domain";
import { getFirebaseDb } from "./firebase";

const leadsCollection = "leads";

export async function loadLeadsFromFirestore() {
  const db = getFirebaseDb();
  if (!db) return null;
  const snapshot = await getDocs(collection(db, leadsCollection));
  return snapshot.docs.map((item) => item.data() as Lead);
}

export async function saveLeadToFirestore(lead: Lead) {
  const db = getFirebaseDb();
  if (!db) return;
  await setDoc(doc(db, leadsCollection, lead.id), lead);
}

export async function saveLeadsToFirestore(leads: Lead[]) {
  await Promise.all(leads.map((lead) => saveLeadToFirestore(lead)));
}

export async function deleteLeadFromFirestore(leadId: string) {
  const db = getFirebaseDb();
  if (!db) return;
  await deleteDoc(doc(db, leadsCollection, leadId));
}
