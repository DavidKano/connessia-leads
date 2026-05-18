import { useMemo, useState } from "react";
import {
  demoAssets,
  demoCampaigns,
  demoDemos,
  demoDoNotContact,
  demoLeadGroups,
  demoLeads,
  demoMessages,
  demoQueue,
  demoSettings,
  demoTasks,
  demoTemplates,
  demoUsers
} from "../data/demoData";
import type {
  AppUser,
  Campaign,
  CommercialAsset,
  Demo,
  DoNotContact,
  Lead,
  LeadGroup,
  Message,
  MessageTemplate,
  Metrics,
  QueueItem,
  Settings,
  Task,
  UserRole
} from "../types/domain";
import { 
  deleteLeadFromFirestore, 
  loadLeadsFromFirestore, 
  saveLeadToFirestore,
  loadGroupsFromFirestore,
  saveGroupToFirestore,
  deleteGroupFromFirestore,
  loadTemplatesFromFirestore,
  saveTemplateToFirestore,
  deleteTemplateFromFirestore,
  loadCampaignsFromFirestore,
  saveCampaignToFirestore,
  deleteCampaignFromFirestore,
  loadAssetsFromFirestore,
  saveAssetToFirestore,
  deleteAssetFromFirestore,
  loadTasksFromFirestore,
  saveTaskToFirestore,
  deleteTaskFromFirestore,
  loadDemosFromFirestore,
  saveDemoToFirestore,
  deleteDemoFromFirestore,
  loadDNCFromFirestore,
  saveDNCToFirestore,
  loadSettingsFromFirestore,
  saveSettingsToFirestore,
  loadMessagesFromFirestore,
  saveMessageToFirestore,
  deleteMessageFromFirestore
} from "./firestoreStore";
import { configureFirebase, ensureFirebaseConfigured, getActiveFirebaseConfig } from "./firebase";
import { normalizePhone } from "../utils/formatters";

export interface CrmState {
  users: AppUser[];
  currentUser: AppUser;
  leads: Lead[];
  leadGroups: LeadGroup[];
  templates: MessageTemplate[];
  campaigns: Campaign[];
  messages: Message[];
  queue: QueueItem[];
  doNotContact: DoNotContact[];
  tasks: Task[];
  demos: Demo[];
  assets: CommercialAsset[];
  settings: Settings;
}

const storageKey = "connessia-leads-demo-state";
const firebaseConfigStorageKey = "connessia-firebase-config";


const initialState: CrmState = {
  users: demoUsers,
  currentUser: demoUsers[0],
  leads: [],
  leadGroups: [],
  templates: [],
  campaigns: [],
  messages: [],
  queue: [],
  doNotContact: [],
  tasks: [],
  demos: [],
  assets: [],
  settings: demoSettings
};

function loadState(): CrmState {
  const cleanState = { ...initialState };
  if (typeof window === "undefined") return cleanState;

  try {
    const raw = window.localStorage.getItem(storageKey);
    const savedFirebaseConfig = loadLocalFirebaseConfig();
    if (!raw) {
      return savedFirebaseConfig
        ? { ...cleanState, settings: { ...cleanState.settings, firebaseConfig: savedFirebaseConfig } }
        : cleanState;
    }
    const stored = JSON.parse(raw) as Partial<CrmState>;
    return normalizeLoadedState({
      ...cleanState,
      currentUser: stored.currentUser ?? cleanState.currentUser,
      settings: {
        ...cleanState.settings,
        ...stored.settings,
        firebaseConfig: savedFirebaseConfig ?? stored.settings?.firebaseConfig ?? cleanState.settings.firebaseConfig
      }
    });
  } catch {
    const savedFirebaseConfig = loadLocalFirebaseConfig();
    return savedFirebaseConfig
      ? { ...cleanState, settings: { ...cleanState.settings, firebaseConfig: savedFirebaseConfig } }
      : cleanState;
  }
}

function normalizeCampaign(campaign: Campaign): Campaign {
  return {
    ...campaign,
    mensajesPostSi: campaign.mensajesPostSi ?? [{ step: 3 }, { step: 4 }],
    segmento: {
      ...campaign.segmento,
      grupoIds: campaign.segmento.grupoIds ?? []
    }
  };
}

