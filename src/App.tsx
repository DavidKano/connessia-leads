import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Edit3,
  ExternalLink,
  FileUp,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Tags,
  Trash2,
  Upload,
  Users
} from "lucide-react";
import { useState, type ReactNode } from "react";
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
import { buildWhatsAppWebUrl, openWhatsAppWebComposer } from "./services/whatsappProvider";
import type { Campaign, Demo, Lead, LeadGroup, MessageTemplate, ProviderName, QueueItem, Settings, Task } from "./types/domain";
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
    estado: "consentimiento_obtenido",
    etiquetas: [],
    grupoIds: [],
    comercialAsignado: "admin-demo",
    tieneConsentimientoWhatsapp: true,
    fechaConsentimiento: now,
    origenConsentimiento: "otro",
    createdAt: now,
    updatedAt: now
  };
}

function emptyLeadGroup(): LeadGroup {
  return {
    id: crypto.randomUUID(),
    nombre: "",
    descripcion: "",
    color: "#0f766e",
    createdAt: new Date().toISOString()
  };
}

function emptyTask(leadId = "", assignedTo = "admin-demo"): Task {
  return {
    id: crypto.randomUUID(),
    leadId,
    title: "",
    description: "",
    dueDate: new Date().toISOString().slice(0, 10),
    assignedTo,
    status: "pendiente",
    priority: "media",
    createdAt: new Date().toISOString()
  };
}

function emptyDemo(leadId = "", assignedTo = "admin-demo"): Demo {
  return {
    id: crypto.randomUUID(),
    leadId,
    date: new Date().toISOString().slice(0, 10),
    time: "10:00",
    assignedTo,
    status: "programada",
    notes: "",
    meetingUrl: "",
    result: "",
    createdAt: new Date().toISOString()
  };
}

