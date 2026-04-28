import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  FileUp,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Upload,
  Users
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Sidebar, navItems, type PageId } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
import { Modal } from "./components/ui/Modal";
import { StatCard } from "./components/ui/StatCard";
import { enqueueCampaign, handleIncomingReply, processQueue } from "./services/campaignEngine";
import { useCrmStore } from "./services/crmStore";
import { buildImportPreview, readLeadFile, type ImportPreview } from "./services/importService";
import type { Campaign, Lead, MessageTemplate, ProviderName, Settings } from "./types/domain";
import { formatDate, formatDateTime, percent } from "./utils/formatters";

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-connessia-500 focus:ring-2 focus:ring-connessia-100";

const complianceItems = [
  "Confirmo que estos contactos han dado consentimiento.",
  "Confirmo que la plantilla está aprobada.",
  "Confirmo que existe opción de baja.",
  "Confirmo que no se enviará a contactos excluidos.",
  "Confirmo que no se usará WhatsApp para spam."
];

function emptyLead(): Lead {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    nombreNegocio: "",
    personaContacto: "",
    telefono: "+34",
    email: "",
    direccion: "",
    ciudad: "",
    zona: "",
    sector: "",
    web: "",
    notas: "",
    estado: "nuevo",
    etiquetas: [],
    comercialAsignado: "admin-demo",
    tieneConsentimientoWhatsapp: false,
    createdAt: now,
    updatedAt: now
  };
}

export default function App() {
  const store = useCrmStore();
  const { state, metrics } = store;
  const [page, setPage] = useState<PageId>("dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const visibleLeads = useMemo(() => {
    if (state.currentUser.role !== "comercial") return state.leads;
    return state.leads.filter((lead) => lead.comercialAsignado === state.currentUser.uid);
  }, [state.currentUser, state.leads]);

  const selectedLead = selectedLeadId ? state.leads.find((lead) => lead.id === selectedLeadId) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <Sidebar page={page} setPage={setPage} />
        <div className="min-w-0 flex-1">
          <Topbar user={state.currentUser} onRoleChange={store.setRole} onMenu={() => setMobileMenu(true)} />
          <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
            <Toast text={store.toast} />
            {page === "dashboard" && <Dashboard metrics={metrics} state={state} leads={visibleLeads} setPage={setPage} />}
            {page === "leads" && (
              <LeadsScreen
                leads={visibleLeads}
                users={state.users}
                onSelect={setSelectedLeadId}
                onSave={store.upsertLead}
              />
            )}
            {page === "importar" && <ImportScreen leads={state.leads} onImport={store.importLeads} />}
            {page === "campanas" && (
              <CampaignsScreen
                state={state}
                updateState={store.updateState}
                onCampaignUpdate={store.updateCampaign}
              />
            )}
            {page === "plantillas" && <TemplatesScreen templates={state.templates} onAdd={store.addTemplate} />}
            {page === "assets" && <AssetsScreen state={state} />}
            {page === "tareas" && <TasksScreen state={state} />}
            {page === "demos" && <DemosScreen state={state} />}
            {page === "metricas" && <MetricsScreen metrics={metrics} state={state} />}
            {page === "whatsapp" && <WhatsappScreen settings={state.settings} onSave={store.updateSettings} />}
            {page === "exclusion" && <ExclusionScreen state={state} onAdd={store.addDoNotContact} />}
            {page === "auditoria" && <AuditScreen state={state} />}
            {page === "simulador" && <SimulatorScreen state={state} updateState={store.updateState} />}
          </main>
        </div>
      </div>

      {mobileMenu && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 p-4 lg:hidden">
          <div className="h-full w-full max-w-sm rounded-lg bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-bold text-slate-950">Menú</p>
              <Button variant="ghost" onClick={() => setMobileMenu(false)}>
                Cerrar
              </Button>
            </div>
            <div className="grid gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  className="rounded-md px-3 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  onClick={() => {
                    setPage(item.id);
                    setMobileMenu(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          messages={state.messages.filter((message) => message.leadId === selectedLead.id)}
          tasks={state.tasks.filter((task) => task.leadId === selectedLead.id)}
          onClose={() => setSelectedLeadId(null)}
          onSave={store.upsertLead}
        />
      )}
    </div>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <div className="mb-5 flex items-center gap-2 rounded-lg border border-connessia-200 bg-connessia-50 px-4 py-3 text-sm font-medium text-connessia-900">
      <ShieldCheck size={18} />
      {text}
    </div>
  );
}