function normalizeLoadedState(state: CrmState): CrmState {
  return {
    ...state,
    leads: state.leads.map((lead) => ({ ...lead, grupoIds: lead.grupoIds ?? [] })),
    campaigns: state.campaigns.map(normalizeCampaign)
  };
}

function persistLocalState(state: CrmState) {
  if (typeof window === "undefined") return;
  try {
    const minimalStateToSave = {
      currentUser: state.currentUser,
      settings: state.settings
    };
    window.localStorage.setItem(storageKey, JSON.stringify(minimalStateToSave));
    persistLocalFirebaseConfig(state.settings.firebaseConfig);
  } catch {
    // Best effort local persistence for the user config / session details.
  }
}

function loadLocalFirebaseConfig(): Settings["firebaseConfig"] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(firebaseConfigStorageKey);
    if (!raw) return null;
    const config = JSON.parse(raw) as Settings["firebaseConfig"];
    return isFirebaseConfigFilled(config) ? config : null;
  } catch {
    return null;
  }
}

function persistLocalFirebaseConfig(config: Settings["firebaseConfig"]) {
  if (typeof window === "undefined") return;
  if (!isFirebaseConfigFilled(config)) return;
  try {
    window.localStorage.setItem(firebaseConfigStorageKey, JSON.stringify(config));
  } catch {
    // Best effort local persistence for the admin Firebase form.
  }
}

function isFirebaseConfigFilled(config?: Partial<Settings["firebaseConfig"]> | null) {
  return Boolean(
    config?.apiKey &&
      config?.authDomain &&
      config?.projectId &&
      config?.storageBucket &&
      config?.messagingSenderId &&
      config?.appId
  );
}

function resolveSettings(remoteSettings: Settings | null, currentSettings: Settings): Settings {
  const localFirebaseConfig = loadLocalFirebaseConfig();
  const activeFirebaseConfig = getActiveFirebaseConfig();
  return {
    ...currentSettings,
    ...remoteSettings,
    firebaseConfig: localFirebaseConfig ?? remoteSettings?.firebaseConfig ?? activeFirebaseConfig ?? currentSettings.firebaseConfig
  };
}

type PersistableEntity = { id: string };

function hasEntityChanged<T extends PersistableEntity>(previousItems: T[], nextItem: T) {
  const previousItem = previousItems.find((item) => item.id === nextItem.id);
  return !previousItem || JSON.stringify(previousItem) !== JSON.stringify(nextItem);
}

function persistChangedEntities<T extends PersistableEntity>(
  previousItems: T[],
  nextItems: T[],
  saveItem: (item: T) => Promise<void>
) {
  return nextItems
    .filter((item) => hasEntityChanged(previousItems, item))
    .map(saveItem);
}

function persistChangedFirestoreState(previous: CrmState, next: CrmState, setToast: (message: string) => void) {
  const jobs = [
    ...persistChangedEntities(previous.leads, next.leads, saveLeadToFirestore),
    ...persistChangedEntities(previous.leadGroups, next.leadGroups, saveGroupToFirestore),
    ...persistChangedEntities(previous.templates, next.templates, saveTemplateToFirestore),
    ...persistChangedEntities(previous.campaigns, next.campaigns, saveCampaignToFirestore),
    ...persistChangedEntities(previous.assets, next.assets, saveAssetToFirestore),
    ...persistChangedEntities(previous.tasks, next.tasks, saveTaskToFirestore),
    ...persistChangedEntities(previous.demos, next.demos, saveDemoToFirestore),
    ...persistChangedEntities(previous.doNotContact, next.doNotContact, saveDNCToFirestore),
    ...persistChangedEntities(previous.messages, next.messages, saveMessageToFirestore)
  ];

  if (jobs.length === 0) return;

  Promise.allSettled(jobs).then((results) => {
    const failed = results.find((result) => result.status === "rejected");
    if (!failed || failed.status !== "rejected") return;
    setToast(`Cambios guardados en copia local, pero Firestore fallo: ${failed.reason instanceof Error ? failed.reason.message : "revisa Firebase"}.`);
  });
}