export default function App() {
  const store = useCrmStore();
  const { state, metrics } = store;
  const [page, setPage] = useState<PageId>("dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const visibleLeads = state.leads;

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
                groups={state.leadGroups}
                onSelect={setSelectedLeadId}
                onSave={store.upsertLead}
                onDelete={store.deleteLead}
                onSaveGroup={store.upsertLeadGroup}
                onDeleteGroup={store.deleteLeadGroup}
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
            {page === "tareas" && <TasksScreen state={state} onSave={store.upsertTask} onDelete={store.deleteTask} />}
            {page === "demos" && <DemosScreen state={state} onSave={store.upsertDemo} onDelete={store.deleteDemo} />}
            {page === "metricas" && <MetricsScreen metrics={metrics} state={state} />}
            {page === "whatsapp" && <WhatsappScreen settings={state.settings} onSave={store.updateSettings} />}
            {page === "firebase" && <FirebaseScreen settings={state.settings} onSave={store.updateSettings} />}
            {page === "tutorial" && <TutorialScreen />}
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
            <p>Canal activo: <strong>{state.settings.whatsappProvider === "whatsapp_web" ? "WhatsApp Web" : state.settings.whatsappProvider}</strong></p>
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
  groups,
  onSelect,
  onSave,
  onDelete,
  onSaveGroup,
  onDeleteGroup
}: {
  leads: Lead[];
  users: ReturnType<typeof useCrmStore>["state"]["users"];
  groups: LeadGroup[];
  onSelect: (id: string) => void;
  onSave: (lead: Lead) => void;
  onDelete: (id: string) => void;
  onSaveGroup: (group: LeadGroup) => void;
  onDeleteGroup: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [sector, setSector] = useState("");
  const [city, setCity] = useState("");
  const [groupId, setGroupId] = useState("");
  const [editing, setEditing] = useState<Lead | null>(null);
  const [editingGroup, setEditingGroup] = useState<LeadGroup | null>(null);

  const filtered = leads.filter((lead) => {
    const groupNames = groups.filter((group) => lead.grupoIds.includes(group.id)).map((group) => group.nombre).join(" ");
    const text = `${lead.nombreNegocio} ${lead.personaContacto} ${lead.telefono} ${lead.email} ${lead.zona} ${groupNames}`.toLowerCase();
    return (
      text.includes(query.toLowerCase()) &&
      (!status || lead.estado === status) &&
      (!sector || lead.sector === sector) &&
      (!city || lead.ciudad === city) &&
      (!groupId || lead.grupoIds.includes(groupId))
    );
  });

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Gestión de leads"
        subtitle="CRM comercial con grupos, consentimiento, estados, notas e historial."
        action={<Button icon={<Plus size={18} />} onClick={() => setEditing(emptyLead())}>Nuevo lead</Button>}
      />
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-5">
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
          <select className={inputClass} value={groupId} onChange={(event) => setGroupId(event.target.value)}>
            <option value="">Todos los grupos</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.nombre}</option>)}
          </select>
        </div>
      </Card>
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-950">Grupos de leads</h3>
            <p className="text-sm text-slate-500">Usalos para seleccionar clientes concretos al crear una campana.</p>
          </div>
          <Button icon={<Tags size={18} />} onClick={() => setEditingGroup(emptyLeadGroup())}>Nuevo grupo</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <div key={group.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
              <button className="font-semibold text-slate-800" onClick={() => setGroupId(group.id)}>{group.nombre}</button>
              <span className="text-xs text-slate-500">{leads.filter((lead) => lead.grupoIds.includes(group.id)).length}</span>
              <button className="text-slate-400 hover:text-slate-700" onClick={() => setEditingGroup(group)} title="Editar grupo"><Edit3 size={15} /></button>
              <button className="text-slate-400 hover:text-coral-700" onClick={() => onDeleteGroup(group.id)} title="Eliminar grupo"><Trash2 size={15} /></button>
            </div>
          ))}
          {groups.length === 0 && <p className="text-sm text-slate-500">Aun no hay grupos.</p>}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full min-w-[1250px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Negocio</th>
                <th>Sector</th>
                <th>Zona</th>
                <th>Ciudad</th>
                <th>Grupos</th>
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
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {groups.filter((group) => lead.grupoIds.includes(group.id)).map((group) => (
                        <span key={group.id} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{group.nombre}</span>
                      ))}
                    </div>
                  </td>
                  <td>{lead.telefono}</td>
                  <td>{lead.email}</td>
                  <td><Badge value={lead.estado} /></td>
                  <td>{lead.tieneConsentimientoWhatsapp ? "Sí" : "No"}</td>
                  <td>{users.find((user) => user.uid === lead.comercialAsignado)?.nombre ?? lead.comercialAsignado}</td>
                  <td>{formatDateTime(lead.ultimoContacto)}</td>
                  <td>
                    <div className="flex gap-2">
                      <Button variant="secondary" icon={<Edit3 size={16} />} onClick={() => setEditing(lead)}>Editar</Button>
                      <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => window.confirm("Eliminar este lead y sus tareas/demos/mensajes?") && onDelete(lead.id)}>Eliminar</Button>
                    </div>
                  </td>
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
          groups={groups}
          onClose={() => setEditing(null)}
          onSave={(lead) => {
            onSave(lead);
            setEditing(null);
          }}
        />
      )}
      {editingGroup && (
        <LeadGroupFormModal
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onSave={(group) => {
            onSaveGroup(group);
            setEditingGroup(null);
          }}
        />
      )}
    </div>
  );
}

