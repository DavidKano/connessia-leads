import { useEffect, useMemo, useState } from "react";
import {
  demoAssets,
  demoCampaigns,
  demoDemos,
  demoDoNotContact,
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

  return {
    state,
    metrics,
    toast,
    setToast,
    updateState,
    setRole,
    upsertLead,
    importLeads,
    updateLeadStatus,
    updateSettings,
    addDoNotContact,
    addTemplate,
    updateCampaign
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