function Dashboard({
  metrics,
  state,
  leads,
  setPage
}: {
  metrics: ReturnType<typeof useCrmStore>["metrics"];
  state: ReturnType<typeof useCrmStore>["state"];
  leads: Lead[];
  setPage: (page: PageId) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-950">Dashboard comercial</h2>
          <p className="text-slate-500">Resumen de campañas, consentimiento, respuestas y próximas acciones.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Upload size={18} />} onClick={() => setPage("importar")}>
            Importar leads
          </Button>
          <Button variant="secondary" icon={<PlayCircle size={18} />} onClick={() => setPage("campanas")}>
            Activar campaña
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total leads" value={metrics.totalLeads} icon={<Users size={22} />} />
        <StatCard label="Consentimiento WhatsApp" value={metrics.leadsConConsentimiento} icon={<ShieldCheck size={22} />} />
        <StatCard label="Pendientes" value={metrics.pendientesContactar} icon={<AlertTriangle size={22} />} tone="coral" />
        <StatCard label="Interesados" value={metrics.interesados} icon={<CheckCircle2 size={22} />} tone="teal" />
        <StatCard label="Convertidos" value={metrics.convertidos} icon={<BarChart3 size={22} />} tone="blue" />
        <StatCard label="No interesados" value={metrics.noInteresados} icon={<PauseCircle size={22} />} tone="slate" />
        <StatCard label="Enviados hoy" value={metrics.mensajesEnviadosHoy} icon={<Send size={22} />} tone="blue" />
        <StatCard label="Respuestas" value={metrics.respuestasRecibidas} icon={<MessageCircle size={22} />} />
        <StatCard label="Tasa respuesta" value={percent(metrics.tasaRespuesta)} icon={<RefreshCw size={22} />} tone="blue" />
        <StatCard label="Próximas demos" value={metrics.proximasDemos} icon={<CalendarClock size={22} />} tone="coral" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <Card className="p-5">
          <h3 className="mb-4 text-lg font-bold text-slate-950">Leads recientes</h3>
          <LeadMiniTable leads={leads.slice(0, 6)} />
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-lg font-bold text-slate-950">Cumplimiento y seguridad</h3>
          <div className="space-y-3 text-sm text-slate-600">
            <p>Proveedor activo: <strong>{state.settings.whatsappProvider}</strong></p>
            <p>Límite diario: <strong>{state.settings.dailyLimit}</strong></p>
            <p>Límite horario: <strong>{state.settings.hourlyLimit}</strong></p>
            <p>Exclusiones registradas: <strong>{state.doNotContact.length}</strong></p>
            <p>Cola pendiente: <strong>{state.queue.filter((item) => item.status === "pending").length}</strong></p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function LeadMiniTable({ leads }: { leads: Lead[] }) {
  return (
    <div className="overflow-x-auto table-scroll">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2">Negocio</th>
            <th>Sector</th>
            <th>Zona</th>
            <th>Consentimiento</th>
            <th>Estado</th>
            <th>Próxima acción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {leads.map((lead) => (
            <tr key={lead.id}>
              <td className="py-3 font-semibold text-slate-950">{lead.nombreNegocio}</td>
              <td>{lead.sector}</td>
              <td>{lead.zona}</td>
              <td>{lead.tieneConsentimientoWhatsapp ? "Sí" : "No"}</td>
              <td><Badge value={lead.estado} /></td>
              <td>{lead.proximaAccion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadsScreen({
  leads,
  users,
  onSelect,
  onSave
}: {
  leads: Lead[];
  users: ReturnType<typeof useCrmStore>["state"]["users"];
  onSelect: (id: string) => void;
  onSave: (lead: Lead) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [sector, setSector] = useState("");
  const [city, setCity] = useState("");
  const [editing, setEditing] = useState<Lead | null>(null);

  const filtered = leads.filter((lead) => {
    const text = `${lead.nombreNegocio} ${lead.personaContacto} ${lead.telefono} ${lead.email} ${lead.zona}`.toLowerCase();
    return (
      text.includes(query.toLowerCase()) &&
      (!status || lead.estado === status) &&
      (!sector || lead.sector === sector) &&
      (!city || lead.ciudad === city)
    );
  });

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Gestión de leads"
        subtitle="CRM comercial con consentimiento, estados, notas e historial."
        action={<Button icon={<Plus size={18} />} onClick={() => setEditing(emptyLead())}>Nuevo lead</Button>}
      />
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input className={`${inputClass} pl-10`} placeholder="Buscar por negocio, zona, teléfono..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos los estados</option>
            {Array.from(new Set(leads.map((lead) => lead.estado))).map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className={inputClass} value={sector} onChange={(event) => setSector(event.target.value)}>
            <option value="">Todos los sectores</option>
            {Array.from(new Set(leads.map((lead) => lead.sector).filter(Boolean))).map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className={inputClass} value={city} onChange={(event) => setCity(event.target.value)}>
            <option value="">Todas las ciudades</option>
            {Array.from(new Set(leads.map((lead) => lead.ciudad).filter(Boolean))).map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Negocio</th>
                <th>Sector</th>
                <th>Zona</th>
                <th>Ciudad</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>Estado</th>
                <th>Consentimiento</th>
                <th>Comercial</th>
                <th>Último contacto</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button className="font-bold text-connessia-800" onClick={() => onSelect(lead.id)}>{lead.nombreNegocio}</button>
                    <p className="text-xs text-slate-500">{lead.personaContacto}</p>
                  </td>
                  <td>{lead.sector}</td>
                  <td>{lead.zona}</td>
                  <td>{lead.ciudad}</td>
                  <td>{lead.telefono}</td>
                  <td>{lead.email}</td>
                  <td><Badge value={lead.estado} /></td>
                  <td>{lead.tieneConsentimientoWhatsapp ? "Sí" : "No"}</td>
                  <td>{users.find((user) => user.uid === lead.comercialAsignado)?.nombre ?? lead.comercialAsignado}</td>
                  <td>{formatDateTime(lead.ultimoContacto)}</td>
                  <td><Button variant="secondary" onClick={() => setEditing(lead)}>Editar</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && (
        <LeadFormModal
          lead={editing}
          users={users}
          onClose={() => setEditing(null)}
          onSave={(lead) => {
            onSave(lead);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function LeadFormModal({
  lead,
  users,
  onClose,
  onSave
}: {
  lead: Lead;
  users: ReturnType<typeof useCrmStore>["state"]["users"];
  onClose: () => void;
  onSave: (lead: Lead) => void;
}) {
  const [draft, setDraft] = useState(lead);
  const update = <K extends keyof Lead>(key: K, value: Lead[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <Modal title="Ficha de lead" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre del negocio" value={draft.nombreNegocio} onChange={(value) => update("nombreNegocio", value)} />
        <Field label="Persona de contacto" value={draft.personaContacto} onChange={(value) => update("personaContacto", value)} />
        <Field label="Teléfono" value={draft.telefono} onChange={(value) => update("telefono", value)} />
        <Field label="Email" value={draft.email} onChange={(value) => update("email", value)} />
        <Field label="Ciudad" value={draft.ciudad} onChange={(value) => update("ciudad", value)} />
        <Field label="Zona" value={draft.zona} onChange={(value) => update("zona", value)} />
        <Field label="Sector" value={draft.sector} onChange={(value) => update("sector", value)} />
        <Field label="Web" value={draft.web} onChange={(value) => update("web", value)} />
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Dirección</span>
          <input className={inputClass} value={draft.direccion} onChange={(event) => update("direccion", event.target.value)} />
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Estado</span>
          <select className={inputClass} value={draft.estado} onChange={(event) => update("estado", event.target.value as Lead["estado"])}>
            {["nuevo","pendiente_consentimiento","consentimiento_obtenido","campaña_enviada","interesado","no_interesado","demo_agendada","convertido","baja","bloqueado","error_envio","respuesta_ambigua","sin_respuesta"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Comercial asignado</span>
          <select className={inputClass} value={draft.comercialAsignado} onChange={(event) => update("comercialAsignado", event.target.value)}>
            {users.map((user) => <option key={user.uid} value={user.uid}>{user.nombre}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 md:col-span-2">
          <input type="checkbox" checked={draft.tieneConsentimientoWhatsapp} onChange={(event) => update("tieneConsentimientoWhatsapp", event.target.checked)} />
          <span className="text-sm font-semibold text-slate-700">Tiene consentimiento WhatsApp trazable</span>
        </label>
        <Field label="Origen consentimiento" value={draft.origenConsentimiento ?? ""} onChange={(value) => update("origenConsentimiento", value as Lead["origenConsentimiento"])} />
        <Field label="Fecha consentimiento" value={draft.fechaConsentimiento ?? ""} onChange={(value) => update("fechaConsentimiento", value)} />
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Texto aceptado / notas internas</span>
          <textarea className={inputClass} rows={4} value={draft.notas} onChange={(event) => update("notas", event.target.value)} />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => onSave(draft)}>Guardar</Button>
      </div>
    </Modal>
  );
}

function LeadDetailModal({
  lead,
  messages,
  tasks,
  onClose,
  onSave
}: {
  lead: Lead;
  messages: ReturnType<typeof useCrmStore>["state"]["messages"];
  tasks: ReturnType<typeof useCrmStore>["state"]["tasks"];
  onClose: () => void;
  onSave: (lead: Lead) => void;
}) {
  return (
    <Modal title={lead.nombreNegocio} onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <Info label="Contacto" value={lead.personaContacto} />
        <Info label="Teléfono" value={lead.telefono} />
        <Info label="Email" value={lead.email} />
        <Info label="Dirección" value={`${lead.direccion}, ${lead.ciudad}`} />
        <Info label="Sector" value={lead.sector} />
        <Info label="Zona" value={lead.zona} />
        <Info label="Consentimiento" value={lead.tieneConsentimientoWhatsapp ? "Sí" : "No"} />
        <Info label="Origen" value={lead.origenConsentimiento ?? "Sin origen"} />
        <Info label="Fecha baja" value={formatDateTime(lead.fechaBaja)} />
        <Info label="Motivo baja" value={lead.motivoBaja ?? "Sin baja"} />
      </div>
      <div className="mt-5">
        <h3 className="mb-2 font-bold text-slate-950">Historial de mensajes</h3>
        <div className="space-y-2">
          {messages.map((message) => (
            <div key={message.id} className="rounded-md border border-slate-200 p-3 text-sm">
              <span className="font-semibold">{message.direction === "inbound" ? "Entrada" : "Salida"}</span>
              <span className="ml-2 text-slate-500">{formatDateTime(message.createdAt)}</span>
              <p className="mt-1 whitespace-pre-wrap text-slate-700">{message.body}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5">
        <h3 className="mb-2 font-bold text-slate-950">Acciones y llamadas</h3>
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className="rounded-md bg-slate-50 p-3 text-sm">
              <strong>{task.title}</strong> · {formatDate(task.dueDate)} · {task.priority}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => onSave({ ...lead, estado: "interesado", updatedAt: new Date().toISOString() })}>Marcar interesado</Button>
        <Button variant="secondary" onClick={() => onSave({ ...lead, estado: "demo_agendada", updatedAt: new Date().toISOString() })}>Demo agendada</Button>
        <Button variant="danger" onClick={() => onSave({ ...lead, estado: "baja", fechaBaja: new Date().toISOString(), updatedAt: new Date().toISOString() })}>Baja</Button>
      </div>
    </Modal>
  );
}

function ImportScreen({ leads, onImport }: { leads: Lead[]; onImport: (leads: Lead[]) => void }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File) {
    setLoading(true);
    const rows = await readLeadFile(file);
    setPreview(buildImportPreview(rows, leads));
    setLoading(false);
  }

  return (
    <div className="space-y-5">
      <ScreenHeader title="Importar contactos" subtitle="CSV o Excel con previsualización, consentimiento, teléfonos y duplicados." />
      <Card className="p-6">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center hover:bg-slate-100">
          <FileUp className="mb-3 text-connessia-700" size={34} />
          <span className="font-bold text-slate-950">Selecciona un CSV o Excel</span>
          <span className="mt-1 text-sm text-slate-500">Columnas: nombre_negocio, persona_contacto, telefono, email, ciudad, zona, sector, consentimiento_whatsapp...</span>
          <input className="hidden" type="file" accept=".csv,.xlsx,.xls" onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])} />
        </label>
      </Card>
      {loading && <p className="text-sm font-semibold text-slate-500">Leyendo archivo...</p>}
      {preview && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            <StatCard label="Filas" value={preview.total} icon={<FileUp size={20} />} />
            <StatCard label="Válidos WhatsApp" value={preview.validForWhatsapp} icon={<ShieldCheck size={20} />} />
            <StatCard label="Sin consentimiento" value={preview.blockedByConsent} icon={<AlertTriangle size={20} />} tone="coral" />
            <StatCard label="Teléfono inválido" value={preview.invalidPhones} icon={<AlertTriangle size={20} />} tone="coral" />
            <StatCard label="Duplicados" value={preview.duplicates} icon={<Users size={20} />} tone="slate" />
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto table-scroll">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr><th className="px-4 py-3">Fila</th><th>Negocio</th><th>Teléfono</th><th>Consentimiento</th><th>Estado</th><th>Observaciones</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="px-4 py-3">{row.rowNumber}</td>
                      <td className="font-semibold">{row.lead.nombreNegocio}</td>
                      <td>{row.lead.telefono}</td>
                      <td>{row.lead.tieneConsentimientoWhatsapp ? "Sí" : "No"}</td>
                      <td>{row.canReceiveWhatsapp ? "Listo" : "Bloqueado/revisar"}</td>
                      <td className="text-slate-600">{[...row.errors, ...row.warnings].join(" ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Button
            icon={<Upload size={18} />}
            onClick={() => onImport(preview.rows.filter((row) => row.errors.length === 0 && !row.duplicateOf).map((row) => row.lead))}
          >
            Importar filas válidas y no duplicadas
          </Button>
        </div>
      )}
    </div>
  );
}

function CampaignsScreen({
  state,
  updateState,
  onCampaignUpdate
}: {
  state: ReturnType<typeof useCrmStore>["state"];
  updateState: ReturnType<typeof useCrmStore>["updateState"];
  onCampaignUpdate: (campaign: Campaign) => void;
}) {
  const [checks, setChecks] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(state.campaigns[0]?.id ?? "");
  const campaign = state.campaigns.find((item) => item.id === selectedId) ?? state.campaigns[0];
  const allChecked = complianceItems.every((item) => checks.includes(item));

  async function activate() {
    const result = enqueueCampaign(state, campaign.id);
    updateState(result.state as typeof state, result.notice);
  }

  async function process() {
    const result = await processQueue(state, 20);
    updateState(result.state as typeof state, result.notice);
  }

  return (
    <div className="space-y-5">
      <ScreenHeader title="Campañas" subtitle="Constructor sencillo con checklist legal, segmentación y cola de envíos." />
      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Card className="p-5">
          <select className={inputClass} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {state.campaigns.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
          </select>
          {campaign && (
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-950">{campaign.nombre}</h3>
                  <p className="text-sm text-slate-500">{campaign.descripcion}</p>
                </div>
                <Badge value={campaign.estado} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Info label="Zonas" value={campaign.segmento.zonas.join(", ")} />
                <Info label="Sectores" value={campaign.segmento.sectores.join(", ")} />
                <Info label="Seguimientos" value={`${campaign.maxSeguimientos} en ${campaign.diasParaSeguimiento} días`} />
                <Info label="Plantilla inicial" value={state.templates.find((tpl) => tpl.id === campaign.plantillaInicialId)?.nombre ?? ""} />
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h4 className="font-bold text-amber-950">Checklist antes de activar</h4>
                <div className="mt-3 space-y-2">
                  {complianceItems.map((item) => (
                    <label key={item} className="flex items-center gap-3 text-sm font-medium text-amber-950">
                      <input
                        type="checkbox"
                        checked={checks.includes(item)}
                        onChange={(event) => setChecks((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))}
                      />
                      {item}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button icon={<PlayCircle size={18} />} disabled={!allChecked} onClick={activate}>Validar y encolar campaña</Button>
                <Button variant="secondary" icon={<Send size={18} />} onClick={process}>Procesar cola mock</Button>
                <Button variant="danger" icon={<PauseCircle size={18} />} onClick={() => onCampaignUpdate({ ...campaign, estado: "pausada", updatedAt: new Date().toISOString() })}>Pausar</Button>
              </div>
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-lg font-bold text-slate-950">Cola de envíos</h3>
          <div className="space-y-3">
            {state.queue.slice(0, 8).map((item) => (
              <div key={item.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <strong>{item.phone}</strong>
                  <Badge value={item.status} />
                </div>
                <p className="mt-1 line-clamp-2 text-slate-600">{item.body}</p>
              </div>
            ))}
            {state.queue.length === 0 && <p className="text-sm text-slate-500">No hay mensajes en cola.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function TemplatesScreen({ templates, onAdd }: { templates: MessageTemplate[]; onAdd: (template: MessageTemplate) => void }) {
  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Plantillas"
        subtitle="Mensajes aprobados por proveedor oficial. Los iniciales no se envían si no están aprobados."
        action={<Button icon={<Plus size={18} />} onClick={() => onAdd({ id: crypto.randomUUID(), nombre: "Nueva plantilla", tipo: "plantilla_inicial", proveedor: "mock", idioma: "es", categoria: "marketing", body: "Hola {{persona_contacto}}, ...", variables: ["persona_contacto"], estado: "borrador", createdAt: new Date().toISOString() })}>Nueva</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {templates.map((template) => (
          <Card key={template.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-950">{template.nombre}</h3>
                <p className="text-sm text-slate-500">{template.tipo} · {template.proveedor} · {template.idioma}</p>
              </div>
              <Badge value={template.estado} />
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{template.body}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {template.variables.map((variable) => <span key={variable} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{`{{${variable}}}`}</span>)}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AssetsScreen({ state }: { state: ReturnType<typeof useCrmStore>["state"] }) {
  return (
    <div className="space-y-5">
      <ScreenHeader title="Assets comerciales" subtitle="Imágenes, PDF y vídeos para campañas. En producción se suben a Firebase Storage." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.assets.map((asset) => (
          <Card key={asset.id} className="overflow-hidden">
            {asset.type === "imagen" && <img className="h-44 w-full object-cover" src={asset.url} alt={asset.name} />}
            <div className="p-4">
              <h3 className="font-bold text-slate-950">{asset.name}</h3>
              <p className="text-sm text-slate-500">{asset.type} · {asset.storagePath}</p>
              <a className="mt-3 inline-block text-sm font-semibold text-connessia-700" href={asset.url} target="_blank" rel="noreferrer">Abrir asset</a>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TasksScreen({ state }: { state: ReturnType<typeof useCrmStore>["state"] }) {
  return <ListScreen title="Tareas comerciales" subtitle="Seguimiento operativo de leads interesados." items={state.tasks.map((task) => ({ id: task.id, title: task.title, meta: `${state.leads.find((lead) => lead.id === task.leadId)?.nombreNegocio ?? "Lead"} · ${formatDate(task.dueDate)} · ${task.priority}`, status: task.status }))} />;
}

function DemosScreen({ state }: { state: ReturnType<typeof useCrmStore>["state"] }) {
  return <ListScreen title="Agenda de demos" subtitle="Reuniones comerciales programadas y resultado." items={state.demos.map((demo) => ({ id: demo.id, title: state.leads.find((lead) => lead.id === demo.leadId)?.nombreNegocio ?? "Demo", meta: `${formatDate(demo.date)} · ${demo.time} · ${demo.meetingUrl ?? "Sin enlace"}`, status: demo.status }))} />;
}

function MetricsScreen({ metrics, state }: { metrics: ReturnType<typeof useCrmStore>["metrics"]; state: ReturnType<typeof useCrmStore>["state"] }) {
  const bySector = Array.from(new Set(state.leads.map((lead) => lead.sector))).map((sector) => ({
    sector,
    total: state.leads.filter((lead) => lead.sector === sector).length,
    interesados: state.leads.filter((lead) => lead.sector === sector && lead.estado === "interesado").length
  }));

  return (
    <div className="space-y-5">
      <ScreenHeader title="Métricas" subtitle="Rendimiento por campaña, sector, zona y comercial." />
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        <StatCard label="Campañas activas" value={metrics.campanasActivas} icon={<PlayCircle size={20} />} />
        <StatCard label="Fallidos" value={metrics.mensajesFallidos} icon={<AlertTriangle size={20} />} tone="coral" />
        <StatCard label="Respuestas SI" value={metrics.respuestasSi} icon={<CheckCircle2 size={20} />} />
        <StatCard label="Respuestas NO" value={metrics.respuestasNo} icon={<PauseCircle size={20} />} tone="slate" />
        <StatCard label="Ambiguas" value={metrics.respuestasAmbiguas} icon={<AlertTriangle size={20} />} tone="coral" />
        <StatCard label="Demos" value={metrics.demosAgendadas} icon={<CalendarClock size={20} />} tone="blue" />
        <StatCard label="Tasa interés" value={percent(metrics.tasaInteres)} icon={<BarChart3 size={20} />} />
        <StatCard label="Tasa conversión" value={percent(metrics.tasaConversion)} icon={<BarChart3 size={20} />} tone="blue" />
      </div>
      <Card className="p-5">
        <h3 className="mb-4 font-bold text-slate-950">Rendimiento por sector</h3>
        <div className="space-y-3">
          {bySector.map((item) => (
            <div key={item.sector}>
              <div className="mb-1 flex justify-between text-sm"><span>{item.sector}</span><strong>{item.interesados}/{item.total}</strong></div>
              <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-connessia-600" style={{ width: `${item.total ? (item.interesados / item.total) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function WhatsappScreen({ settings, onSave }: { settings: Settings; onSave: (settings: Settings) => void }) {
  const [draft, setDraft] = useState(settings);
  const updateChannel = (key: keyof Settings["whatsappChannel"], value: string) =>
    setDraft((current) => ({ ...current, whatsappProvider: key === "provider" ? (value as ProviderName) : current.whatsappProvider, whatsappChannel: { ...current.whatsappChannel, [key]: value } }));

  return (
    <div className="space-y-5">
      <ScreenHeader title="Canal WhatsApp" subtitle="Configuración preparada para Meta Cloud API, Spoki, Twilio o 360dialog." />
      <Card className="p-5">
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          El número emisor debe ser un WhatsApp Business verificado y conectado a un proveedor oficial. Los tokens y API keys reales se guardan en Functions o Secret Manager, nunca en frontend.
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label><span className="mb-1 block text-sm font-semibold">Proveedor</span><select className={inputClass} value={draft.whatsappChannel.provider} onChange={(event) => updateChannel("provider", event.target.value)}><option value="mock">Mock local</option><option value="meta_cloud">Meta Cloud API</option><option value="spoki">Spoki</option><option value="twilio">Twilio</option><option value="360dialog">360dialog</option></select></label>
          <Field label="Número WhatsApp Business" value={draft.whatsappChannel.businessPhone} onChange={(value) => updateChannel("businessPhone", value)} />
          <Field label="Business account id" value={draft.whatsappChannel.businessAccountId} onChange={(value) => updateChannel("businessAccountId", value)} />
          <Field label="Phone number id" value={draft.whatsappChannel.phoneNumberId} onChange={(value) => updateChannel("phoneNumberId", value)} />
          <Field label="Webhook verify token" value={draft.whatsappChannel.webhookVerifyToken} onChange={(value) => updateChannel("webhookVerifyToken", value)} />
          <Info label="Estado de conexión" value={draft.whatsappChannel.connectionStatus} />
          <Field label="Límite diario" value={String(draft.dailyLimit)} onChange={(value) => setDraft({ ...draft, dailyLimit: Number(value) })} />
          <Field label="Límite horario" value={String(draft.hourlyLimit)} onChange={(value) => setDraft({ ...draft, hourlyLimit: Number(value) })} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => onSave(draft)}>Guardar configuración</Button>
          <Button variant="secondary" onClick={() => onSave({ ...draft, whatsappChannel: { ...draft.whatsappChannel, connectionStatus: "simulado" } })}>Probar conexión mock</Button>
          <Button variant="danger" onClick={() => onSave({ ...draft, emergencyPaused: !draft.emergencyPaused })}>{draft.emergencyPaused ? "Reactivar envíos" : "Pausar todos los envíos"}</Button>
        </div>
      </Card>
    </div>
  );
}

function ExclusionScreen({ state, onAdd }: { state: ReturnType<typeof useCrmStore>["state"]; onAdd: ReturnType<typeof useCrmStore>["addDoNotContact"] }) {
  const [phone, setPhone] = useState("+34");
  return (
    <div className="space-y-5">
      <ScreenHeader title="Lista de exclusión" subtitle="Do not contact consultado antes de cualquier envío." />
      <Card className="p-5">
        <div className="flex flex-col gap-3 md:flex-row">
          <input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} />
          <Button onClick={() => onAdd({ phone, reason: "Alta manual", source: "panel_admin" })}>Añadir exclusión</Button>
        </div>
      </Card>
      <ListScreen title="Contactos excluidos" subtitle="" items={state.doNotContact.map((item) => ({ id: item.id, title: item.phone, meta: `${item.email ?? "Sin email"} · ${item.reason} · ${formatDateTime(item.createdAt)}`, status: item.source }))} embedded />
    </div>
  );
}

function AuditScreen({ state }: { state: ReturnType<typeof useCrmStore>["state"] }) {
  const simulatedAudit = [
    ...state.messages.slice(-6).map((message) => ({ id: message.id, title: `Mensaje ${message.direction}`, meta: `${message.body.slice(0, 80)} · ${formatDateTime(message.createdAt)}`, status: message.status })),
    ...state.queue.slice(-6).map((item) => ({ id: item.id, title: `Cola ${item.messageType}`, meta: `${item.phone} · ${formatDateTime(item.scheduledAt)}`, status: item.status }))
  ];
  return <ListScreen title="Auditoría" subtitle="Trazabilidad de envíos, respuestas y acciones automatizadas." items={simulatedAudit} />;
}

function SimulatorScreen({ state, updateState }: { state: ReturnType<typeof useCrmStore>["state"]; updateState: ReturnType<typeof useCrmStore>["updateState"] }) {
  const [leadId, setLeadId] = useState(state.leads[0]?.id ?? "");
  const [reply, setReply] = useState("SI");

  function simulateReply() {
    const result = handleIncomingReply(state, leadId, reply);
    updateState(result.state as typeof state, result.notice);
  }

  async function process() {
    const result = await processQueue(state, 20);
    updateState(result.state as typeof state, result.notice);
  }

  return (
    <div className="space-y-5">
      <ScreenHeader title="Simulador local" subtitle="Prueba el flujo completo sin gastar dinero ni tocar un número real." />
      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <label><span className="mb-1 block text-sm font-semibold">Lead</span><select className={inputClass} value={leadId} onChange={(event) => setLeadId(event.target.value)}>{state.leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.nombreNegocio}</option>)}</select></label>
          <Field label="Respuesta simulada" value={reply} onChange={setReply} />
          <div className="flex items-end"><Button icon={<MessageCircle size={18} />} onClick={simulateReply}>Simular</Button></div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" icon={<Send size={18} />} onClick={process}>Procesar cola</Button>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 font-bold text-slate-950">Últimos mensajes</h3>
        <div className="space-y-2">
          {state.messages.slice(-8).reverse().map((message) => <div key={message.id} className="rounded-md bg-slate-50 p-3 text-sm"><strong>{message.direction}</strong> · {message.body}</div>)}
        </div>
      </Card>
    </div>
  );
}

function ListScreen({
  title,
  subtitle,
  items,
  embedded = false
}: {
  title: string;
  subtitle: string;
  items: { id: string; title: string; meta: string; status: string }[];
  embedded?: boolean;
}) {
  return (
    <div className={embedded ? "space-y-4" : "space-y-5"}>
      {!embedded && <ScreenHeader title={title} subtitle={subtitle} />}
      <Card className="divide-y divide-slate-100">
        {items.map((item) => (
          <div key={item.id} className="flex flex-col justify-between gap-2 p-4 md:flex-row md:items-center">
            <div>
              <p className="font-bold text-slate-950">{item.title}</p>
              <p className="text-sm text-slate-500">{item.meta}</p>
            </div>
            <Badge value={item.status} />
          </div>
        ))}
        {items.length === 0 && <p className="p-4 text-sm text-slate-500">Sin registros.</p>}
      </Card>
    </div>
  );
}

function ScreenHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
      <div>
        <h2 className="text-2xl font-bold text-slate-950">{title}</h2>
        <p className="text-slate-500">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <input className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">{value || "Sin dato"}</p>
    </div>
  );
}
