import { useEffect, useMemo, useState } from "react";
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
  saveMessageToFirestore
} from "./firestoreStore";
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

const initialState: CrmState = {
  users: demoUsers,
  currentUser: demoUsers[0],
  leads: demoLeads,
  leadGroups: demoLeadGroups,
  templates: demoTemplates,
  campaigns: demoCampaigns,
  messages: demoMessages,
  queue: demoQueue,
  doNotContact: demoDoNotContact,
  tasks: demoTasks,
  demos: demoDemos,
  assets: demoAssets,
  settings: demoSettings
};

function loadState() {
  return initialState;
}

export function useCrmStore() {
  const [state, setState] = useState<CrmState>(() => loadState());
  const [toast, setToast] = useState("Modo WhatsApp Web activo. La app prepara mensajes y tú confirmas el envío.");

  useEffect(() => {
    async function loadAllData() {
      try {
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

        setState((current) => ({
          ...current,
          leads: remoteLeads.length > 0 ? remoteLeads.map(l => ({ ...l, grupoIds: l.grupoIds ?? [] })) : current.leads,
          leadGroups: remoteGroups.length > 0 ? remoteGroups : current.leadGroups,
          templates: remoteTemplates.length > 0 ? remoteTemplates : current.templates,
          campaigns: remoteCampaigns.length > 0 ? remoteCampaigns.map(c => ({ ...c, segmento: { ...c.segmento, grupoIds: c.segmento.grupoIds ?? [] } })) : current.campaigns,
          assets: remoteAssets.length > 0 ? remoteAssets : current.assets,
          tasks: remoteTasks.length > 0 ? remoteTasks : current.tasks,
          demos: remoteDemos.length > 0 ? remoteDemos : current.demos,
          doNotContact: remoteDNC.length > 0 ? remoteDNC : current.doNotContact,
          settings: remoteSettings || current.settings,
          messages: remoteMessages.length > 0 ? remoteMessages : current.messages
        }));
        
        setToast("Datos sincronizados con Firestore.");
      } catch (error) {
        setToast(`Error al sincronizar con Firestore: ${error instanceof Error ? error.message : "Desconocido"}`);
      }
    }
    loadAllData();
  }, []);

  const metrics = useMemo(() => calculateMetrics(state), [state]);

  function updateState(next: CrmState, notice?: string) {
    setState(next);
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
      setToast(`Lead eliminado localmente, pero Firestore fallo: ${error instanceof Error ? error.message : "revisa reglas/configuracion"}.`);
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
    saveGroupToFirestore(groupToSave);
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
    deleteGroupFromFirestore(groupId);
  }

  function importLeads(leads: Lead[]) {
    updateState(
      { ...state, leads: [...leads, ...state.leads] },
      `${leads.length} leads importados.`
    );
    // Note: In a real scenario we'd batch this
    leads.forEach(l => saveLeadToFirestore(l));
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
    saveSettingsToFirestore(settings);
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
    saveDNCToFirestore(newDnc);
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
    saveTemplateToFirestore(templateToSave);
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
          updatedAt: [campaign.plantillaInicialId, campaign.plantillaSeguimientoId, campaign.plantillaInfoId].includes(templateId)
            ? new Date().toISOString()
            : campaign.updatedAt
        }))
      },
      "Plantilla eliminada."
    );
    deleteTemplateFromFirestore(templateId);
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
    saveCampaignToFirestore(campaign);
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
    deleteCampaignFromFirestore(campaignId);
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
    saveAssetToFirestore(assetToSave);
  }

  function deleteAsset(assetId: string) {
    updateState(
      {
        ...state,
        assets: state.assets.filter((asset) => asset.id !== assetId),
        campaigns: state.campaigns.map((campaign) =>
          campaign.assetInfoId === assetId ? { ...campaign, assetInfoId: undefined, updatedAt: new Date().toISOString() } : campaign
        )
      },
      "Asset eliminado."
    );
    deleteAssetFromFirestore(assetId);
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
    saveTaskToFirestore(taskToSave);
  }

  function deleteTask(taskId: string) {
    updateState({ ...state, tasks: state.tasks.filter((task) => task.id !== taskId) }, "Tarea eliminada.");
    deleteTaskFromFirestore(taskId);
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
    saveDemoToFirestore(demoToSave);
  }

  function deleteDemo(demoId: string) {
    updateState({ ...state, demos: state.demos.filter((demo) => demo.id !== demoId) }, "Demo eliminada.");
    deleteDemoFromFirestore(demoId);
  }

  return {
    state,
    metrics,
    toast,
    setToast,
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
  const outboundToday = state.messages.filter(
    (message) => message.direction === "outbound" && message.createdAt.startsWith(today)
  );
  const inbound = state.messages.filter((message) => message.direction === "inbound");
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
    tasaRespuesta: state.messages.length ? (inbound.length / state.messages.length) * 100 : 0,
    tasaInteres: inbound.length ? (positive.length / inbound.length) * 100 : 0,
    proximasDemos: state.demos.filter((demo) => demo.status === "programada").length,
    campanasActivas: state.campaigns.filter((campaign) => campaign.estado === "activa").length,
    mensajesFallidos: state.messages.filter((message) => message.status === "failed").length,
    respuestasSi: positive.length,
    respuestasNo: negative.length,
    respuestasAmbiguas: ambiguous,
    demosAgendadas: state.demos.length,
    tasaConversion: state.leads.length ? (converted / state.leads.length) * 100 : 0
  };
}