export function useCrmStore() {
  const [state, setState] = useState<CrmState>(() => loadState());
  const [toast, setToast] = useState("Modo WhatsApp Web activo. La app prepara mensajes y tú confirmas el envío.");

  async function syncRemoteData() {
      try {
        const firebaseApp = await ensureFirebaseConfigured(state.settings.firebaseConfig);
        if (!firebaseApp) {
          setToast("Firebase no esta configurado. Por favor configura tu Firebase.");
          return;
        }
        const [
          remoteLeads, 
          remoteGroups, 
          remoteTemplates, 
          remoteCampaigns, 
          remoteAssets, 
          remoteTasks, 
          remoteDemos, 
          remoteDNC, 
          remoteSettings,
          remoteMessages
        ] = await Promise.all([
          loadLeadsFromFirestore(),
          loadGroupsFromFirestore(),
          loadTemplatesFromFirestore(),
          loadCampaignsFromFirestore(),
          loadAssetsFromFirestore(),
          loadTasksFromFirestore(),
          loadDemosFromFirestore(),
          loadDNCFromFirestore(),
          loadSettingsFromFirestore(),
          loadMessagesFromFirestore()
        ]);

        setState((current) => {
          const next = normalizeLoadedState({
            ...current,
            leads: remoteLeads,
            leadGroups: remoteGroups,
            templates: remoteTemplates,
            campaigns: remoteCampaigns,
            assets: remoteAssets,
            tasks: remoteTasks,
            demos: remoteDemos,
            doNotContact: remoteDNC,
            settings: resolveSettings(remoteSettings, current.settings),
            messages: remoteMessages
          });
          persistLocalState(next);
          return next;
        });
        
        setToast("Datos sincronizados con Firestore.");
      } catch (error) {
        setToast(`Error al sincronizar con Firestore: ${error instanceof Error ? error.message : "Desconocido"}`);
      }
  }

  const metrics = useMemo(() => calculateMetrics(state), [state]);

  function updateState(next: CrmState, notice?: string) {
    const normalized = normalizeLoadedState(next);
    setState(normalized);
    persistLocalState(normalized);
    persistChangedFirestoreState(state, normalized, setToast);
    if (notice) setToast(notice);
  }

  function setRole(role: UserRole) {
    const user = state.users.find((item) => item.role === role) ?? state.currentUser;
    updateState({ ...state, currentUser: user }, `Sesión demo cambiada a rol ${role}.`);
  }

  function identifyUser(userInput: Pick<AppUser, "nombre" | "email" | "role">) {
    const normalizedEmail = userInput.email.trim().toLowerCase();
    const uid = normalizedEmail ? `user-${normalizedEmail.replace(/[^\w.-]+/g, "-")}` : `user-${crypto.randomUUID()}`;
    const user: AppUser = {
      uid,
      nombre: userInput.nombre.trim() || normalizedEmail || "Usuario",
      email: normalizedEmail || "usuario@local.app",
      role: userInput.role,
      activo: true,
      createdAt: state.users.find((item) => item.uid === uid)?.createdAt ?? new Date().toISOString()
    };
    updateState(
      {
        ...state,
        currentUser: user,
        users: state.users.some((item) => item.uid === uid)
          ? state.users.map((item) => (item.uid === uid ? user : item))
          : [user, ...state.users]
      },
      `Sesion iniciada como ${user.nombre}.`
    );
  }

  function upsertLead(lead: Lead) {
    const normalizedLead = { ...lead, telefono: normalizePhone(lead.telefono) };
    const exists = state.leads.some((item) => item.id === lead.id);
    const savedLead = exists
      ? { ...normalizedLead, updatedAt: new Date().toISOString() }
      : { ...normalizedLead, id: normalizedLead.id || crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const nextLeads = exists
      ? state.leads.map((item) => (item.id === lead.id ? savedLead : item))
      : [savedLead, ...state.leads];
    updateState({ ...state, leads: nextLeads }, exists ? "Lead actualizado." : "Lead creado.");
    saveLeadToFirestore(savedLead).catch((error) => {
      setToast(`Lead guardado localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa reglas/configuracion"}.`);
    });
  }

  function deleteLead(leadId: string) {
    const messagesToDelete = state.messages.filter((message) => message.leadId === leadId);
    const tasksToDelete = state.tasks.filter((task) => task.leadId === leadId);
    const demosToDelete = state.demos.filter((demo) => demo.leadId === leadId);

    updateState(
      {
        ...state,
        leads: state.leads.filter((lead) => lead.id !== leadId),
        messages: state.messages.filter((message) => message.leadId !== leadId),
        queue: state.queue.filter((item) => item.leadId !== leadId),
        tasks: state.tasks.filter((task) => task.leadId !== leadId),
        demos: state.demos.filter((demo) => demo.leadId !== leadId)
      },
      "Lead eliminado."
    );

    deleteLeadFromFirestore(leadId).catch((error) => {
      setToast(`Error al eliminar lead en Firestore: ${error instanceof Error ? error.message : "Desconocido"}`);
    });

    messagesToDelete.forEach((msg) => {
      deleteMessageFromFirestore(msg.id).catch((err) => console.error("Error al eliminar mensaje de Firestore:", err));
    });

    tasksToDelete.forEach((t) => {
      deleteTaskFromFirestore(t.id).catch((err) => console.error("Error al eliminar tarea de Firestore:", err));
    });

    demosToDelete.forEach((d) => {
      deleteDemoFromFirestore(d.id).catch((err) => console.error("Error al eliminar demo de Firestore:", err));
    });
  }

  function upsertLeadGroup(group: LeadGroup) {
    const exists = state.leadGroups.some((item) => item.id === group.id);
    const groupToSave = exists
      ? group
      : { ...group, id: group.id || crypto.randomUUID(), createdAt: group.createdAt || new Date().toISOString() };
    
    updateState(
      {
        ...state,
        leadGroups: exists
          ? state.leadGroups.map((item) => (item.id === group.id ? groupToSave : item))
          : [groupToSave, ...state.leadGroups]
      },
      exists ? "Grupo actualizado." : "Grupo creado."
    );
    saveGroupToFirestore(groupToSave).catch((error) => {
      setToast(`Grupo guardado localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa Firebase"}.`);
    });
  }

  function deleteLeadGroup(groupId: string) {
    updateState(
      {
        ...state,
        leadGroups: state.leadGroups.filter((group) => group.id !== groupId),
        leads: state.leads.map((lead) => ({ ...lead, grupoIds: lead.grupoIds.filter((id) => id !== groupId) })),
        campaigns: state.campaigns.map((campaign) => ({
          ...campaign,
          segmento: {
            ...campaign.segmento,
            grupoIds: campaign.segmento.grupoIds.filter((id) => id !== groupId)
          }
        }))
      },
      "Grupo eliminado."
    );
    deleteGroupFromFirestore(groupId).catch((error) => {
      setToast(`Grupo eliminado localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa Firebase"}.`);
    });
  }

  function importLeads(leads: Lead[]) {
    updateState(
      { ...state, leads: [...leads, ...state.leads] },
      `${leads.length} leads importados.`
    );
    Promise.allSettled(leads.map(saveLeadToFirestore)).then((results) => {
      if (results.some((result) => result.status === "rejected")) {
        setToast("Leads importados en copia local, pero alguno no se guardo en Firestore. Revisa Firebase.");
      }
    });
  }

  function updateLeadStatus(leadId: string, estado: Lead["estado"]) {
    updateState({
      ...state,
      leads: state.leads.map((lead) =>
        lead.id === leadId ? { ...lead, estado, updatedAt: new Date().toISOString() } : lead
      )
    });
  }

  function updateSettings(settings: Settings) {
    updateState({ ...state, settings }, "Configuración guardada.");
    configureFirebase(settings.firebaseConfig);
    saveSettingsToFirestore(settings).catch((error) => {
      setToast(`Configuracion guardada localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa Firebase"}.`);
    });
  }

  function addDoNotContact(entry: Omit<DoNotContact, "id" | "createdAt">) {
    const newDnc = { ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    updateState(
      {
        ...state,
        doNotContact: [newDnc, ...state.doNotContact]
      },
      "Contacto añadido a lista de exclusión."
    );
    saveDNCToFirestore(newDnc).catch((error) => {
      setToast(`Exclusion guardada localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa Firebase"}.`);
    });
  }

  function upsertTemplate(template: MessageTemplate) {
    const exists = state.templates.some((item) => item.id === template.id);
    const templateToSave = exists
      ? template
      : { ...template, id: template.id || crypto.randomUUID(), createdAt: template.createdAt || new Date().toISOString() };

    updateState(
      {
        ...state,
        templates: exists
          ? state.templates.map((item) => (item.id === template.id ? templateToSave : item))
          : [templateToSave, ...state.templates]
      },
      exists ? "Plantilla actualizada." : "Plantilla creada."
    );
    saveTemplateToFirestore(templateToSave).catch((error) => {
      setToast(`Plantilla guardada localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa Firebase"}.`);
    });
  }

  function deleteTemplate(templateId: string) {
    updateState(
      {
        ...state,
        templates: state.templates.filter((template) => template.id !== templateId),
        campaigns: state.campaigns.map((campaign) => ({
          ...campaign,
          plantillaInicialId: campaign.plantillaInicialId === templateId ? "" : campaign.plantillaInicialId,
          plantillaSeguimientoId: campaign.plantillaSeguimientoId === templateId ? undefined : campaign.plantillaSeguimientoId,
          plantillaInfoId: campaign.plantillaInfoId === templateId ? undefined : campaign.plantillaInfoId,
          mensajesPostSi: (campaign.mensajesPostSi ?? []).map((step) => ({
            ...step,
            templateId: step.templateId === templateId ? undefined : step.templateId
          })),
          updatedAt: [campaign.plantillaInicialId, campaign.plantillaSeguimientoId, campaign.plantillaInfoId, ...(campaign.mensajesPostSi ?? []).map((step) => step.templateId)].includes(templateId)
            ? new Date().toISOString()
            : campaign.updatedAt
        }))
      },
      "Plantilla eliminada."
    );
    deleteTemplateFromFirestore(templateId).catch((error) => {
      setToast(`Plantilla eliminada localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa Firebase"}.`);
    });
  }

  function updateCampaign(campaign: Campaign) {
    const exists = state.campaigns.some((item) => item.id === campaign.id);
    updateState(
      {
        ...state,
        campaigns: exists
          ? state.campaigns.map((item) => (item.id === campaign.id ? campaign : item))
          : [campaign, ...state.campaigns]
      },
      exists ? "Campaña actualizada." : "Campaña creada."
    );
    saveCampaignToFirestore(campaign).catch((error) => {
      setToast(`Campana guardada localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa Firebase"}.`);
    });
  }

  function deleteCampaign(campaignId: string) {
    updateState(
      {
        ...state,
        campaigns: state.campaigns.filter((campaign) => campaign.id !== campaignId),
        queue: state.queue.filter((item) => item.campaignId !== campaignId),
        messages: state.messages.filter((message) => message.campaignId !== campaignId)
      },
      "Campaña eliminada."
    );
    deleteCampaignFromFirestore(campaignId).catch((error) => {
      setToast(`Campana eliminada localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa Firebase"}.`);
    });
  }

  function upsertAsset(asset: CommercialAsset) {
    const exists = state.assets.some((item) => item.id === asset.id);
    const assetToSave = exists
      ? asset
      : { ...asset, id: asset.id || crypto.randomUUID(), createdAt: asset.createdAt || new Date().toISOString() };

    updateState(
      {
        ...state,
        assets: exists
          ? state.assets.map((item) => (item.id === asset.id ? assetToSave : item))
          : [assetToSave, ...state.assets]
      },
      exists ? "Asset actualizado." : "Asset creado."
    );
    saveAssetToFirestore(assetToSave).catch((error) => {
      setToast(`Asset guardado localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa Firebase"}.`);
    });
  }

  function deleteAsset(assetId: string) {
    updateState(
      {
        ...state,
        assets: state.assets.filter((asset) => asset.id !== assetId),
        campaigns: state.campaigns.map((campaign) =>
          campaign.assetInfoId === assetId || (campaign.mensajesPostSi ?? []).some((step) => step.assetId === assetId)
            ? {
                ...campaign,
                assetInfoId: campaign.assetInfoId === assetId ? undefined : campaign.assetInfoId,
                mensajesPostSi: (campaign.mensajesPostSi ?? []).map((step) => ({
                  ...step,
                  assetId: step.assetId === assetId ? undefined : step.assetId
                })),
                updatedAt: new Date().toISOString()
              }
            : campaign
        )
      },
      "Asset eliminado."
    );
    deleteAssetFromFirestore(assetId).catch((error) => {
      setToast(`Asset eliminado localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa Firebase"}.`);
    });
  }

  function upsertTask(task: Task) {
    const exists = state.tasks.some((item) => item.id === task.id);
    const taskToSave = exists
      ? task
      : { ...task, id: task.id || crypto.randomUUID(), createdAt: task.createdAt || new Date().toISOString() };

    updateState(
      {
        ...state,
        tasks: exists
          ? state.tasks.map((item) => (item.id === task.id ? taskToSave : item))
          : [taskToSave, ...state.tasks]
      },
      exists ? "Tarea actualizada." : "Tarea creada."
    );
    saveTaskToFirestore(taskToSave).catch((error) => {
      setToast(`Tarea guardada localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa Firebase"}.`);
    });
  }

  function deleteTask(taskId: string) {
    updateState({ ...state, tasks: state.tasks.filter((task) => task.id !== taskId) }, "Tarea eliminada.");
    deleteTaskFromFirestore(taskId).catch((error) => {
      setToast(`Tarea eliminada localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa Firebase"}.`);
    });
  }

  function upsertDemo(demo: Demo) {
    const exists = state.demos.some((item) => item.id === demo.id);
    const demoToSave = exists
      ? demo
      : { ...demo, id: demo.id || crypto.randomUUID(), createdAt: demo.createdAt || new Date().toISOString() };

    updateState(
      {
        ...state,
        demos: exists
          ? state.demos.map((item) => (item.id === demo.id ? demoToSave : item))
          : [demoToSave, ...state.demos]
      },
      exists ? "Demo actualizada." : "Demo creada."
    );
    saveDemoToFirestore(demoToSave).catch((error) => {
      setToast(`Demo guardada localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa Firebase"}.`);
    });
  }

  function deleteDemo(demoId: string) {
    updateState({ ...state, demos: state.demos.filter((demo) => demo.id !== demoId) }, "Demo eliminada.");
    deleteDemoFromFirestore(demoId).catch((error) => {
      setToast(`Demo eliminada localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa Firebase"}.`);
    });
  }

  return {
    state,
    metrics,
    toast,
    setToast,
    syncRemoteData,
    updateState,
    setRole,
    identifyUser,
    upsertLead,
    deleteLead,
    importLeads,
    updateLeadStatus,
    updateSettings,
    addDoNotContact,
    upsertTemplate,
    deleteTemplate,
    updateCampaign,
    deleteCampaign,
    upsertAsset,
    deleteAsset,
    upsertLeadGroup,
    deleteLeadGroup,
    upsertTask,
    deleteTask,
    upsertDemo,
    deleteDemo
  };
}

function calculateMetrics(state: CrmState): Metrics {
  const today = new Date().toISOString().slice(0, 10);
  const metricMessages = state.messages.filter((message) => message.kind !== "internal_note");
  const outboundToday = metricMessages.filter(
    (message) => message.direction === "outbound" && message.createdAt.startsWith(today)
  );
  const inbound = metricMessages.filter((message) => message.direction === "inbound");
  const positive = inbound.filter((message) => /sí|si|interesa|info|vale/i.test(message.body));
  const negative = inbound.filter((message) => /no|baja|stop/i.test(message.body));
  const ambiguous = state.leads.filter((lead) => lead.estado === "respuesta_ambigua").length;
  const converted = state.leads.filter((lead) => lead.estado === "convertido").length;

  return {
    totalLeads: state.leads.length,
    leadsConConsentimiento: state.leads.filter((lead) => lead.tieneConsentimientoWhatsapp).length,
    pendientesContactar: state.leads.filter((lead) =>
      ["nuevo", "pendiente_consentimiento", "consentimiento_obtenido"].includes(lead.estado)
    ).length,
    interesados: state.leads.filter((lead) => lead.estado === "interesado").length,
    noInteresados: state.leads.filter((lead) => lead.estado === "no_interesado").length,
    convertidos: converted,
    mensajesEnviadosHoy: outboundToday.length,
    respuestasRecibidas: inbound.length,
    tasaRespuesta: metricMessages.length ? (inbound.length / metricMessages.length) * 100 : 0,
    tasaInteres: inbound.length ? (positive.length / inbound.length) * 100 : 0,
    proximasDemos: state.demos.filter((demo) => demo.status === "programada").length,
    campanasActivas: state.campaigns.filter((campaign) => campaign.estado === "activa").length,
    mensajesFallidos: metricMessages.filter((message) => message.status === "failed").length,
    respuestasSi: positive.length,
    respuestasNo: negative.length,
    respuestasAmbiguas: ambiguous,
    demosAgendadas: state.demos.length,
    tasaConversion: state.leads.length ? (converted / state.leads.length) * 100 : 0
  };
}
