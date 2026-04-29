import { collection, deleteDoc, doc, getDocs, setDoc, query, where } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import type { 
  Lead, 
  LeadGroup, 
  MessageTemplate, 
  Campaign, 
  CommercialAsset, 
  Task, 
  Demo, 
  DoNotContact,
  Settings,
  Message
} from "../types/domain";

// Generic collection names
const COLLECTIONS = {
  LEADS: "leads",
  GROUPS: "leadGroups",
  TEMPLATES: "templates",
  CAMPAIGNS: "campaigns",
  ASSETS: "assets",
  TASKS: "tasks",
  DEMOS: "demos",
  DNC: "doNotContact",
  SETTINGS: "settings",
  MESSAGES: "messages"
};

async function getAll<T>(collectionName: string): Promise<T[]> {
  const db = getFirebaseDb();
  if (!db) return [];
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((item) => item.data() as T);
}

async function saveOne(collectionName: string, id: string, data: any) {
  const db = getFirebaseDb();
  if (!db) return;
  await setDoc(doc(db, collectionName, id), data);
}

async function deleteOne(collectionName: string, id: string) {
  const db = getFirebaseDb();
  if (!db) return;
  await deleteDoc(doc(db, collectionName, id));
}

// Leads
export const loadLeadsFromFirestore = () => getAll<Lead>(COLLECTIONS.LEADS);
export const saveLeadToFirestore = (lead: Lead) => saveOne(COLLECTIONS.LEADS, lead.id, lead);
export const deleteLeadFromFirestore = (leadId: string) => deleteOne(COLLECTIONS.LEADS, leadId);

// Groups
export const loadGroupsFromFirestore = () => getAll<LeadGroup>(COLLECTIONS.GROUPS);
export const saveGroupToFirestore = (group: LeadGroup) => saveOne(COLLECTIONS.GROUPS, group.id, group);
export const deleteGroupFromFirestore = (groupId: string) => deleteOne(COLLECTIONS.GROUPS, groupId);

// Templates
export const loadTemplatesFromFirestore = () => getAll<MessageTemplate>(COLLECTIONS.TEMPLATES);
export const saveTemplateToFirestore = (template: MessageTemplate) => saveOne(COLLECTIONS.TEMPLATES, template.id, template);
export const deleteTemplateFromFirestore = (templateId: string) => deleteOne(COLLECTIONS.TEMPLATES, templateId);

// Campaigns
export const loadCampaignsFromFirestore = () => getAll<Campaign>(COLLECTIONS.CAMPAIGNS);
export const saveCampaignToFirestore = (campaign: Campaign) => saveOne(COLLECTIONS.CAMPAIGNS, campaign.id, campaign);
export const deleteCampaignFromFirestore = (campaignId: string) => deleteOne(COLLECTIONS.CAMPAIGNS, campaignId);

// Assets
export const loadAssetsFromFirestore = () => getAll<CommercialAsset>(COLLECTIONS.ASSETS);
export const saveAssetToFirestore = (asset: CommercialAsset) => saveOne(COLLECTIONS.ASSETS, asset.id, asset);
export const deleteAssetFromFirestore = (assetId: string) => deleteOne(COLLECTIONS.ASSETS, assetId);

// Tasks
export const loadTasksFromFirestore = () => getAll<Task>(COLLECTIONS.TASKS);
export const saveTaskToFirestore = (task: Task) => saveOne(COLLECTIONS.TASKS, task.id, task);
export const deleteTaskFromFirestore = (taskId: string) => deleteOne(COLLECTIONS.TASKS, taskId);

// Demos
export const loadDemosFromFirestore = () => getAll<Demo>(COLLECTIONS.DEMOS);
export const saveDemoToFirestore = (demo: Demo) => saveOne(COLLECTIONS.DEMOS, demo.id, demo);
export const deleteDemoFromFirestore = (demoId: string) => deleteOne(COLLECTIONS.DEMOS, demoId);

// Do Not Contact
export const loadDNCFromFirestore = () => getAll<DoNotContact>(COLLECTIONS.DNC);
export const saveDNCToFirestore = (dnc: DoNotContact) => saveOne(COLLECTIONS.DNC, dnc.id, dnc);

// Settings
export async function loadSettingsFromFirestore(): Promise<Settings | null> {
  const db = getFirebaseDb();
  if (!db) return null;
  const snapshot = await getDocs(collection(db, COLLECTIONS.SETTINGS));
  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as Settings;
}
export const saveSettingsToFirestore = (settings: Settings) => saveOne(COLLECTIONS.SETTINGS, "global", settings);

// Messages
export const loadMessagesFromFirestore = () => getAll<Message>(COLLECTIONS.MESSAGES);
export const saveMessageToFirestore = (message: Message) => saveOne(COLLECTIONS.MESSAGES, message.id, message);
