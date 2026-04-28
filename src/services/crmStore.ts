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
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<CrmState>;
    return {
      ...initialState,
      ...parsed,
      leads: (parsed.leads ?? initialState.leads).map((lead) => ({
        ...lead,
        grupoIds: lead.grupoIds ?? []
      })),
      campaigns: (parsed.campaigns ?? initialState.campaigns).map((campaign) => ({
        ...campaign,
        segmento: {
          ...campaign.segmento,
          grupoIds: campaign.segmento.grupoIds ?? []
        }
      })),
      settings: {
        ...initialState.settings,
        ...parsed.settings,
        whatsappChannel: {
          ...initialState.settings.whatsappChannel,
          ...parsed.settings?.whatsappChannel
        },
        firebaseConfig: {
          ...initialState.settings.firebaseConfig,
          ...parsed.settings?.firebaseConfig
        }
      }
    } as CrmState;
  } catch {
    return initialState;
  }
}

export function useCrmStore() {
  const [state, setState] = useState<CrmState>(() => loadState());
  const [toast, setToast] = useState("Modo WhatsApp Web activo. La app prepara mensajes y tú confirmas el envío.");

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  const metrics = useMemo(() => calculateMetrics(state), [state]);

  function updateState(next: CrmState, notice?: string) {
    setState(next);
    if (notice) setToast(notice);
  }

  function setRole(role: UserRole) {
    const user = state.users.find((item) => item.role === role) ?? state.currentUser;
    updateState({ ...state, currentUser: user }, `Sesión demo cambiada a rol ${role}.`);
  }

  function upsertLead(lead: Lead) {
    const exists = state.leads.some((item) => item.id === lead.id);
    const nextLeads = exists
      ? state.leads.map((item) => (item.id === lead.id ? { ...lead, updatedAt: new Date().toISOString() } : item))
      : [{ ...lead, id: lead.id || crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...state.leads];
    updateState({ ...state, leads: nextLeads }, exists ? "Lead actualizado." : "Lead creado.");
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
  }

  function upsertLeadGroup(group: LeadGroup) {
    const exists = state.leadGroups.some((item) => item.id === group.id);
    updateState(
      {
        ...state,
        leadGroups: exists
          ? state.leadGroups.map((item) => (item.id === group.id ? group : item))
          : [{ ...group, id: group.id || crypto.randomUUID(), createdAt: group.createdAt || new Date().toISOString() }, ...state.leadGroups]
      },
      exists ? "Grupo actualizado." : "Grupo creado."
    );
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
  }

  function importLeads(leads: Lead[]) {
    updateState(
      { ...state, leads: [...leads, ...state.leads] },
      `${leads.length} leads importados. Los duplicados no confirmados quedaron fuera.`
    );
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
    updateState({ ...state, settings }, "Configuración guardada en este navegador.");
  }

  function addDoNotContact(entry: Omit<DoNotContact, "id" | "createdAt">) {
    updateState(
      {
        ...state,
        doNotContact: [{ ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...state.doNotContact]
      },
      "Contacto añadido a lista de exclusión."
    );
  }

  function addTemplate(template: MessageTemplate) {
    updateState({ ...state, templates: [template, ...state.templates] }, "Plantilla guardada.");
  }

  function updateCampaign(campaign: Campaign) {
    updateState(
      {
        ...state,
        campaigns: state.campaigns.map((item) => (item.id === campaign.id ? campaign : item))
      },
      "Campaña actualizada."
    );
  }

  function upsertTask(task: Task) {
    const exists = state.tasks.some((item) => item.id === task.id);
    updateState(
      {
        ...state,
        tasks: exists
          ? state.tasks.map((item) => (item.id === task.id ? task : item))
          : [{ ...task, id: task.id || crypto.randomUUID(), createdAt: task.createdAt || new Date().toISOString() }, ...state.tasks]
      },
      exists ? "Tarea actualizada." : "Tarea creada."
    );
  }

  function deleteTask(taskId: string) {
    updateState({ ...state, tasks: state.tasks.filter((task) => task.id !== taskId) }, "Tarea eliminada.");
  }

  function upsertDemo(demo: Demo) {
    const exists = state.demos.some((item) => item.id === demo.id);
    updateState(
      {
        ...state,
        demos: exists
          ? state.demos.map((item) => (item.id === demo.id ? demo : item))
          : [{ ...demo, id: demo.id || crypto.randomUUID(), createdAt: demo.createdAt || new Date().toISOString() }, ...state.demos]
      },
      exists ? "Demo actualizada." : "Demo creada."
    );
  }

  function deleteDemo(demoId: string) {
    updateState({ ...state, demos: state.demos.filter((demo) => demo.id !== demoId) }, "Demo eliminada.");
  }

  return {
    state,
    metrics,
    toast,
    setToast,
    updateState,
    setRole,
    upsertLead,
    deleteLead,
    importLeads,
    updateLeadStatus,
    updateSettings,
    addDoNotContact,
    addTemplate,
    updateCampaign,
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