function LeadFormModal({
  lead,
  users,
  groups,
  onClose,
  onSave
}: {
  lead: Lead;
  users: ReturnType<typeof useCrmStore>["state"]["users"];
  groups: LeadGroup[];
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
          <span className="mb-1 block text-sm font-semibold text-slate-700">Grupos</span>
          <div className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
            {groups.map((group) => (
              <label key={group.id} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.grupoIds.includes(group.id)}
                  onChange={(event) =>
                    update(
                      "grupoIds",
                      event.target.checked
                        ? [...draft.grupoIds, group.id]
                        : draft.grupoIds.filter((id) => id !== group.id)
                    )
                  }
                />
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
                {group.nombre}
              </label>
            ))}
            {groups.length === 0 && <span className="text-sm text-slate-500">Crea grupos desde la pantalla de leads.</span>}
          </div>
        </label>
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

function LeadGroupFormModal({
  group,
  onClose,
  onSave
}: {
  group: LeadGroup;
  onClose: () => void;
  onSave: (group: LeadGroup) => void;
}) {
  const [draft, setDraft] = useState(group);

  return (
    <Modal title="Grupo de leads" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre del grupo" value={draft.nombre} onChange={(value) => setDraft({ ...draft, nombre: value })} />
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Color</span>
          <input className={`${inputClass} h-10 p-1`} type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} />
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Descripcion</span>
          <textarea className={inputClass} rows={3} value={draft.descripcion ?? ""} onChange={(event) => setDraft({ ...draft, descripcion: event.target.value })} />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => onSave({ ...draft, nombre: draft.nombre.trim() || "Grupo sin nombre" })}>Guardar grupo</Button>
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

  function toggleCampaignGroup(groupId: string, checked: boolean) {
    if (!campaign) return;
    onCampaignUpdate({
      ...campaign,
      segmento: {
        ...campaign.segmento,
        grupoIds: checked
          ? [...campaign.segmento.grupoIds, groupId]
          : campaign.segmento.grupoIds.filter((id) => id !== groupId)
      },
      updatedAt: new Date().toISOString()
    });
  }

  function openQueueItem(item: QueueItem) {
    openWhatsAppWebComposer(item.phone, item.body);
    updateState(
      {
        ...state,
        queue: state.queue.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, status: "processing", errorMessage: "Chat abierto en WhatsApp Web. Confirma el envío manualmente." }
            : candidate
        )
      },
      `Chat abierto para ${item.phone}. Revisa el texto y pulsa enviar en WhatsApp Web.`
    );
  }

  function openNextQueueItem() {
    const next = state.queue.find((item) => item.status === "pending" || item.status === "processing");
    if (!next) {
      updateState(state, "No hay mensajes pendientes para abrir en WhatsApp Web.");
      return;
    }
    openQueueItem(next);
  }

  function markQueueItemSent(item: QueueItem) {
    const sentAt = new Date().toISOString();
    updateState(
      {
        ...state,
        queue: state.queue.map((candidate) =>
          candidate.id === item.id
            ? {
                ...candidate,
                status: "sent",
                sentAt,
                providerMessageId: `whatsapp_web_${item.id}`
              }
            : candidate
        ),
        messages: [
          ...state.messages,
          {
            id: `msg-${crypto.randomUUID()}`,
            leadId: item.leadId,
            campaignId: item.campaignId,
            direction: "outbound",
            channel: "whatsapp",
            body: item.body,
            mediaUrl: item.mediaUrl,
            providerMessageId: `whatsapp_web_${item.id}`,
            status: "sent",
            createdAt: sentAt
          }
        ],
        leads: state.leads.map((lead) =>
          lead.id === item.leadId
            ? { ...lead, ultimoContacto: sentAt, proximaAccion: "Esperar respuesta", updatedAt: sentAt }
            : lead
        )
      },
      "Mensaje marcado como enviado."
    );
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
                <Info label="Grupos" value={campaign.segmento.grupoIds.length ? campaign.segmento.grupoIds.map((id) => state.leadGroups.find((group) => group.id === id)?.nombre ?? id).join(", ") : "Todos"} />
                <Info label="Seguimientos" value={`${campaign.maxSeguimientos} en ${campaign.diasParaSeguimiento} días`} />
                <Info label="Plantilla inicial" value={state.templates.find((tpl) => tpl.id === campaign.plantillaInicialId)?.nombre ?? ""} />
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <h4 className="font-bold text-slate-950">Grupos incluidos</h4>
                <p className="mt-1 text-sm text-slate-500">Si seleccionas grupos, la campana usa esos grupos directamente y no bloquea por zona o sector.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {state.leadGroups.map((group) => (
                    <label key={group.id} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={campaign.segmento.grupoIds.includes(group.id)}
                        onChange={(event) => toggleCampaignGroup(group.id, event.target.checked)}
                      />
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
                      {group.nombre}
                    </label>
                  ))}
                  {state.leadGroups.length === 0 && <p className="text-sm text-slate-500">Crea grupos desde Leads para usarlos aqui.</p>}
                </div>
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
                <Button variant="secondary" icon={<ExternalLink size={18} />} onClick={openNextQueueItem}>Abrir siguiente en WhatsApp Web</Button>
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
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-connessia-300 hover:text-connessia-800"
                    href={buildWhatsAppWebUrl(item.phone, item.body)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => {
                      event.preventDefault();
                      openQueueItem(item);
                    }}
                  >
                    <ExternalLink size={14} />
                    Abrir chat
                  </a>
                  {item.status !== "sent" && (
                    <Button variant="secondary" icon={<ClipboardCheck size={16} />} onClick={() => markQueueItemSent(item)}>
                      Marcar enviado
                    </Button>
                  )}
                </div>
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
        subtitle="Mensajes base para WhatsApp Web. Los iniciales no se preparan si no están aprobados."
        action={<Button icon={<Plus size={18} />} onClick={() => onAdd({ id: crypto.randomUUID(), nombre: "Nueva plantilla", tipo: "plantilla_inicial", proveedor: "whatsapp_web", idioma: "es", categoria: "marketing", body: "Hola {{persona_contacto}}, ...", variables: ["persona_contacto"], estado: "borrador", createdAt: new Date().toISOString() })}>Nueva</Button>}
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

function LegacyTasksScreen({ state }: { state: ReturnType<typeof useCrmStore>["state"] }) {
  return <ListScreen title="Tareas comerciales" subtitle="Seguimiento operativo de leads interesados." items={state.tasks.map((task) => ({ id: task.id, title: task.title, meta: `${state.leads.find((lead) => lead.id === task.leadId)?.nombreNegocio ?? "Lead"} · ${formatDate(task.dueDate)} · ${task.priority}`, status: task.status }))} />;
}

function LegacyDemosScreen({ state }: { state: ReturnType<typeof useCrmStore>["state"] }) {
  return <ListScreen title="Agenda de demos" subtitle="Reuniones comerciales programadas y resultado." items={state.demos.map((demo) => ({ id: demo.id, title: state.leads.find((lead) => lead.id === demo.leadId)?.nombreNegocio ?? "Demo", meta: `${formatDate(demo.date)} · ${demo.time} · ${demo.meetingUrl ?? "Sin enlace"}`, status: demo.status }))} />;
}

function TasksScreen({
  state,
  onSave,
  onDelete
}: {
  state: ReturnType<typeof useCrmStore>["state"];
  onSave: (task: Task) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<Task | null>(null);

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Tareas comerciales"
        subtitle="Seguimiento operativo de llamadas, revisiones y proximas acciones."
        action={<Button icon={<Plus size={18} />} onClick={() => setEditing(emptyTask(state.leads[0]?.id, state.currentUser.uid))}>Nueva tarea</Button>}
      />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3">Tarea</th><th>Lead</th><th>Fecha</th><th>Prioridad</th><th>Estado</th><th>Asignado</th><th>Acciones</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.tasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><strong>{task.title}</strong><p className="text-xs text-slate-500">{task.description}</p></td>
                  <td>{state.leads.find((lead) => lead.id === task.leadId)?.nombreNegocio ?? "Lead eliminado"}</td>
                  <td>{formatDate(task.dueDate)}</td>
                  <td>{task.priority}</td>
                  <td><Badge value={task.status} /></td>
                  <td>{state.users.find((user) => user.uid === task.assignedTo)?.nombre ?? task.assignedTo}</td>
                  <td>
                    <div className="flex gap-2">
                      <Button variant="secondary" icon={<Edit3 size={16} />} onClick={() => setEditing(task)}>Editar</Button>
                      <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => window.confirm("Eliminar esta tarea?") && onDelete(task.id)}>Eliminar</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {state.tasks.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={7}>No hay tareas.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && (
        <TaskFormModal
          task={editing}
          leads={state.leads}
          users={state.users}
          onClose={() => setEditing(null)}
          onSave={(task) => {
            onSave(task);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function DemosScreen({
  state,
  onSave,
  onDelete
}: {
  state: ReturnType<typeof useCrmStore>["state"];
  onSave: (demo: Demo) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<Demo | null>(null);

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Agenda de demos"
        subtitle="Reuniones comerciales programadas, resultado y enlace."
        action={<Button icon={<Plus size={18} />} onClick={() => setEditing(emptyDemo(state.leads[0]?.id, state.currentUser.uid))}>Nueva demo</Button>}
      />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3">Lead</th><th>Fecha</th><th>Hora</th><th>Asignado</th><th>Estado</th><th>Enlace</th><th>Acciones</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.demos.map((demo) => (
                <tr key={demo.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><strong>{state.leads.find((lead) => lead.id === demo.leadId)?.nombreNegocio ?? "Lead eliminado"}</strong><p className="text-xs text-slate-500">{demo.notes}</p></td>
                  <td>{formatDate(demo.date)}</td>
                  <td>{demo.time}</td>
                  <td>{state.users.find((user) => user.uid === demo.assignedTo)?.nombre ?? demo.assignedTo}</td>
                  <td><Badge value={demo.status} /></td>
                  <td>{demo.meetingUrl ? <a className="font-semibold text-connessia-700" href={demo.meetingUrl} target="_blank" rel="noreferrer">Abrir</a> : "Sin enlace"}</td>
                  <td>
                    <div className="flex gap-2">
                      <Button variant="secondary" icon={<Edit3 size={16} />} onClick={() => setEditing(demo)}>Editar</Button>
                      <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => window.confirm("Eliminar esta demo?") && onDelete(demo.id)}>Eliminar</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {state.demos.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={7}>No hay demos.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && (
        <DemoFormModal
          demo={editing}
          leads={state.leads}
          users={state.users}
          onClose={() => setEditing(null)}
          onSave={(demo) => {
            onSave(demo);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function TaskFormModal({
  task,
  leads,
  users,
  onClose,
  onSave
}: {
  task: Task;
  leads: Lead[];
  users: ReturnType<typeof useCrmStore>["state"]["users"];
  onClose: () => void;
  onSave: (task: Task) => void;
}) {
  const [draft, setDraft] = useState(task);

  return (
    <Modal title="Tarea comercial" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Titulo" value={draft.title} onChange={(value) => setDraft({ ...draft, title: value })} />
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Lead</span>
          <select className={inputClass} value={draft.leadId} onChange={(event) => setDraft({ ...draft, leadId: event.target.value })}>
            <option value="">Sin lead</option>
            {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.nombreNegocio}</option>)}
          </select>
        </label>
        <Field label="Fecha" value={draft.dueDate} type="date" onChange={(value) => setDraft({ ...draft, dueDate: value })} />
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Asignado</span>
          <select className={inputClass} value={draft.assignedTo} onChange={(event) => setDraft({ ...draft, assignedTo: event.target.value })}>
            {users.map((user) => <option key={user.uid} value={user.uid}>{user.nombre}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Prioridad</span>
          <select className={inputClass} value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Task["priority"] })}>
            {["baja", "media", "alta"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Estado</span>
          <select className={inputClass} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Task["status"] })}>
            {["pendiente", "hecha", "cancelada"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Descripcion</span>
          <textarea className={inputClass} rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => onSave({ ...draft, title: draft.title.trim() || "Tarea sin titulo" })}>Guardar tarea</Button>
      </div>
    </Modal>
  );
}

function DemoFormModal({
  demo,
  leads,
  users,
  onClose,
  onSave
}: {
  demo: Demo;
  leads: Lead[];
  users: ReturnType<typeof useCrmStore>["state"]["users"];
  onClose: () => void;
  onSave: (demo: Demo) => void;
}) {
  const [draft, setDraft] = useState(demo);

  return (
    <Modal title="Demo" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Lead</span>
          <select className={inputClass} value={draft.leadId} onChange={(event) => setDraft({ ...draft, leadId: event.target.value })}>
            <option value="">Sin lead</option>
            {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.nombreNegocio}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Asignado</span>
          <select className={inputClass} value={draft.assignedTo} onChange={(event) => setDraft({ ...draft, assignedTo: event.target.value })}>
            {users.map((user) => <option key={user.uid} value={user.uid}>{user.nombre}</option>)}
          </select>
        </label>
        <Field label="Fecha" value={draft.date} type="date" onChange={(value) => setDraft({ ...draft, date: value })} />
        <Field label="Hora" value={draft.time} type="time" onChange={(value) => setDraft({ ...draft, time: value })} />
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Estado</span>
          <select className={inputClass} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Demo["status"] })}>
            {["programada", "realizada", "cancelada"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <Field label="Enlace reunion" value={draft.meetingUrl ?? ""} onChange={(value) => setDraft({ ...draft, meetingUrl: value })} />
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Notas</span>
          <textarea className={inputClass} rows={3} value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Resultado</span>
          <textarea className={inputClass} rows={3} value={draft.result ?? ""} onChange={(event) => setDraft({ ...draft, result: event.target.value })} />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => onSave(draft)}>Guardar demo</Button>
      </div>
    </Modal>
  );
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

function LegacyWhatsappScreen({ settings, onSave }: { settings: Settings; onSave: (settings: Settings) => void }) {
  const [draft, setDraft] = useState(settings);
  const updateChannel = (key: keyof Settings["whatsappChannel"], value: string) =>
    setDraft((current) => ({ ...current, whatsappProvider: key === "provider" ? (value as ProviderName) : current.whatsappProvider, whatsappChannel: { ...current.whatsappChannel, [key]: value } }));

  return (
    <div className="space-y-5">
      <ScreenHeader title="Canal WhatsApp" subtitle="Modo WhatsApp Web manual." />
      <Card className="p-5">
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          La app prepara enlaces de WhatsApp Web y no usa APIs de proveedores.
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label><span className="mb-1 block text-sm font-semibold">Modo</span><select className={inputClass} value={draft.whatsappChannel.provider} onChange={(event) => updateChannel("provider", event.target.value)}><option value="whatsapp_web">WhatsApp Web manual</option><option value="mock">Mock local</option></select></label>
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

function WhatsappScreen({ settings, onSave }: { settings: Settings; onSave: (settings: Settings) => void }) {
  const [draft, setDraft] = useState(settings);
  const updateChannel = (key: keyof Settings["whatsappChannel"], value: string) =>
    setDraft((current) => ({ ...current, whatsappProvider: key === "provider" ? (value as ProviderName) : current.whatsappProvider, whatsappChannel: { ...current.whatsappChannel, [key]: value } }));

  return (
    <div className="space-y-5">
      <ScreenHeader title="Canal WhatsApp" subtitle="Modo WhatsApp Web: prepara mensajes y abre el chat para enviarlos manualmente." />
      <Card className="p-5">
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          La app no envía mensajes por API. Al abrir un contacto se carga WhatsApp Web con el teléfono y el texto preparado, y tú confirmas el envío desde tu sesión.
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label><span className="mb-1 block text-sm font-semibold">Modo</span><select className={inputClass} value={draft.whatsappChannel.provider} onChange={(event) => updateChannel("provider", event.target.value)}><option value="whatsapp_web">WhatsApp Web manual</option><option value="mock">Mock local</option></select></label>
          <Field label="Número emisor visible" value={draft.whatsappChannel.businessPhone} onChange={(value) => updateChannel("businessPhone", value)} />
          <Info label="Estado" value={draft.whatsappChannel.provider === "whatsapp_web" ? "manual" : draft.whatsappChannel.connectionStatus} />
          <Info label="Confirmación" value="Se marca enviado después de pulsar enviar en WhatsApp Web" />
          <Field label="Límite diario recomendado" value={String(draft.dailyLimit)} onChange={(value) => setDraft({ ...draft, dailyLimit: Number(value) })} />
          <Field label="Límite horario recomendado" value={String(draft.hourlyLimit)} onChange={(value) => setDraft({ ...draft, hourlyLimit: Number(value) })} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => onSave({ ...draft, whatsappProvider: draft.whatsappChannel.provider, whatsappChannel: { ...draft.whatsappChannel, connectionStatus: draft.whatsappChannel.provider === "whatsapp_web" ? "conectado" : "simulado" } })}>Guardar configuración</Button>
          <Button variant="secondary" icon={<ExternalLink size={18} />} onClick={() => openWhatsAppWebComposer(draft.whatsappChannel.businessPhone || "+34600000000", "Prueba de apertura desde Connessia Leads")}>Probar apertura</Button>
          <Button variant="danger" onClick={() => onSave({ ...draft, emergencyPaused: !draft.emergencyPaused })}>{draft.emergencyPaused ? "Reactivar envíos" : "Pausar todos los envíos"}</Button>
        </div>
      </Card>
    </div>
  );
}

function FirebaseScreen({ settings, onSave }: { settings: Settings; onSave: (settings: Settings) => void }) {
  const [draft, setDraft] = useState(settings.firebaseConfig);
  const requiredFields: Array<keyof typeof draft> = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
  const complete = requiredFields.every((key) => Boolean(String(draft[key] ?? "").trim()));
  const update = (key: keyof typeof draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-5">
      <ScreenHeader title="Firebase" subtitle="Formulario para guardar los datos públicos del proyecto sin editar archivos .env." />
      <Card className="p-5">
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          Copia estos valores desde Firebase Console, en Configuración del proyecto y tu app web. Se guardan en este navegador.
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="API key" value={draft.apiKey} onChange={(value) => update("apiKey", value)} />
          <Field label="Auth domain" value={draft.authDomain} onChange={(value) => update("authDomain", value)} />
          <Field label="Project ID" value={draft.projectId} onChange={(value) => update("projectId", value)} />
          <Field label="Storage bucket" value={draft.storageBucket} onChange={(value) => update("storageBucket", value)} />
          <Field label="Messaging sender ID" value={draft.messagingSenderId} onChange={(value) => update("messagingSenderId", value)} />
          <Field label="App ID" value={draft.appId} onChange={(value) => update("appId", value)} />
          <Field label="Measurement ID" value={draft.measurementId ?? ""} onChange={(value) => update("measurementId", value)} />
          <Info label="Estado" value={complete ? "configuración completa" : "faltan campos"} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            icon={<Database size={18} />}
            onClick={() => onSave({ ...settings, firebaseConfig: { ...draft, updatedAt: new Date().toISOString() } })}
          >
            Guardar Firebase
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              setDraft({
                apiKey: "",
                authDomain: "",
                projectId: "",
                storageBucket: "",
                messagingSenderId: "",
                appId: "",
                measurementId: ""
              })
            }
          >
            Limpiar formulario
          </Button>
        </div>
      </Card>
    </div>
  );
}

function TutorialScreen() {
  const steps = [
    {
      title: "1. Configura Firebase",
      text: "Abre la pestaña Firebase, pega los datos de tu app web y guarda. Esto evita tener que editar .env para probar la app."
    },
    {
      title: "2. Importa o crea leads",
      text: "En Importar puedes subir un CSV. Asegúrate de que el teléfono tenga prefijo internacional, por ejemplo +34600111222."
    },
    {
      title: "3. Revisa consentimiento",
      text: "Cada lead debe tener consentimiento WhatsApp. Sin ese check, la campaña no lo encola."
    },
    {
      title: "4. Encola una campaña",
      text: "En Campañas marca el checklist legal y pulsa Validar y encolar campaña. La cola crea los mensajes preparados."
    },
    {
      title: "5. Envía con WhatsApp Web",
      text: "Pulsa Abrir chat o Abrir siguiente. WhatsApp Web se abre con el mensaje escrito; revisa y pulsa enviar manualmente."
    },
    {
      title: "6. Registra el envío y respuestas",
      text: "Tras enviarlo, pulsa Marcar enviado. Si el cliente responde, usa Simulador para registrar SI, NO, BAJA o una respuesta manual."
    }
  ];

  return (
    <div className="space-y-5">
      <ScreenHeader title="Mini tutorial" subtitle="Flujo básico para usar la app de principio a fin." />
      <div className="grid gap-4 lg:grid-cols-2">
        {steps.map((step) => (
          <Card key={step.title} className="p-5">
            <h3 className="font-bold text-slate-950">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p>
          </Card>
        ))}
      </div>
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

function Field({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <input className={inputClass} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
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
