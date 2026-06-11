import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
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
  Users,
  Check,
  Copy
} from "lucide-react";
import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { Sidebar, navItems, type PageId } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { LeadFinderScreen } from "./components/screens/LeadFinderScreen";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
import { Modal } from "./components/ui/Modal";
import { StatCard } from "./components/ui/StatCard";
import { canSendToLead, enqueueCampaign, enqueuePositiveFollowup, enqueueSpecificCampaignStep, handleIncomingReply, processQueue } from "./services/campaignEngine";
import { useCrmStore } from "./services/crmStore";
import { buildImportPreview, readLeadFile, type ImportPreview } from "./services/importService";
import { uploadCommercialAsset } from "./services/storageAssets";
import { buildWhatsAppWebUrl, openWhatsAppWebComposer } from "./services/whatsappProvider";
import type { AppUser, Campaign, CommercialAsset, ContactedLeadCloseStatus, ContactedLeadOutcome, Demo, Lead, LeadGroup, Message, MessageTemplate, ProviderName, QueueItem, Settings, Task, UserRole, LeadObservation } from "./types/domain";
import { formatDate, formatDateTime, normalizePhone, percent, renderTemplate } from "./utils/formatters";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User as FirebaseUser } from "firebase/auth";
import { auth, ensureFirebaseConfigured } from "./services/firebase";


const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-connessia-500 focus:ring-2 focus:ring-connessia-100";

const complianceItems = [
  "Confirmo que estos contactos han dado consentimiento.",
  "Confirmo que la plantilla está aprobada.",
  "Confirmo que existe opción de baja.",
  "Confirmo que no se enviará a contactos excluidos.",
  "Confirmo que no se usará WhatsApp para spam."
];

function emptyLead(assignedTo = ""): Lead {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    nombreNegocio: "",
    personaContacto: "",
    telefono: "+34",
    email: "",
    direccion: "",
    ciudad: "",
    codigoPostal: "",
    zona: "",
    sector: "",
    web: "",
    notas: "",
    estado: "consentimiento_obtenido",
    etiquetas: [],
    grupoIds: [],
    comercialAsignado: assignedTo,
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

function emptyCampaign(userId = "admin-demo"): Campaign {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    nombre: "Nueva campaña",
    descripcion: "",
    segmento: {
      zonas: [],
      sectores: [],
      grupoIds: [],
      requireConsent: true
    },
    estado: "borrador",
    plantillaInicialId: "tpl-inicial",
    plantillaSeguimientoId: "tpl-seguimiento",
    plantillaInfoId: "tpl-info",
    assetInfoId: undefined,
    mensajesPostSi: [
      { step: 3 },
      { step: 4 }
    ],
    maxSeguimientos: 1,
    diasParaSeguimiento: 3,
    dailyLimit: 80,
    createdBy: userId,
    excluirContactados: false,
    createdAt: now,
    updatedAt: now
  };
}

function emptyAsset(): CommercialAsset {
  return {
    id: crypto.randomUUID(),
    name: "",
    type: "imagen",
    url: "",
    storagePath: "",
    createdAt: new Date().toISOString()
  };
}

function emptyTemplate(): MessageTemplate {
  return {
    id: crypto.randomUUID(),
    nombre: "Nueva plantilla",
    tipo: "plantilla_inicial",
    proveedor: "whatsapp_web",
    idioma: "es",
    categoria: "marketing",
    body: "Hola {{persona_contacto}}, ...",
    variables: ["persona_contacto"],
    estado: "borrador",
    createdAt: new Date().toISOString()
  };
}

export default function App() {
  const store = useCrmStore();
  const { state, metrics } = store;
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authUnavailable, setAuthUnavailable] = useState(false);
  const [page, setPage] = useState<PageId>("dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [schedulingDemo, setSchedulingDemo] = useState<Demo | null>(null);

  // States for Leads en curso screen (preserved during screen navigation)
  const [inProgressQuery, setInProgressQuery] = useState("");
  const [inProgressSortKey, setInProgressSortKey] = useState("nombre");
  const [inProgressSortDir, setInProgressSortDir] = useState<"asc" | "desc">("asc");
  const [inProgressStates, setInProgressStates] = useState<string[]>([]);
  const [inProgressSeguimientos, setInProgressSeguimientos] = useState<string[]>([]);
  const [inProgressSectores, setInProgressSectores] = useState<string[]>([]);
  const [inProgressComerciales, setInProgressComerciales] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    async function prepareAuth() {
      const firebaseApp = await ensureFirebaseConfigured(state.settings.firebaseConfig);
      if (cancelled) return;

      if (!firebaseApp || !auth) {
        setAuthUnavailable(true);
        setFbUser(null);
        setLoading(false);
        return;
      }

      // Force session logout to synchronize new Firestore users schema
      const currentAuthVersion = window.localStorage.getItem("connessia_auth_version");
      const TARGET_AUTH_VERSION = "2026-06-05_force_logout_v1";
      if (currentAuthVersion !== TARGET_AUTH_VERSION) {
        try {
          await signOut(auth);
        } catch (e) {
          // Ignore errors during initial force logout
        }
        window.localStorage.setItem("connessia_auth_version", TARGET_AUTH_VERSION);
      }

      unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          setFbUser(user);
          setLoading(false);
          if (user) {
            store.identifyUser({
              nombre: user.displayName || user.email?.split("@")[0] || "Usuario",
              email: user.email || "",
              role: "admin"
            });
            store.syncRemoteData();
          }
        },
        () => {
          setFbUser(null);
          setLoading(false);
        }
      );
    }

    prepareAuth();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-connessia-600" />
      </div>
    );
  }

  if (authUnavailable) {
    return <AuthUnavailableScreen />;
  }

  if (!fbUser) {
    return <AuthScreen />;
  }

  const visibleLeads = state.leads.filter((lead) => !lead.contactadoCerradoAt && lead.seguimiento !== "finalizado");

  const selectedLead = selectedLeadId ? state.leads.find((lead) => lead.id === selectedLeadId) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <Sidebar page={page} setPage={setPage} currentUser={state.currentUser} />
        <div className="min-w-0 flex-1">
          <Topbar
            user={state.currentUser}
            onChangeUser={() => setIdentityOpen(true)}
            onMenu={() => setMobileMenu(true)}
            onLogout={async () => {
              if (auth) {
                await signOut(auth);
              }
              setFbUser(null);
            }}
          />
          <main className="w-full px-4 py-6 lg:px-6">
            <Toast text={store.toast} />
            {page === "dashboard" && <Dashboard metrics={metrics} state={state} leads={visibleLeads} setPage={setPage} />}
            {page === "leads" && (
              <LeadsScreen
                leads={visibleLeads}
                users={state.users}
                currentUser={state.currentUser}
                groups={state.leadGroups}
                onSelect={setSelectedLeadId}
                onSave={store.upsertLead}
                onDelete={store.deleteLead}
                onSaveGroup={store.upsertLeadGroup}
                onDeleteGroup={store.deleteLeadGroup}
              />
            )}
            {page === "contactados" && (
              <ContactedLeadsScreen
                state={state}
                onSelect={setSelectedLeadId}
                onSave={store.upsertLead}
                onScheduleDemo={(lead) => {
                  setSchedulingDemo({
                    id: crypto.randomUUID(),
                    leadId: lead.id,
                    date: new Date().toISOString().slice(0, 10),
                    time: "10:00",
                    assignedTo: lead.comercialAsignado || state.currentUser.uid,
                    status: "programada",
                    notes: "",
                    meetingUrl: "",
                    result: "",
                    createdAt: new Date().toISOString()
                  });
                }}
              />
            )}
            {page === "en_curso" && (
              <InProgressLeadsScreen
                state={state}
                onSave={store.upsertLead}
                onSaveObservation={store.upsertObservation}
                onScheduleDemo={(lead) => {
                  setSchedulingDemo({
                    id: crypto.randomUUID(),
                    leadId: lead.id,
                    date: new Date().toISOString().slice(0, 10),
                    time: "10:00",
                    assignedTo: lead.comercialAsignado || state.currentUser.uid,
                    status: "programada",
                    notes: "",
                    meetingUrl: "",
                    result: "",
                    createdAt: new Date().toISOString()
                  });
                }}
                query={inProgressQuery}
                setQuery={setInProgressQuery}
                sortKey={inProgressSortKey}
                setSortKey={setInProgressSortKey}
                sortDir={inProgressSortDir}
                setSortDir={setInProgressSortDir}
                selectedStates={inProgressStates}
                setSelectedStates={setInProgressStates}
                selectedSeguimientos={inProgressSeguimientos}
                setSelectedSeguimientos={setInProgressSeguimientos}
                selectedSectores={inProgressSectores}
                setSelectedSectores={setInProgressSectores}
                selectedComerciales={inProgressComerciales}
                setSelectedComerciales={setInProgressComerciales}
              />
            )}
            {page === "terminados" && (
              <FinishedLeadsScreen
                state={state}
                onSelect={setSelectedLeadId}
              />
            )}
            {page === "importar" && <ImportScreen leads={state.leads} onImport={store.importLeads} />}
            {page === "campanas" && (
              <CampaignsScreen
                state={state}
                updateState={store.updateState}
                onLeadSave={store.upsertLead}
                onLeadDelete={store.deleteLead}
                onCampaignUpdate={store.updateCampaign}
                onCampaignDelete={store.deleteCampaign}
              />
            )}
            {page === "plantillas" && <TemplatesScreen templates={state.templates} onSave={store.upsertTemplate} onDelete={store.deleteTemplate} />}
            {page === "assets" && <AssetsScreen state={state} onSave={store.upsertAsset} onDelete={store.deleteAsset} />}
            {page === "tareas" && <TasksScreen state={state} onSave={store.upsertTask} onDelete={store.deleteTask} />}
            {page === "demos" && <DemosScreen state={state} onSave={store.upsertDemo} onDelete={store.deleteDemo} />}
            {page === "metricas" && <MetricsScreen metrics={metrics} state={state} />}
            {page === "whatsapp" && <WhatsappScreen settings={state.settings} onSave={store.updateSettings} />}
            {page === "tutorial" && <TutorialScreen />}
            {page === "exclusion" && <ExclusionScreen state={state} onAdd={store.addDoNotContact} />}
            {page === "auditoria" && <AuditScreen state={state} />}
            {page === "simulador" && <SimulatorScreen state={state} updateState={store.updateState} />}
            {page === "finder" && <LeadFinderScreen />}
            {page === "usuarios" && state.currentUser.role === "admin" && (
              <UsersScreen state={state} onSaveUser={store.upsertUser} />
            )}
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
              {navItems
                .filter((item) => {
                  if (["assets", "metricas", "tutorial", "auditoria", "simulador"].includes(item.id)) {
                    return false;
                  }
                  if (item.id === "usuarios" && state.currentUser?.role !== "admin") {
                    return false;
                  }
                  return true;
                })
                .map((item) => (
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
          queue={state.queue.filter((item) => item.leadId === selectedLead.id)}
          campaigns={state.campaigns}
          tasks={state.tasks.filter((task) => task.leadId === selectedLead.id)}
          onClose={() => setSelectedLeadId(null)}
          onSave={store.upsertLead}
          onScheduleDemo={() => {
            setSchedulingDemo({
              id: crypto.randomUUID(),
              leadId: selectedLead.id,
              date: new Date().toISOString().slice(0, 10),
              time: "10:00",
              assignedTo: selectedLead.comercialAsignado || state.currentUser.uid,
              status: "programada",
              notes: "",
              meetingUrl: "",
              result: "",
              createdAt: new Date().toISOString()
            });
            setSelectedLeadId(null);
          }}
        />
      )}
      {identityOpen && (
        <IdentityModal
          user={state.currentUser}
          onClose={() => setIdentityOpen(false)}
          onSave={(user) => {
            store.identifyUser(user);
            setIdentityOpen(false);
          }}
        />
      )}
      {schedulingDemo && (
        <DemoFormModal
          demo={schedulingDemo}
          leads={state.leads}
          users={state.users}
          onClose={() => setSchedulingDemo(null)}
          onSave={(demo) => {
            const demoExists = state.demos.some((item) => item.id === demo.id);
            const demoToSave = demoExists
              ? demo
              : { ...demo, id: demo.id || crypto.randomUUID(), createdAt: demo.createdAt || new Date().toISOString() };
            const nextDemos = demoExists
              ? state.demos.map((item) => (item.id === demo.id ? demoToSave : item))
              : [demoToSave, ...state.demos];

            const lead = state.leads.find((l) => l.id === demo.leadId);
            let nextLeads = state.leads;
            if (lead) {
              const updatedLead = {
                ...lead,
                estado: "demo_agendada" as const,
                proximaAccion: "Demo agendada",
                updatedAt: new Date().toISOString()
              };
              nextLeads = state.leads.map((l) => (l.id === lead.id ? updatedLead : l));
            }

            store.updateState(
              {
                ...state,
                demos: nextDemos,
                leads: nextLeads
              },
              "Demo agendada y registrada."
            );

            setSchedulingDemo(null);
          }}
        />
      )}
    </div>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!auth) throw new Error("Firebase Auth no esta configurado.");
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError("Error al iniciar sesión: " + (err.code === 'auth/invalid-credential' ? 'Credenciales incorrectas' : err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-connessia-600 text-white">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-950">Connessia Leads</h1>
          <p className="text-slate-500">Inicia sesión para acceder al panel</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <label>
            <span className="mb-1 block text-sm font-semibold text-slate-700">Email</span>
            <input 
              type="email" 
              className={inputClass} 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="admin@connessia.com"
              required 
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold text-slate-700">Contraseña</span>
            <input 
              type="password" 
              className={inputClass} 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="••••••••"
              required 
            />
          </label>

          {error && (
            <div className="rounded-md bg-coral-50 p-3 text-sm text-coral-600">
              {error}
            </div>
          )}

          <Button 
            className="w-full" 
            type="submit" 
            disabled={loading}
            icon={loading ? <Loader2 size={18} className="animate-spin" /> : undefined}
          >
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function AuthUnavailableScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-coral-50 text-coral-700">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-950">Acceso bloqueado</h1>
            <p className="text-sm text-slate-500">Firebase Auth no esta configurado para este despliegue.</p>
          </div>
        </div>
        <p className="text-sm leading-6 text-slate-600">
          Por seguridad, el panel no puede abrirse en modo demo. Configura Firebase en las variables de entorno o en
          Firebase Hosting y vuelve a cargar la aplicacion.
        </p>
      </Card>
    </div>
  );
}

function Loader2({ size, className }: { size?: number; className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
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

function IdentityModal({
  user,
  onClose,
  onSave
}: {
  user: AppUser;
  onClose: () => void;
  onSave: (user: Pick<AppUser, "nombre" | "email" | "role">) => void;
}) {
  const [draft, setDraft] = useState({
    nombre: user.uid.endsWith("-demo") ? "" : user.nombre,
    email: user.uid.endsWith("-demo") ? "" : user.email,
    role: user.role
  });

  return (
    <Modal title="Identificacion de usuario" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre" value={draft.nombre} onChange={(value) => setDraft({ ...draft, nombre: value })} />
        <Field label="Email" value={draft.email} onChange={(value) => setDraft({ ...draft, email: value })} />
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Rol</span>
          <select className={inputClass} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as UserRole })}>
            <option value="admin">Admin</option>
            <option value="comercial">Comercial</option>
            <option value="visor">Visor</option>
          </select>
        </label>
        <div className="rounded-lg border border-connessia-200 bg-connessia-50 p-3 text-sm text-connessia-900">
          Esta identificacion se guarda en este navegador y se usa para asignar leads, tareas y campanas.
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => onSave({ ...draft, nombre: draft.nombre.trim() || "Usuario", email: draft.email.trim() || "usuario@local.app" })}>Entrar</Button>
      </div>
    </Modal>
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
  currentUser,
  groups,
  onSelect,
  onSave,
  onDelete,
  onSaveGroup,
  onDeleteGroup
}: {
  leads: Lead[];
  users: ReturnType<typeof useCrmStore>["state"]["users"];
  currentUser: AppUser;
  groups: LeadGroup[];
  onSelect: (id: string) => void;
  onSave: (lead: Lead) => void;
  onDelete: (id: string) => void;
  onSaveGroup: (group: LeadGroup) => void;
  onDeleteGroup: (id: string) => void;
}) {
  const [query, setQuery] = useState(() => localStorage.getItem("leads_filter_query") ?? "");
  const [status, setStatus] = useState(() => localStorage.getItem("leads_filter_status") ?? "");
  const [sector, setSector] = useState(() => localStorage.getItem("leads_filter_sector") ?? "");
  const [city, setCity] = useState(() => localStorage.getItem("leads_filter_city") ?? "");
  const [groupId, setGroupId] = useState(() => localStorage.getItem("leads_filter_groupId") ?? "");
  const [consent, setConsent] = useState(() => localStorage.getItem("leads_filter_consent") ?? "");
  const [commercial, setCommercial] = useState("");
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editing, setEditing] = useState<Lead | null>(null);
  const [editingGroup, setEditingGroup] = useState<LeadGroup | null>(null);

  useEffect(() => {
    localStorage.setItem("leads_filter_query", query);
  }, [query]);

  useEffect(() => {
    localStorage.setItem("leads_filter_status", status);
  }, [status]);

  useEffect(() => {
    localStorage.setItem("leads_filter_sector", sector);
  }, [sector]);

  useEffect(() => {
    localStorage.setItem("leads_filter_city", city);
  }, [city]);

  useEffect(() => {
    localStorage.setItem("leads_filter_groupId", groupId);
  }, [groupId]);

  useEffect(() => {
    localStorage.setItem("leads_filter_consent", consent);
  }, [consent]);

  useEffect(() => {
    const handleHardReload = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey && event.key === "F5") ||
        (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "r")
      ) {
        localStorage.removeItem("leads_filter_query");
        localStorage.removeItem("leads_filter_status");
        localStorage.removeItem("leads_filter_sector");
        localStorage.removeItem("leads_filter_city");
        localStorage.removeItem("leads_filter_groupId");
        localStorage.removeItem("leads_filter_consent");
      }
    };
    window.addEventListener("keydown", handleHardReload);
    return () => window.removeEventListener("keydown", handleHardReload);
  }, []);

  const filtered = leads.filter((lead) => {
    const groupNames = groups.filter((group) => lead.grupoIds.includes(group.id)).map((group) => group.nombre).join(" ");
    const text = `${lead.nombreNegocio} ${lead.personaContacto} ${lead.telefono} ${lead.email} ${lead.zona} ${lead.codigoPostal ?? ""} ${groupNames}`.toLowerCase();
    
    const matchConsent = consent === "" || (consent === "si" ? lead.tieneConsentimientoWhatsapp : !lead.tieneConsentimientoWhatsapp);

    return (
      text.includes(query.toLowerCase()) &&
      (!status || getLeadStateValue(lead) === status) &&
      (!sector || lead.sector === sector) &&
      (!city || lead.ciudad === city) &&
      (!groupId || (groupId === "no_asignado" ? lead.grupoIds.length === 0 : lead.grupoIds.includes(groupId))) &&
      matchConsent
    );
  });

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    
    let valA: any = "";
    let valB: any = "";
    
    switch (sortKey) {
      case "negocio": valA = a.nombreNegocio; valB = b.nombreNegocio; break;
      case "sector": valA = a.sector; valB = b.sector; break;
      case "zona": valA = a.zona; valB = b.zona; break;
      case "ciudad": valA = a.ciudad; valB = b.ciudad; break;
      case "cp": valA = a.codigoPostal || ""; valB = b.codigoPostal || ""; break;
      case "grupos": 
        valA = groups.filter(g => a.grupoIds.includes(g.id)).map(g => g.nombre).join(", ");
        valB = groups.filter(g => b.grupoIds.includes(g.id)).map(g => g.nombre).join(", ");
        break;
      case "telefono": valA = a.telefono; valB = b.telefono; break;
      case "email": valA = a.email; valB = b.email; break;
      case "estado": valA = a.estado; valB = b.estado; break;
      case "consentimiento": valA = a.tieneConsentimientoWhatsapp ? 1 : 0; valB = b.tieneConsentimientoWhatsapp ? 1 : 0; break;
      case "comercial": 
        valA = users.find(u => u.uid === a.comercialAsignado)?.nombre ?? a.comercialAsignado;
        valB = users.find(u => u.uid === b.comercialAsignado)?.nombre ?? b.comercialAsignado;
        break;
      case "contacto": valA = a.ultimoContacto || ""; valB = b.ultimoContacto || ""; break;
    }
    
    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();
    
    if (valA < valB) return sortDir === "asc" ? -1 : 1;
    if (valA > valB) return sortDir === "asc" ? 1 : -1;
    return 0;
  });



  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Gestión de leads"
        subtitle="CRM comercial con grupos, consentimiento, estados, notas e historial."
        action={
          <div className="flex gap-2">
            <Button icon={<Plus size={18} />} onClick={() => setEditing(emptyLead(""))}>Nuevo lead</Button>
          </div>
        }
      />
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
      <Card className="p-4">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
          <label className="relative col-span-2 xl:col-span-2">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input className={`${inputClass} pl-10`} placeholder="Buscar..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <select className={inputClass} value={sector} onChange={(event) => setSector(event.target.value)}>
            <option value="">Sectores</option>
            {Array.from(new Set(leads.map((lead) => lead.sector).filter(Boolean))).map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className={inputClass} value={city} onChange={(event) => setCity(event.target.value)}>
            <option value="">Ciudades</option>
            {Array.from(new Set(leads.map((lead) => lead.ciudad).filter(Boolean))).map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className={inputClass} value={groupId} onChange={(event) => setGroupId(event.target.value)}>
            <option value="">Grupos</option>
            <option value="no_asignado">No asignado</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.nombre}</option>)}
          </select>
          <select className={inputClass} value={consent} onChange={(event) => setConsent(event.target.value)}>
            <option value="">Consentimiento</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
          <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Estados</option>
            {Array.from(new Set(leads.map((lead) => getLeadStateValue(lead)))).map((item) => (
              <option key={item} value={item}>{item.replaceAll("_", " ")}</option>
            ))}
          </select>
        </div>
        {(query || sector || city || groupId || consent || status) && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("");
                setSector("");
                setCity("");
                setGroupId("");
                setConsent("");
              }}
              className="text-xs font-semibold text-red-600 hover:text-red-800 transition"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full min-w-[1250px] text-left text-[12px]">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3 w-20">Acción</th>
                <th className="px-3 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('negocio')}>Negocio {sortKey === 'negocio' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th className="px-3 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('sector')}>Sector {sortKey === 'sector' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th className="px-3 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('zona')}>Zona {sortKey === 'zona' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th className="px-3 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('ciudad')}>Ciudad {sortKey === 'ciudad' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th className="px-3 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('cp')}>CP {sortKey === 'cp' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th className="px-3 py-3 min-w-[140px] cursor-pointer hover:bg-slate-100" onClick={() => handleSort('grupos')}>Grupos {sortKey === 'grupos' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th className="px-3 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('telefono')}>Teléfono {sortKey === 'telefono' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th className="px-3 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('email')}>Email {sortKey === 'email' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th className="px-3 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('estado')}>Estado {sortKey === 'estado' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th className="px-3 py-3 leading-tight text-center cursor-pointer hover:bg-slate-100" onClick={() => handleSort('consentimiento')}>Consen.<br/>Comerc. {sortKey === 'consentimiento' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th className="px-3 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('comercial')}>Comercial {sortKey === 'comercial' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                <th className="px-3 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('contacto')}>Últ. contacto {sortKey === 'contacto' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-3 py-3">
                    <div className="flex gap-3">
                      <button className="text-slate-400 hover:text-connessia-600 transition-colors" onClick={() => setEditing(lead)} title="Editar lead">
                        <Edit3 size={18} />
                      </button>
                      <button className="text-slate-400 hover:text-coral-600 transition-colors" onClick={() => window.confirm("Eliminar este lead y sus tareas/demos/mensajes?") && onDelete(lead.id)} title="Eliminar lead">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <button className="text-left font-bold text-connessia-800" onClick={() => onSelect(lead.id)}>{lead.nombreNegocio}</button>
                    <p className="text-[11px] text-slate-500">{lead.personaContacto}</p>
                  </td>
                  <td className="px-3 py-3">{lead.sector}</td>
                  <td className="px-3 py-3">{lead.zona}</td>
                  <td className="px-3 py-3">{lead.ciudad}</td>
                  <td className="px-3 py-3">{lead.codigoPostal}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {groups.filter((group) => lead.grupoIds.includes(group.id)).map((group) => (
                        <span key={group.id} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 whitespace-nowrap">{group.nombre}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{lead.telefono}</td>
                  <td className="px-3 py-3">{lead.email}</td>
                  <td className="px-3 py-3"><Badge value={getLeadStateValue(lead)} /></td>
                  <td className="px-3 py-3 text-center font-medium">{lead.tieneConsentimientoWhatsapp ? "Sí" : "No"}</td>
                  <td className="px-3 py-3">{users.find((user) => user.uid === lead.comercialAsignado)?.nombre ?? (lead.comercialAsignado || "Sin asignar")}</td>
                  <td className="px-3 py-3 text-xs">{formatDateTime(lead.ultimoContacto)}</td>
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
        <Field label="Código Postal" value={draft.codigoPostal ?? ""} onChange={(value) => update("codigoPostal", value)} />
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
          <select
            className={inputClass}
            value={getLeadStateValue(draft) ?? "nuevo"}
            onChange={(event) => {
              const val = event.target.value;
              const now = new Date().toISOString();
              if (val === "dudoso") {
                setDraft((current) => ({
                  ...current,
                  estado: "dudoso",
                  contactadoResultado: "dudoso_comercial",
                  contactadoAt: current.contactadoAt ?? now,
                  contactadoBy: current.contactadoBy ?? (users.find(u => u.uid === current.comercialAsignado)?.uid ?? users[0]?.uid),
                  proximaAccion: "Comercial debe contactar"
                }));
              } else if (val === "interesado") {
                setDraft((current) => ({
                  ...current,
                  estado: "interesado",
                  contactadoResultado: "interesado_comercial",
                  contactadoAt: current.contactadoAt ?? now,
                  contactadoBy: current.contactadoBy ?? (users.find(u => u.uid === current.comercialAsignado)?.uid ?? users[0]?.uid),
                  proximaAccion: "Comercial debe contactar"
                }));
              } else if (val === "no_interesa") {
                setDraft((current) => ({
                  ...current,
                  estado: "no_interesado",
                  contactadoResultado: "no_interesa",
                  contactadoAt: current.contactadoAt ?? now,
                  contactadoBy: current.contactadoBy ?? (users.find(u => u.uid === current.comercialAsignado)?.uid ?? users[0]?.uid),
                  proximaAccion: "No contactar salvo nueva solicitud"
                }));
              } else {
                setDraft((current) => ({
                  ...current,
                  estado: val as any,
                  contactadoResultado: undefined,
                  contactadoAt: undefined,
                  contactadoBy: undefined
                }));
              }
            }}
          >
            <option value="nuevo">Nuevo</option>
            <option value="pendiente_consentimiento">Pendiente consentimiento</option>
            <option value="consentimiento_obtenido">Consentimiento obtenido</option>
            <option value="campaña_enviada">En campaña</option>
            <option value="sin_respuesta">Sin respuesta</option>
            <option value="interesado">Interesado</option>
            <option value="dudoso">Dudoso</option>
            <option value="no_interesa">No interesa</option>
            <option value="demo_agendada">Demo agendada</option>
            <option value="convertido">Convertido</option>
            <option value="baja">Baja</option>
            <option value="bloqueado">Bloqueado</option>
            <option value="error_envio">Error envío</option>
            <option value="respuesta_ambigua">Respuesta ambigua</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Comercial asignado</span>
          <select className={inputClass} value={draft.comercialAsignado || ""} onChange={(event) => update("comercialAsignado", event.target.value)}>
            <option value="">Sin asignar</option>
            {users.filter(u => u.activo && (u.role === "admin" || u.role === "comercial")).map((user) => <option key={user.uid} value={user.uid}>{user.nombre}</option>)}
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

function LeadNoteEditor({ lead, onSave }: { lead: Lead; onSave: (lead: Lead) => void }) {
  const [notas, setNotas] = useState(lead.notas || "");
  return (
    <div className="mt-3">
      <label className="mb-1 block text-sm font-semibold text-slate-700">Notas u observaciones</label>
      <textarea
        className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-connessia-500 focus:bg-white focus:ring-2 focus:ring-connessia-100 transition-colors"
        rows={3}
        placeholder="Añade observaciones sobre el contacto..."
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        onBlur={() => {
          if (notas !== (lead.notas || "")) {
            onSave({ ...lead, notas, updatedAt: new Date().toISOString() });
          }
        }}
      />
    </div>
  );
}

function LeadDetailModal({
  lead,
  messages,
  queue,
  campaigns,
  tasks,
  onClose,
  onSave,
  onScheduleDemo
}: {
  lead: Lead;
  messages: ReturnType<typeof useCrmStore>["state"]["messages"];
  queue: ReturnType<typeof useCrmStore>["state"]["queue"];
  campaigns: Campaign[];
  tasks: ReturnType<typeof useCrmStore>["state"]["tasks"];
  onClose: () => void;
  onSave: (lead: Lead) => void;
  onScheduleDemo: () => void;
}) {
  const timeline = [
    ...messages.map((message) => ({
      id: message.id,
      at: message.createdAt,
      title: message.direction === "inbound" ? "Cliente respondio" : "Mensaje enviado",
      campaign: campaigns.find((campaign) => campaign.id === message.campaignId)?.nombre ?? "Sin campana",
      body: message.body,
      status: message.status
    })),
    ...queue
      .filter((item) => item.status === "pending" || item.status === "processing" || item.status === "failed" || item.status === "cancelled")
      .map((item) => ({
        id: item.id,
        at: item.scheduledAt,
        title: item.status === "processing" ? "Chat abierto pendiente de confirmar" : item.status === "pending" ? "Mensaje preparado" : "Envio bloqueado",
        campaign: campaigns.find((campaign) => campaign.id === item.campaignId)?.nombre ?? "Sin campana",
        body: item.errorMessage || item.body,
        status: item.status
      })),
    ...tasks.map((task) => ({
      id: task.id,
      at: task.createdAt,
      title: "Tarea comercial",
      campaign: task.assignedTo,
      body: `${task.title} · ${formatDate(task.dueDate)} · ${task.priority}`,
      status: task.status
    }))
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Modal title={lead.nombreNegocio} onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <Info label="Contacto" value={lead.personaContacto} />
        <Info label="Teléfono" value={lead.telefono} />
        <Info label="Email" value={lead.email} />
        <Info label="Dirección" value={`${lead.direccion}, ${lead.codigoPostal ? lead.codigoPostal + ' ' : ''}${lead.ciudad}`} />
        <Info label="Sector" value={lead.sector} />
        <Info label="Zona" value={lead.zona} />
        <Info label="Consentimiento" value={lead.tieneConsentimientoWhatsapp ? "Sí" : "No"} />
        <Info label="Origen" value={lead.origenConsentimiento ?? "Sin origen"} />
        <Info label="Fecha baja" value={formatDateTime(lead.fechaBaja)} />
        <Info label="Motivo baja" value={lead.motivoBaja ?? "Sin baja"} />
      </div>
      <div className="mt-5">
        <h3 className="mb-2 font-bold text-slate-950">Historial del cliente</h3>
        <div className="space-y-2">
          {timeline.map((item) => (
            <div key={item.id} className="rounded-md border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-slate-950">{item.title}</span>
                  <span className="ml-2 text-slate-500">{formatDateTime(item.at)}</span>
                </div>
                <Badge value={item.status} />
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">{item.campaign}</p>
              <p className="mt-1 whitespace-pre-wrap text-slate-700">{item.body}</p>
            </div>
          ))}
          {timeline.length === 0 && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">Todavia no hay actividad registrada con este cliente.</p>}
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
        <LeadNoteEditor lead={lead} onSave={onSave} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => onSave({ ...lead, estado: "interesado", updatedAt: new Date().toISOString() })}>Marcar interesado</Button>
        <Button variant="secondary" onClick={onScheduleDemo}>Agendar demo</Button>
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

function conversationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pendiente_envio: "pendiente envio",
    chat_abierto: "chat abierto",
    esperando_respuesta: "esperando respuesta",
    primer_mensaje: "primer mensaje",
    segundo_mensaje: "segundo mensaje",
    sin_respuesta: "no contesta",
    respondio_si: "respondio SI",
    respondio_no: "respondio NO",
    respondido: "respondido",
    revisar: "revisar",
    bloqueado: "bloqueado",
    sin_preparar: "sin preparar"
  };
  return labels[status] ?? status;
}

function campaignFollowupHours(campaign: Campaign) {
  return campaign.diasParaSeguimiento < 4 ? campaign.diasParaSeguimiento * 24 : campaign.diasParaSeguimiento;
}

function formatFollowupDelay(campaign: Campaign) {
  const hours = campaignFollowupHours(campaign);
  return hours >= 24 ? `${hours / 24} dia(s)` : `${hours} horas`;
}

function queueComposerBody(item: QueueItem) {
  return item.body;
}

function isNoReplyQueueItem(item: QueueItem, campaign?: Campaign) {
  return item.campaignStep === 2 || Boolean(campaign?.plantillaSeguimientoId && item.templateId === campaign.plantillaSeguimientoId);
}

function campaignMatchesLead(campaign: Campaign | undefined, lead: Lead) {
  if (!campaign) return false;
  const selectedByGroup =
    campaign.segmento.grupoIds.length > 0 &&
    campaign.segmento.grupoIds.some((groupId) => lead.grupoIds.includes(groupId));
  const zoneMatch = campaign.segmento.zonas.length === 0 || campaign.segmento.zonas.includes(lead.zona);
  const sectorMatch = campaign.segmento.sectores.length === 0 || campaign.segmento.sectores.includes(lead.sector);
  const selectedByLegacySegment = campaign.segmento.grupoIds.length === 0 && zoneMatch && sectorMatch;
  return selectedByGroup || selectedByLegacySegment;
}

function campaignConfiguredSteps(campaign?: Campaign) {
  if (!campaign) return [];
  return [
    { step: 2, hasContent: Boolean(campaign.plantillaInfoId || campaign.assetInfoId) },
    ...(campaign.mensajesPostSi ?? []).map((item) => ({
      step: item.step,
      hasContent: Boolean(item.templateId || item.assetId)
    }))
  ].filter((item) => item.hasContent).map((item) => item.step);
}

function nextCampaignStepNumber(campaign: Campaign | undefined, queue: QueueItem[]) {
  const sentSteps = new Set(
    queue
      .filter((item) => item.status === "sent" && typeof item.campaignStep === "number")
      .map((item) => item.campaignStep as number)
  );
  if (queue.some((item) => item.status === "sent" && item.messageType !== "template" && !item.campaignStep)) {
    sentSteps.add(2);
  }
  return campaignConfiguredSteps(campaign).find((step) => !sentSteps.has(step));
}

const contactedOutcomeLabels: Record<ContactedLeadOutcome, string> = {
  dudoso_comercial: "Dudoso - paso a comercial",
  no_interesa: "No interesa",
  interesado_comercial: "Interesado - paso a comercial"
};

const contactedCloseLabels: Record<ContactedLeadCloseStatus, string> = {
  terminado: "Terminado",
  baja: "Baja"
};

function contactedLeadStatus(outcome: ContactedLeadOutcome): Lead["estado"] {
  if (outcome === "no_interesa") return "no_interesado";
  if (outcome === "dudoso_comercial") return "dudoso";
  return "interesado";
}

function CampaignsScreen({
  state,
  updateState,
  onLeadSave,
  onLeadDelete,
  onCampaignUpdate,
  onCampaignDelete
}: {
  state: ReturnType<typeof useCrmStore>["state"];
  updateState: ReturnType<typeof useCrmStore>["updateState"];
  onLeadSave: (lead: Lead) => void;
  onLeadDelete: (id: string) => void;
  onCampaignUpdate: (campaign: Campaign) => void;
  onCampaignDelete: (id: string) => void;
}) {
  const [checks, setChecks] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(state.campaigns[0]?.id ?? "");
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [campaignTab, setCampaignTab] = useState<"campaigns" | "chats">("campaigns");
  const [noteDraft, setNoteDraft] = useState("");
  const [pasteDraft, setPasteDraft] = useState("");
  const [pasteDirection, setPasteDirection] = useState<"inbound" | "outbound">("inbound");
  const [copiedLeadId, setCopiedLeadId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const campaign = state.campaigns.find((item) => item.id === selectedId) ?? state.campaigns[0];
  const allChecked = complianceItems.every((item) => checks.includes(item));
  const campaignQueue = campaign ? state.queue.filter((item) => item.campaignId === campaign.id) : [];
  const campaignMessages = campaign ? state.messages.filter((message) => message.campaignId === campaign.id) : [];
  const segmentLeadIds = campaign
    ? state.leads
        .filter((lead) =>
          !lead.contactadoResultado &&
          !lead.contactadoCerradoAt &&
          ["nuevo", "pendiente_consentimiento", "consentimiento_obtenido", "campaña_enviada", "sin_respuesta"].includes(lead.estado) &&
          campaignMatchesLead(campaign, lead)
        )
        .map((lead) => lead.id)
    : [];
  const conversationLeadIds = Array.from(new Set([
    ...campaignQueue.map((item) => item.leadId),
    ...campaignMessages.map((message) => message.leadId),
    ...segmentLeadIds
  ]));
  const allConversations = conversationLeadIds
    .map((leadId) => {
      const lead = state.leads.find((item) => item.id === leadId);
      if (!lead) return null;
      const isClosed =
        Boolean(lead.contactadoResultado) &&
        (!campaign || !lead.contactadoCampaignId || lead.contactadoCampaignId === campaign.id);
      const isArchived =
        isClosed &&
        Boolean(lead.campaignChatArchivedAt) &&
        (!campaign || !lead.campaignChatClosedCampaignId || lead.campaignChatClosedCampaignId === campaign.id);
      const leadQueue = campaignQueue
        .filter((item) => item.leadId === lead.id)
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
      const leadMessages = campaignMessages
        .filter((message) => message.leadId === lead.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const latestSent = [...leadQueue].reverse().find((item) => item.status === "sent");
      const pending = leadQueue.find((item) => item.status === "processing") ?? leadQueue.find((item) => item.status === "pending");
      const whatsappMessages = leadMessages.filter((message) => message.kind !== "internal_note");
      const internalNotes = leadMessages.filter((message) => message.kind === "internal_note");
      const lastInbound = [...whatsappMessages].reverse().find((message) => message.direction === "inbound");
      const lastOutbound = [...whatsappMessages].reverse().find((message) => message.direction === "outbound");
      const blockedReason = canSendToLead(lead, state.doNotContact);
      const failed = [...leadQueue].reverse().find((item) => item.status === "failed" || item.status === "cancelled");
      const latestNoReplySent = [...leadQueue].reverse().find((item) => item.status === "sent" && isNoReplyQueueItem(item, campaign));
      const noReplyPending = pending && isNoReplyQueueItem(pending, campaign) ? pending : undefined;
      const legacySecondMessage =
        Boolean(latestSent || lastOutbound) &&
        !latestNoReplySent &&
        !pending &&
        !lastInbound &&
        lead.estado === "campaña_enviada" &&
        lead.proximaAccion === "Esperar respuesta";
      const chatStep = noReplyPending
        ? "second_pending"
        : latestNoReplySent || legacySecondMessage || lead.estado === "sin_respuesta"
          ? "second_sent"
          : latestSent || lastOutbound
            ? "first_sent"
            : pending
              ? "pending"
              : "empty";
      const status = lastInbound
        ? lead.estado === "interesado"
          ? "respondio_si"
          : lead.estado === "no_interesado" || lead.estado === "baja"
            ? "respondio_no"
            : "respondido"
        : pending?.status === "processing"
          ? "chat_abierto"
          : pending?.status === "pending"
            ? "pendiente_envio"
            : latestSent || lastOutbound
              ? chatStep === "second_sent"
                ? "segundo_mensaje"
                : "primer_mensaje"
              : failed
                ? "revisar"
                : blockedReason
                  ? "bloqueado"
                  : "sin_preparar";
      return { lead, queue: leadQueue, messages: leadMessages, whatsappMessages, internalNotes, latestSent, latestNoReplySent, pending, noReplyPending, lastInbound, lastOutbound, blockedReason, failed, status, chatStep, isClosed, isArchived };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const conversations = allConversations
    .filter((item) => !item.isClosed && !item.isArchived)
    .sort((a, b) => {
      const rank: Record<string, number> = {
        chat_abierto: 0,
        pendiente_envio: 1,
        primer_mensaje: 2,
        segundo_mensaje: 3,
        respondio_si: 3,
        sin_respuesta: 4,
        respondido: 5,
        respondio_no: 6,
        revisar: 7,
        bloqueado: 8,
        sin_preparar: 9
      };
      return rank[a.status] - rank[b.status] || a.lead.nombreNegocio.localeCompare(b.lead.nombreNegocio);
    });
  const closedConversations = allConversations
    .filter((item) => item.isClosed && !item.isArchived)
    .sort((a, b) => (b.lead.campaignChatClosedAt ?? b.lead.contactadoAt ?? "").localeCompare(a.lead.campaignChatClosedAt ?? a.lead.contactadoAt ?? ""));
  const inactiveConversationLeadIds = new Set(
    allConversations.filter((item) => item.isClosed || item.isArchived).map((item) => item.lead.id)
  );
  const activeQueue = campaignQueue.filter(
    (item) => (item.status === "pending" || item.status === "processing") && !inactiveConversationLeadIds.has(item.leadId)
  );
  const sortedActiveQueue = [...activeQueue].sort((a, b) => {
    const rank = { processing: 0, pending: 1, sent: 2, failed: 3, cancelled: 4 } as const;
    return rank[a.status] - rank[b.status] || a.scheduledAt.localeCompare(b.scheduledAt);
  });
  const respondedCount = conversations.filter((item) => item.lastInbound).length;
  const waitingCount = conversations.filter((item) => item.status === "primer_mensaje" || item.status === "segundo_mensaje").length;
  const blockedCount = conversations.filter((item) => item.status === "bloqueado" || item.status === "revisar").length;
  const selectedConversation = conversations.find((item) => item.lead.id === selectedChatId) ?? conversations[0];
  const pendingItem = selectedConversation?.pending;
  const selectedTimeline = selectedConversation
    ? [
        ...selectedConversation.messages.map((message) => ({
          id: message.id,
          direction: message.direction,
          kind: message.kind ?? "message",
          body: message.body,
          at: message.createdAt,
          label: message.kind === "internal_note"
            ? `Nota interna${message.authorName ? ` · ${message.authorName}` : ""}`
            : message.kind === "whatsapp_paste"
              ? message.direction === "inbound"
                ? "WhatsApp pegado · Cliente"
                : "WhatsApp pegado · Equipo"
              : message.direction === "inbound"
                ? "Cliente"
                : "Tu",
          isPendingQueueItem: false
        })),
        ...selectedConversation.queue
          .filter((item) => item.status === "pending" || item.status === "processing")
          .map((item) => ({
            id: item.id,
            direction: "outbound" as const,
            kind: "message" as const,
            body: queueComposerBody(item),
            at: item.scheduledAt,
            label: item.status === "processing" ? "Abierto en WhatsApp" : "Preparado",
            isPendingQueueItem: true
          }))
      ].sort((a, b) => a.at.localeCompare(b.at))
    : [];
  const selectedNextCampaignStep = selectedConversation ? nextCampaignStepNumber(campaign, selectedConversation.queue) : undefined;

  async function activate() {
    const result = enqueueCampaign(state, campaign.id);
    updateState(result.state as typeof state, result.notice);
  }

  function prepareInitialMessage(leadId?: string) {
    if (!campaign) return;
    const conversation = leadId
      ? allConversations.find((item) => item.lead.id === leadId)
      : selectedConversation;
    if (!conversation) return;
    if (conversation.pending || conversation.latestSent || conversation.lastOutbound) {
      updateState(state, "Ese lead ya tiene un mensaje preparado o enviado en esta campaña.");
      return;
    }

    const template = state.templates.find((item) => item.id === campaign.plantillaInicialId);
    if (!template || template.estado !== "aprobada") {
      updateState(state, "La plantilla inicial debe estar aprobada antes de preparar el primer mensaje.");
      return;
    }

    const blockedReason = canSendToLead(conversation.lead, state.doNotContact);
    if (blockedReason) {
      updateState(state, `No se puede preparar el mensaje: ${blockedReason}`);
      return;
    }

    const now = new Date().toISOString();
    const queueItem: QueueItem = {
      id: `queue-${crypto.randomUUID()}`,
      leadId: conversation.lead.id,
      campaignId: campaign.id,
      phone: normalizePhone(conversation.lead.telefono),
      messageType: "template",
      templateId: template.id,
      body: renderTemplate(template, conversation.lead, state.settings),
      status: "pending",
      scheduledAt: now,
      retries: 0
    };

    updateState(
      {
        ...state,
        queue: [...state.queue, queueItem],
        leads: state.leads.map((lead) =>
          lead.id === conversation.lead.id
            ? {
                ...lead,
                estado: "campaña_enviada",
                proximaAccion: "Enviar primer mensaje",
                updatedAt: now
              }
            : lead
        )
      },
      `Primer mensaje preparado para ${conversation.lead.nombreNegocio}.`
    );
  }

  function enqueueNoReplyFollowups() {
    if (!campaign) return;
    const template = campaign.plantillaSeguimientoId
      ? state.templates.find((item) => item.id === campaign.plantillaSeguimientoId)
      : undefined;
    if (!template || template.estado !== "aprobada") {
      updateState(state, "Selecciona una plantilla de seguimiento aprobada en la campana.");
      return;
    }

    const now = new Date();
    const delayMs = campaignFollowupHours(campaign) * 60 * 60 * 1000;
    const targets = conversations.filter((conversation) => {
      if (conversation.lastInbound || conversation.pending || !conversation.latestSent) return false;
      const sentAt = new Date(conversation.latestSent.sentAt ?? conversation.latestSent.scheduledAt).getTime();
      const followupsAlreadyPrepared = conversation.queue.filter(
        (item) => item.templateId === template.id && ["pending", "processing", "sent"].includes(item.status)
      ).length;
      return now.getTime() - sentAt >= delayMs && followupsAlreadyPrepared < campaign.maxSeguimientos;
    });

    if (targets.length === 0) {
      updateState(state, `No hay leads sin respuesta que hayan superado ${formatFollowupDelay(campaign)}.`);
      return;
    }

    const scheduledAt = now.toISOString();
    updateState(
      {
        ...state,
        queue: [
          ...state.queue,
          ...targets.map<QueueItem>((conversation) => ({
            id: `queue-${crypto.randomUUID()}`,
            leadId: conversation.lead.id,
            campaignId: campaign.id,
            phone: conversation.latestSent?.phone ?? conversation.lead.telefono,
            messageType: "template",
            templateId: template.id,
            body: renderTemplate(template, conversation.lead, state.settings),
            status: "pending",
            scheduledAt,
            retries: 0
          }))
        ],
        leads: state.leads.map((lead) =>
          targets.some((conversation) => conversation.lead.id === lead.id)
            ? { ...lead, proximaAccion: "Enviar seguimiento sin respuesta", updatedAt: scheduledAt }
            : lead
        )
      },
      `${targets.length} seguimiento(s) preparados para leads sin respuesta.`
    );
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

  function saveCampaign(campaign: Campaign) {
    onCampaignUpdate(campaign);
    setSelectedId(campaign.id);
    setEditingCampaign(null);
  }

  function openQueueItem(item: QueueItem) {
    openWhatsAppWebComposer(item.phone, queueComposerBody(item));
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
    const next = sortedActiveQueue.find((item) => item.status === "processing") ?? sortedActiveQueue.find((item) => item.status === "pending");
    if (!next) {
      updateState(state, "No hay mensajes pendientes para abrir en WhatsApp Web.");
      return;
    }
    openQueueItem(next);
  }

  function markQueueItemSent(item: QueueItem, openNext = false) {
    if (item.status === "sent") {
      updateState(state, "Ese mensaje ya estaba marcado como enviado.");
      return;
    }
    const sentAt = new Date().toISOString();
    const alreadyLogged = state.messages.some(
      (message) => message.providerMessageId === `whatsapp_web_${item.id}` || (message.leadId === item.leadId && message.direction === "outbound" && message.body === item.body && message.status === "sent")
    );
    let nextQueue = state.queue.map((candidate) =>
      candidate.id === item.id
        ? {
            ...candidate,
            status: "sent" as const,
            sentAt,
            providerMessageId: `whatsapp_web_${item.id}`
          }
        : candidate
    );
    const nextPending = openNext
      ? nextQueue.find((candidate) => candidate.id !== item.id && candidate.campaignId === item.campaignId && candidate.status === "pending")
      : undefined;
    if (nextPending) {
      openWhatsAppWebComposer(nextPending.phone, queueComposerBody(nextPending));
      nextQueue = nextQueue.map((candidate) =>
        candidate.id === nextPending.id
          ? { ...candidate, status: "processing" as const, errorMessage: "Chat abierto en WhatsApp Web. Confirma el envío manualmente." }
          : candidate
      );
    }

    const sentNoReply = isNoReplyQueueItem(item, campaign);
    updateState(
      {
        ...state,
        queue: nextQueue,
        messages: alreadyLogged
          ? state.messages
          : [
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
            ? {
                ...lead,
                estado: sentNoReply ? "sin_respuesta" : lead.estado,
                ultimoContacto: sentAt,
                proximaAccion: sentNoReply ? "Segundo mensaje cri cri enviado" : "Primer mensaje enviado",
                updatedAt: sentAt
              }
            : lead
        )
      },
      nextPending ? `Mensaje enviado. Siguiente chat abierto para ${nextPending.phone}.` : "Mensaje marcado como enviado."
    );
  }

  function registerQueueReply(item: QueueItem, reply: string, openFollowup = true) {
    const alreadyReplied = state.messages.some((message) => message.leadId === item.leadId && message.campaignId === item.campaignId && message.direction === "inbound");
    if (alreadyReplied) {
      if (reply === "SI") {
        const result = enqueuePositiveFollowup(state, item.leadId, item.campaignId);
        let nextState = result.state as typeof state;
        const followup = nextState.queue.find((candidate) => candidate.leadId === item.leadId && candidate.campaignId === item.campaignId && candidate.status === "pending");

        if (followup && openFollowup) {
          openWhatsAppWebComposer(followup.phone, queueComposerBody(followup));
          nextState = {
            ...nextState,
            queue: nextState.queue.map((candidate) =>
              candidate.id === followup.id
                ? { ...candidate, status: "processing", errorMessage: `Mensaje ${candidate.campaignStep ?? ""} abierto en WhatsApp Web.`.trim() }
                : candidate
            )
          };
        }

        updateState(nextState, followup ? `Mensaje ${followup.campaignStep ?? ""} abierto para este lead.` : result.notice);
        return;
      }
      updateState(state, "Ese lead ya tiene una respuesta registrada.");
      return;
    }
    const result = handleIncomingReply(state, item.leadId, reply, item.campaignId);
    let nextState = result.state as typeof state;
    const followup = openFollowup
      ? nextState.queue.find((candidate) => candidate.leadId === item.leadId && candidate.status === "pending")
      : undefined;

    if (followup) {
      openWhatsAppWebComposer(followup.phone, queueComposerBody(followup));
      nextState = {
        ...nextState,
        queue: nextState.queue.map((candidate) =>
          candidate.id === followup.id
            ? { ...candidate, status: "processing", errorMessage: `Mensaje ${candidate.campaignStep ?? ""} abierto en WhatsApp Web.`.trim() }
            : candidate
        )
      };
    }

    updateState(
      nextState,
      followup ? `${result.notice} Mensaje ${followup.campaignStep ?? ""} abierto para el mismo lead.` : result.notice
    );
  }

  function handlePrepareSpecificStep(stepNumber: number, leadId?: string) {
    const targetLeadId = leadId ?? selectedConversation?.lead.id;
    if (!targetLeadId) return;
    const result = enqueueSpecificCampaignStep(state, targetLeadId, stepNumber, campaign?.id);
    let nextState = result.state as typeof state;
    const followup = nextState.queue.find(
      (candidate) =>
        candidate.leadId === targetLeadId &&
        candidate.campaignId === campaign?.id &&
        candidate.campaignStep === stepNumber &&
        candidate.status === "pending"
    );

    if (followup) {
      openWhatsAppWebComposer(followup.phone, queueComposerBody(followup));
      nextState = {
        ...nextState,
        queue: nextState.queue.map((candidate) =>
          candidate.id === followup.id
            ? { ...candidate, status: "processing" as const, errorMessage: `Mensaje ${stepNumber} abierto en WhatsApp Web.`.trim() }
            : candidate
        )
      };
    }

    updateState(
      nextState,
      followup ? `Mensaje ${stepNumber} abierto en WhatsApp Web.` : result.notice
    );
  }

  function prepareNoReplyMessage(leadId?: string) {
    if (!campaign) return;
    const conversation = leadId
      ? allConversations.find((item) => item.lead.id === leadId)
      : selectedConversation;
    if (!conversation) return;
    if (conversation.pending) {
      alert("Ese lead ya tiene un mensaje pendiente o abierto.");
      updateState(state, "Ese lead ya tiene un mensaje pendiente o abierto.");
      return;
    }
    if (conversation.lastInbound) {
      alert("Ese lead ya tiene una respuesta registrada.");
      updateState(state, "Ese lead ya tiene una respuesta registrada.");
      return;
    }
    
    const latestSentOrOutbound = conversation.latestSent || conversation.lastOutbound;
    if (!latestSentOrOutbound) {
      alert("Primero envía el mensaje inicial antes de marcar no contesta.");
      updateState(state, "Primero envia el mensaje inicial antes de marcar no contesta.");
      return;
    }

    let template = campaign.plantillaSeguimientoId
      ? state.templates.find((item) => item.id === campaign.plantillaSeguimientoId)
      : undefined;

    // Fallback 1: Buscar plantilla del Mensaje 3 en mensajesPostSi de la campaña
    if (!template) {
      const step3 = (campaign.mensajesPostSi ?? []).find((s) => s.step === 3);
      if (step3?.templateId) {
        template = state.templates.find((item) => item.id === step3.templateId);
      }
    }

    // Fallback 2: Buscar cualquier plantilla aprobada en el sistema que tenga 'cri cri' en el nombre
    if (!template) {
      template = state.templates.find(
        (item) =>
          item.estado === "aprobada" &&
          item.nombre.toLowerCase().includes("cri cri")
      );
    }

    if (!template || template.estado !== "aprobada") {
      alert("Selecciona una plantilla de seguimiento aprobada en la campaña para el mensaje de no contesta.");
      updateState(state, "Selecciona una plantilla de seguimiento aprobada para el mensaje de no contesta.");
      return;
    }

    const preparedFollowups = conversation.queue.filter(
      (item) => item.templateId === template.id && ["pending", "processing", "sent"].includes(item.status)
    ).length;
    if (preparedFollowups >= campaign.maxSeguimientos) {
      alert(`Ya se alcanzó el límite de ${campaign.maxSeguimientos} seguimiento(s) sin respuesta para este lead.`);
      updateState(state, `Ya se alcanzo el limite de ${campaign.maxSeguimientos} seguimiento(s) sin respuesta para este lead.`);
      return;
    }

    const now = new Date().toISOString();
    const noReplyItem: QueueItem = {
      id: `queue-${crypto.randomUUID()}`,
      leadId: conversation.lead.id,
      campaignId: campaign.id,
      phone: conversation.latestSent?.phone || normalizePhone(conversation.lead.telefono),
      messageType: "template",
      templateId: template.id,
      body: renderTemplate(template, conversation.lead, state.settings),
      status: "pending",
      scheduledAt: now,
      retries: 0,
      campaignStep: 2
    };

    updateState(
      {
        ...state,
        queue: [
          ...state.queue,
          {
            ...noReplyItem,
            errorMessage: "Mensaje de no contesta preparado. Confirma o abre en WhatsApp Web manualmente."
          }
        ],
        leads: state.leads.map((lead) =>
          lead.id === conversation.lead.id
            ? {
                ...lead,
                estado: "sin_respuesta",
                proximaAccion: "Enviar segundo mensaje",
                updatedAt: now
              }
            : lead
        )
      },
      `Mensaje de no contesta preparado para ${conversation.lead.nombreNegocio}.`
    );
  }

  function registerCampaignReply(lead: Lead, reply: "SI" | "BAJA") {
    if (!campaign) return;
    const now = new Date().toISOString();
    const inboundMessage = {
      id: `msg-${crypto.randomUUID()}`,
      leadId: lead.id,
      campaignId: campaign.id,
      direction: "inbound" as const,
      channel: "whatsapp" as const,
      body: reply,
      status: "received",
      createdAt: now
    };

    if (reply === "SI") {
      updateState(
        {
          ...state,
          messages: [...state.messages, inboundMessage],
          queue: state.queue.filter(
            (item) => !(item.leadId === lead.id && item.campaignId === campaign.id && (item.status === "pending" || item.status === "processing"))
          ),
          leads: state.leads.map((item) =>
            item.id === lead.id
              ? {
                  ...item,
                  estado: "interesado",
                  contactadoResultado: "interesado_comercial",
                  contactadoAt: now,
                  contactadoCampaignId: campaign.id,
                  contactadoBy: state.currentUser.uid,
                  campaignChatClosedAt: now,
                  campaignChatClosedCampaignId: campaign.id,
                  campaignChatArchivedAt: undefined,
                  campaignChatArchivedBy: undefined,
                  comercialAsignado: item.comercialAsignado || "",
                  proximaAccion: "Comercial debe contactar",
                  updatedAt: now
                }
              : item
          )
        },
        "Respuesta SI registrada: lead pasado a interesados."
      );
      setSelectedChatId("");
      return;
    }

    const phone = normalizePhone(lead.telefono);
    const email = lead.email.trim();
    const existsInDnc = state.doNotContact.some(
      (entry) => normalizePhone(entry.phone) === phone || Boolean(email && entry.email?.trim().toLowerCase() === email.toLowerCase())
    );

    updateState(
      {
        ...state,
        messages: [...state.messages, inboundMessage],
        queue: state.queue.filter(
          (item) => !(item.leadId === lead.id && item.campaignId === campaign.id && (item.status === "pending" || item.status === "processing"))
        ),
        doNotContact: existsInDnc
          ? state.doNotContact
          : [
              ...state.doNotContact,
              {
                id: `dnc-${crypto.randomUUID()}`,
                phone,
                email: email || undefined,
                reason: "Respuesta BAJA en campana",
                source: "campana_whatsapp",
                createdAt: now
              }
            ],
        leads: state.leads.map((item) =>
          item.id === lead.id
            ? {
                ...item,
                estado: "baja",
                fechaBaja: now,
                motivoBaja: "Respuesta BAJA",
                contactadoResultado: "no_interesa",
                contactadoAt: now,
                contactadoCampaignId: campaign.id,
                contactadoBy: state.currentUser.uid,
                contactadoCierre: "baja",
                contactadoCerradoAt: now,
                contactadoCerradoBy: state.currentUser.uid,
                contactadoCierreNotas: "No volver a contactar",
                campaignChatClosedAt: now,
                campaignChatClosedCampaignId: campaign.id,
                campaignChatArchivedAt: undefined,
                campaignChatArchivedBy: undefined,
                proximaAccion: "No contactar",
                updatedAt: now
              }
            : item
        )
      },
      "Respuesta BAJA registrada: solo este lead se ha dado de baja."
    );
    setSelectedChatId("");
  }

  function classifyCompletedLead(lead: Lead, outcome: ContactedLeadOutcome) {
    const now = new Date().toISOString();
    const nextLead: Lead = {
      ...lead,
      estado: contactedLeadStatus(outcome),
      contactadoResultado: outcome,
      contactadoAt: now,
      contactadoCampaignId: campaign?.id,
      contactadoBy: state.currentUser.uid,
      campaignChatClosedAt: now,
      campaignChatClosedCampaignId: campaign?.id,
      campaignChatArchivedAt: undefined,
      campaignChatArchivedBy: undefined,
      comercialAsignado: lead.comercialAsignado || "",
      proximaAccion: outcome === "no_interesa" ? "No contactar salvo nueva solicitud" : "Comercial debe contactar",
      updatedAt: now
    };
    onLeadSave(nextLead);
    setSelectedChatId("");
  }

  function archiveCampaignChat(leadId: string) {
    const now = new Date().toISOString();
    updateState(
      {
        ...state,
        leads: state.leads.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                campaignChatClosedAt: lead.campaignChatClosedAt ?? lead.contactadoAt ?? now,
                campaignChatClosedCampaignId: lead.campaignChatClosedCampaignId ?? campaign?.id,
                campaignChatArchivedAt: now,
                campaignChatArchivedBy: state.currentUser.uid,
                updatedAt: now
              }
            : lead
        )
      },
      "Chat terminado eliminado de la vista de campana."
    );
    if (selectedChatId === leadId) setSelectedChatId("");
  }

  function deleteCampaignChat(leadId: string) {
    if (!campaign) return;
    const lead = state.leads.find((item) => item.id === leadId);
    const label = lead?.nombreNegocio ?? "este chat";
    if (!window.confirm(`Borrar el chat de ${label}? Se eliminaran sus mensajes, notas y cola de esta campana, pero no el lead.`)) return;

    const now = new Date().toISOString();
    updateState(
      {
        ...state,
        queue: state.queue.filter((item) => !(item.leadId === leadId && item.campaignId === campaign.id)),
        messages: state.messages.filter((message) => !(message.leadId === leadId && message.campaignId === campaign.id)),
        leads: state.leads.map((candidate) =>
          candidate.id === leadId
            ? {
                ...candidate,
                campaignChatClosedAt: undefined,
                campaignChatClosedCampaignId: undefined,
                campaignChatArchivedAt: undefined,
                campaignChatArchivedBy: undefined,
                updatedAt: now
              }
            : candidate
        )
      },
      "Chat borrado de esta campana."
    );
    if (selectedChatId === leadId) setSelectedChatId("");
  }

  function handleDeleteLeadCompletely(leadId: string) {
    const lead = state.leads.find((item) => item.id === leadId);
    const label = lead?.nombreNegocio ?? "este lead";
    if (!window.confirm(`ELIMINAR LEAD POR COMPLETO?\n\nEsta acción borrará a "${label}" de la base de datos de forma permanente, incluyendo todos sus mensajes de WhatsApp, tareas y demos en cascada.\n\nNo se volverá a encolar ni aparecerá en ninguna pantalla.`)) return;

    onLeadDelete(leadId);
    if (selectedChatId === leadId) setSelectedChatId("");
  }

  function archiveAllClosedCampaignChats() {
    if (closedConversations.length === 0) {
      updateState(state, "No hay chats terminados para limpiar.");
      return;
    }
    const now = new Date().toISOString();
    const closedIds = new Set(closedConversations.map((conversation) => conversation.lead.id));
    updateState(
      {
        ...state,
        leads: state.leads.map((lead) =>
          closedIds.has(lead.id)
            ? {
                ...lead,
                campaignChatClosedAt: lead.campaignChatClosedAt ?? lead.contactadoAt ?? now,
                campaignChatClosedCampaignId: lead.campaignChatClosedCampaignId ?? campaign?.id,
                campaignChatArchivedAt: now,
                campaignChatArchivedBy: state.currentUser.uid,
                updatedAt: now
              }
            : lead
        )
      },
      `${closedConversations.length} chat(s) terminados eliminados de la vista de campana.`
    );
    if (selectedChatId && closedIds.has(selectedChatId)) setSelectedChatId("");
  }

  function appendChatMessage(kind: "internal_note" | "whatsapp_paste", body: string, direction: "inbound" | "outbound" = "inbound") {
    if (!selectedConversation || !body.trim()) return;
    const now = new Date().toISOString();
    updateState(
      {
        ...state,
        messages: [
          ...state.messages,
          {
            id: `msg-${crypto.randomUUID()}`,
            leadId: selectedConversation.lead.id,
            campaignId: campaign?.id,
            direction,
            channel: "whatsapp",
            kind,
            body: body.trim(),
            authorId: state.currentUser.uid,
            authorName: state.currentUser.nombre,
            status: kind === "internal_note" ? "internal" : "logged",
            createdAt: now
          }
        ],
        leads: state.leads.map((lead) =>
          lead.id === selectedConversation.lead.id
            ? { ...lead, ultimoContacto: now, updatedAt: now, proximaAccion: kind === "internal_note" ? lead.proximaAccion : "Conversacion real pegada en el chat" }
            : lead
        )
      },
      kind === "internal_note" ? "Nota interna guardada en el chat." : "Texto de WhatsApp pegado en el chat."
    );
  }

  function saveInternalNote() {
    appendChatMessage("internal_note", noteDraft, "outbound");
    setNoteDraft("");
  }

  function saveWhatsappPaste() {
    appendChatMessage("whatsapp_paste", pasteDraft, pasteDirection);
    setPasteDraft("");
  }

  const noReplyTemplate = campaign?.plantillaSeguimientoId
    ? state.templates.find((t) => t.id === campaign.plantillaSeguimientoId)
    : undefined;
  const noReplyButtonLabel = noReplyTemplate
    ? `No contesta, enviar ${noReplyTemplate.nombre}`
    : "No contesta, enviar cri cri";

  return (
    <div className="space-y-5">
      <ScreenHeader title="Campañas" subtitle="Constructor sencillo con checklist legal, segmentación y cola de envíos." />
      <div className={campaignTab === "chats" ? "grid gap-5" : "grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]"}>
        <aside className={campaignTab === "chats" ? "flex w-full max-w-md gap-2 rounded-lg border border-slate-200 bg-white p-2" : "self-start rounded-lg border border-slate-200 bg-white p-2"}>
          <button
            type="button"
            onClick={() => setCampaignTab("campaigns")}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold transition ${
              campaignTab === "campaigns" ? "bg-connessia-50 text-connessia-900" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Send size={16} />
            Campañas
          </button>
          <button
            type="button"
            onClick={() => setCampaignTab("chats")}
            className={`${campaignTab === "chats" ? "" : "mt-1"} flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold transition ${
              campaignTab === "chats" ? "bg-connessia-50 text-connessia-900" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="flex items-center gap-3">
              <MessageCircle size={16} />
              Chats
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{conversations.length}</span>
          </button>
        </aside>
        <div className="min-w-0 space-y-5">
        {campaignTab === "campaigns" && (
        <Card className="p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select className={inputClass} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {state.campaigns.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
            </select>
            <Button icon={<Plus size={18} />} onClick={() => setEditingCampaign(emptyCampaign(state.currentUser.uid))}>Nueva</Button>
          </div>
          {campaign && (
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-950">{campaign.nombre}</h3>
                  <p className="text-sm text-slate-500">{campaign.descripcion}</p>
                </div>
                <Badge value={campaign.estado} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={<Edit3 size={16} />} onClick={() => setEditingCampaign(campaign)}>Editar campaña</Button>
                <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => window.confirm("Eliminar esta campaña y su cola/mensajes?") && onCampaignDelete(campaign.id)}>Eliminar campaña</Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Info label="Zonas" value={campaign.segmento.zonas.join(", ")} />
                <Info label="Sectores" value={campaign.segmento.sectores.join(", ")} />
                <Info label="Grupos" value={campaign.segmento.grupoIds.length ? campaign.segmento.grupoIds.map((id) => state.leadGroups.find((group) => group.id === id)?.nombre ?? id).join(", ") : "Todos"} />
                <Info label="Mensajes post SI" value={`${campaignConfiguredSteps(campaign).length} configurado(s)`} />
                <Info label="Seguimiento sin respuesta" value={`${campaign.maxSeguimientos} tras ${formatFollowupDelay(campaign)}`} />
                <Info label="Plantilla inicial" value={state.templates.find((tpl) => tpl.id === campaign.plantillaInicialId)?.nombre ?? ""} />
                <Info label="Excluir contactados" value={campaign.excluirContactados ? "Sí (evita re-contactar)" : "No"} />
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
                <Button variant="secondary" icon={<RefreshCw size={18} />} onClick={enqueueNoReplyFollowups}>Preparar sin respuesta</Button>
                <Button variant="danger" icon={<PauseCircle size={18} />} onClick={() => onCampaignUpdate({ ...campaign, estado: "pausada", updatedAt: new Date().toISOString() })}>Pausar</Button>
              </div>
            </div>
          )}
        </Card>
        )}
        {campaignTab === "chats" && (
        <Card className="flex h-[calc(100vh-150px)] min-h-[620px] flex-col overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h3 className="text-lg font-bold text-slate-950">Chats de la campana</h3>
                <p className="text-sm text-slate-500">Trabaja cada lead como una conversacion y avanza al siguiente sin perder contexto.</p>
                <select className={`${inputClass} mt-3 max-w-md`} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                  {state.campaigns.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {closedConversations.length > 0 && (
                  <Button variant="secondary" icon={<Trash2 size={18} />} onClick={archiveAllClosedCampaignChats}>
                    Limpiar cerrados
                  </Button>
                )}
                <Button variant="secondary" icon={<ExternalLink size={18} />} onClick={openNextQueueItem}>Abrir siguiente</Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs xl:grid-cols-5">
              <div className="rounded-md bg-slate-50 p-2"><strong className="block text-base text-slate-950">{activeQueue.filter((item) => item.status === "pending").length}</strong>Pendientes</div>
              <div className="rounded-md bg-blue-50 p-2"><strong className="block text-base text-blue-900">{activeQueue.filter((item) => item.status === "processing").length}</strong>Abiertos</div>
              <div className="rounded-md bg-amber-50 p-2"><strong className="block text-base text-amber-900">{waitingCount}</strong>Esperando</div>
              <div className="rounded-md bg-emerald-50 p-2"><strong className="block text-base text-emerald-900">{respondedCount}</strong>Respondidos</div>
              <div className="rounded-md bg-slate-100 p-2"><strong className="block text-base text-slate-900">{closedConversations.length}</strong>Cerrados</div>
            </div>
            {blockedCount > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                Hay {blockedCount} contacto(s) que necesitan revision antes de avanzar.
              </div>
            )}
          </div>
          <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col border-b border-slate-200 bg-white lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
              <p className="text-xs font-bold uppercase text-slate-500">Chats activos</p>
              <span className="text-xs font-semibold text-slate-400">{conversations.length} activo(s)</span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {conversations.map((conversation) => {
                const isSelected = selectedConversation?.lead.id === conversation.lead.id;
                const lastText = conversation.lastInbound
                  ? conversation.lastInbound.body
                  : conversation.pending
                    ? queueComposerBody(conversation.pending)
                    : conversation.lastOutbound?.body ?? conversation.blockedReason ?? "Sin movimiento";
                return (
                  <button
                    key={conversation.lead.id}
                    type="button"
                    onClick={() => setSelectedChatId(conversation.lead.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left transition ${
                      isSelected ? "border-connessia-300 bg-connessia-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">{conversation.lead.nombreNegocio}</p>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <span className="truncate">
                            {conversation.lead.personaContacto || normalizePhone(conversation.lead.telefono)}
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            title="Copiar teléfono"
                            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-transparent hover:border-slate-200 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigator.clipboard.writeText(normalizePhone(conversation.lead.telefono));
                              setCopiedLeadId(conversation.lead.id);
                              setTimeout(() => setCopiedLeadId(null), 1500);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              event.stopPropagation();
                              navigator.clipboard.writeText(normalizePhone(conversation.lead.telefono));
                              setCopiedLeadId(conversation.lead.id);
                              setTimeout(() => setCopiedLeadId(null), 1500);
                            }}
                          >
                            {copiedLeadId === conversation.lead.id ? (
                              <Check size={11} className="text-emerald-500" />
                            ) : (
                              <Copy size={11} />
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`mt-0.5 h-2.5 w-2.5 rounded-full ${
                          conversation.status === "chat_abierto"
                            ? "bg-blue-500"
                            : conversation.status === "pendiente_envio"
                              ? "bg-slate-400"
                              : conversation.status === "respondio_si"
                                ? "bg-emerald-500"
                                : conversation.status === "esperando_respuesta"
                                  ? "bg-amber-500"
                                  : "bg-slate-300"
                        }`} />
                        <span
                          role="button"
                          tabIndex={0}
                          title="Borrar chat"
                          className="rounded-md border border-slate-200 p-1 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteCampaignChat(conversation.lead.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            event.stopPropagation();
                            deleteCampaignChat(conversation.lead.id);
                          }}
                        >
                          <Trash2 size={13} />
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-600">{lastText}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Badge value={conversationStatusLabel(conversation.status)} />
                      <span className="text-[11px] font-semibold text-slate-400">{conversation.messages.length} msg</span>
                    </div>
                  </button>
                );
              })}
              {conversations.length === 0 && (
                <div className="rounded-md border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
                  Todavia no hay leads dentro de esta campana.
                </div>
              )}
            </div>
            {closedConversations.length > 0 && (
              <div className="max-h-48 shrink-0 overflow-y-auto border-t border-slate-200 bg-white px-5 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase text-slate-500">Terminados</p>
                  <button
                    type="button"
                    className="text-xs font-bold text-connessia-700 hover:text-connessia-900"
                    onClick={archiveAllClosedCampaignChats}
                  >
                    Limpiar todos
                  </button>
                </div>
                <div className="space-y-2">
                  {closedConversations.map((conversation) => (
                    <div key={conversation.lead.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-950">{conversation.lead.nombreNegocio}</p>
                        <p className="truncate text-xs text-slate-500">{contactedOutcomeLabels[conversation.lead.contactadoResultado ?? "interesado_comercial"]}</p>
                      </div>
                      <button
                        type="button"
                        title="Eliminar chat terminado de esta vista"
                        className="rounded-md border border-slate-200 p-2 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        onClick={() => archiveCampaignChat(conversation.lead.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex min-h-0 flex-col bg-[#efe7dc]">
              {selectedConversation ? (
                <>
                  <div className="border-b border-slate-200 bg-white px-5 py-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-slate-950">{selectedConversation.lead.nombreNegocio}</h4>
                          <Badge value={conversationStatusLabel(selectedConversation.status)} />
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                          <span>
                            {selectedConversation.lead.personaContacto || "Sin contacto"} · {normalizePhone(selectedConversation.lead.telefono)}
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            title="Copiar teléfono"
                            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-transparent hover:border-slate-200 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigator.clipboard.writeText(normalizePhone(selectedConversation.lead.telefono));
                              setCopiedLeadId(selectedConversation.lead.id);
                              setTimeout(() => setCopiedLeadId(null), 1500);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              event.stopPropagation();
                              navigator.clipboard.writeText(normalizePhone(selectedConversation.lead.telefono));
                              setCopiedLeadId(selectedConversation.lead.id);
                              setTimeout(() => setCopiedLeadId(null), 1500);
                            }}
                          >
                            {copiedLeadId === selectedConversation.lead.id ? (
                              <Check size={11} className="text-emerald-500" />
                            ) : (
                              <Copy size={11} />
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="secondary" icon={<Trash2 size={16} />} onClick={() => deleteCampaignChat(selectedConversation.lead.id)} title="Limpia la cola y mensajes de esta campaña para este lead, pero lo conserva en el CRM">
                          Limpiar chat
                        </Button>
                        <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => handleDeleteLeadCompletely(selectedConversation.lead.id)} title="Elimina por completo a este lead del CRM y la base de datos de forma permanente">
                          Eliminar lead
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto p-5">
                    {selectedTimeline.map((message) => (
                      <div key={message.id} className={`flex ${message.kind === "internal_note" ? "justify-center" : message.direction === "inbound" ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[82%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                          message.kind === "internal_note"
                            ? "border border-amber-200 bg-amber-50 text-amber-950"
                            : message.direction === "inbound"
                              ? "bg-white text-slate-800"
                              : "bg-[#d9fdd3] text-slate-900"
                        }`}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-500">
                            <span className="flex items-center gap-1.5">
                              {message.label}
                              {message.kind !== "internal_note" && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  title="Copiar mensaje al portapapeles"
                                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-transparent hover:border-slate-200 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigator.clipboard.writeText(message.body);
                                    setCopiedMessageId(message.id);
                                    setTimeout(() => setCopiedMessageId(null), 1500);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key !== "Enter" && event.key !== " ") return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    navigator.clipboard.writeText(message.body);
                                    setCopiedMessageId(message.id);
                                    setTimeout(() => setCopiedMessageId(null), 1500);
                                  }}
                                >
                                  {copiedMessageId === message.id ? (
                                    <Check size={11} className="text-emerald-500" />
                                  ) : (
                                    <Copy size={11} />
                                  )}
                                </span>
                              )}
                            </span>
                            <span>{formatDateTime(message.at)}</span>
                          </div>
                          <p className="whitespace-pre-wrap">{message.body}</p>
                        </div>
                      </div>
                    ))}
                    {selectedTimeline.length === 0 && (
                      <div className="rounded-md bg-white/80 p-4 text-sm text-slate-600">
                        Aun no hay mensajes con este lead. Valida la campana para preparar el primer envio.
                      </div>
                    )}
                  </div>
                  <div className="border-t border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap gap-2">
                      {pendingItem && (
                        <>
                          <Button variant="secondary" icon={<ExternalLink size={16} />} onClick={() => openQueueItem(pendingItem)}>
                            Abrir chat
                          </Button>
                          <Button
                            variant="secondary"
                            icon={copiedMessageId === pendingItem.id ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                            onClick={() => {
                              const body = queueComposerBody(pendingItem);
                              navigator.clipboard.writeText(body);
                              setCopiedMessageId(pendingItem.id);
                              setTimeout(() => setCopiedMessageId(null), 1500);
                            }}
                          >
                            {copiedMessageId === pendingItem.id ? "Copiado" : "Copiar mensaje"}
                          </Button>
                          {pendingItem.mediaUrl && (
                            <Button variant="secondary" icon={<ExternalLink size={16} />} onClick={() => window.open(pendingItem.mediaUrl, "_blank", "noopener,noreferrer")}>
                              Abrir asset
                            </Button>
                          )}
                          <Button variant="secondary" icon={<ClipboardCheck size={16} />} onClick={() => markQueueItemSent(pendingItem)}>
                            Marcar enviado
                          </Button>
                          <Button icon={<Send size={16} />} onClick={() => markQueueItemSent(pendingItem, true)}>
                            Enviado y siguiente
                          </Button>
                        </>
                      )}
                      {!selectedConversation.pending && (selectedConversation.latestSent || selectedConversation.lastOutbound) && !selectedConversation.lastInbound && (
                        <>
                          {selectedConversation.chatStep === "second_sent" ? (
                            <>
                              <Button variant="secondary" onClick={() => classifyCompletedLead(selectedConversation.lead, "dudoso_comercial")}>
                                No contesta, pasar a dudoso
                              </Button>
                              <Button onClick={() => registerCampaignReply(selectedConversation.lead, "SI")}>
                                Dice SI, interesado
                              </Button>
                              <Button variant="danger" onClick={() => registerCampaignReply(selectedConversation.lead, "BAJA")}>
                                Dice NO / BAJA
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="secondary" onClick={() => prepareNoReplyMessage()}>
                                {noReplyButtonLabel}
                              </Button>
                              <Button onClick={() => registerCampaignReply(selectedConversation.lead, "SI")}>
                                Contesta SI
                              </Button>
                              <Button variant="danger" onClick={() => registerCampaignReply(selectedConversation.lead, "BAJA")}>
                                Contesta NO / BAJA
                              </Button>
                            </>
                          )}
                        </>
                      )}
                      {selectedConversation.lastInbound && selectedConversation.status === "respondio_si" && !selectedConversation.pending && selectedConversation.latestSent && selectedNextCampaignStep && (
                        <>
                          <Button icon={<Send size={16} />} onClick={() => registerQueueReply(selectedConversation.latestSent as QueueItem, "SI")}>
                            Preparar mensaje {selectedNextCampaignStep}
                          </Button>
                          <Button variant="secondary" onClick={() => classifyCompletedLead(selectedConversation.lead, "dudoso_comercial")}>
                            Dudoso
                          </Button>
                          <Button onClick={() => classifyCompletedLead(selectedConversation.lead, "interesado_comercial")}>
                            Interesado
                          </Button>
                        </>
                      )}
                      {selectedConversation.lastInbound && selectedConversation.status === "respondio_si" && !selectedConversation.pending && !selectedNextCampaignStep && (
                        <span className="inline-flex min-h-10 items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
                          Secuencia de campaña completada.
                        </span>
                      )}
                      {selectedConversation.lastInbound && selectedConversation.status === "respondio_si" && !selectedConversation.pending && !selectedNextCampaignStep && (
                        <>
                          <Button variant="secondary" onClick={() => classifyCompletedLead(selectedConversation.lead, "dudoso_comercial")}>
                            Dudoso, paso a comercial
                          </Button>
                          <Button variant="danger" onClick={() => classifyCompletedLead(selectedConversation.lead, "no_interesa")}>
                            Baja / no interesa
                          </Button>
                          <Button onClick={() => classifyCompletedLead(selectedConversation.lead, "interesado_comercial")}>
                            Interesado, paso a comercial
                          </Button>
                        </>
                      )}
                      {selectedConversation.lastInbound && selectedConversation.status !== "respondio_si" && (
                        <span className="inline-flex min-h-10 items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
                          Respuesta registrada.
                        </span>
                      )}
                      {selectedConversation.lastInbound && selectedConversation.status !== "respondio_si" && !selectedConversation.pending && (
                        <>
                          <Button variant="secondary" onClick={() => classifyCompletedLead(selectedConversation.lead, "dudoso_comercial")}>
                            Cerrar como dudoso
                          </Button>
                          <Button onClick={() => classifyCompletedLead(selectedConversation.lead, "interesado_comercial")}>
                            Cerrar como interesado
                          </Button>
                          <Button variant="danger" onClick={() => classifyCompletedLead(selectedConversation.lead, "no_interesa")}>
                            Baja / no interesa
                          </Button>
                        </>
                      )}
                      {!selectedConversation.pending && !selectedConversation.latestSent && !selectedConversation.lastOutbound && !selectedConversation.lastInbound && !selectedConversation.blockedReason && (
                        <Button icon={<Send size={16} />} onClick={() => prepareInitialMessage()}>
                          Preparar primer mensaje
                        </Button>
                      )}
                      {!selectedConversation.pending && !selectedConversation.lastInbound && selectedConversation.blockedReason && (
                        <span className="inline-flex min-h-10 items-center rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                          {selectedConversation.blockedReason}
                        </span>
                      )}
                    </div>
                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <label className="text-xs font-bold uppercase text-slate-500">Nota interna</label>
                        <textarea
                          className={`${inputClass} mt-2 min-h-[92px] resize-y`}
                          value={noteDraft}
                          onChange={(event) => setNoteDraft(event.target.value)}
                          placeholder="Ej: ha pedido precio, hablar con David antes de responder..."
                        />
                        <div className="mt-2 flex justify-end">
                          <Button variant="secondary" disabled={!noteDraft.trim()} onClick={saveInternalNote}>
                            Guardar nota
                          </Button>
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-xs font-bold uppercase text-slate-500">Pegar WhatsApp real</label>
                          <select
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                            value={pasteDirection}
                            onChange={(event) => setPasteDirection(event.target.value as "inbound" | "outbound")}
                          >
                            <option value="inbound">Cliente</option>
                            <option value="outbound">Equipo</option>
                          </select>
                        </div>
                        <textarea
                          className={`${inputClass} mt-2 min-h-[92px] resize-y`}
                          value={pasteDraft}
                          onChange={(event) => setPasteDraft(event.target.value)}
                          placeholder="Pega aqui fragmentos de la conversacion real de WhatsApp"
                        />
                        <div className="mt-2 flex justify-end">
                          <Button variant="secondary" disabled={!pasteDraft.trim()} onClick={saveWhatsappPaste}>
                            Guardar texto
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-600">
                  Selecciona una campana y encola leads para empezar a trabajar los chats.
                </div>
              )}
            </div>
          </div>
        </Card>
        )}
        <Card className="hidden">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h3 className="text-lg font-bold text-slate-950">Estado de conversaciones</h3>
              <p className="text-sm text-slate-500">Control por lead de lo enviado, respuestas y pendientes.</p>
            </div>
            <Button variant="secondary" icon={<ExternalLink size={18} />} onClick={openNextQueueItem}>Abrir siguiente</Button>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2 text-center text-xs xl:grid-cols-4">
            <div className="rounded-md bg-slate-50 p-2"><strong className="block text-base text-slate-950">{activeQueue.filter((item) => item.status === "pending").length}</strong>Pendientes</div>
            <div className="rounded-md bg-blue-50 p-2"><strong className="block text-base text-blue-900">{activeQueue.filter((item) => item.status === "processing").length}</strong>Abiertos</div>
            <div className="rounded-md bg-amber-50 p-2"><strong className="block text-base text-amber-900">{waitingCount}</strong>Esperando</div>
            <div className="rounded-md bg-emerald-50 p-2"><strong className="block text-base text-emerald-900">{respondedCount}</strong>Respondidos</div>
          </div>
          {blockedCount > 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              Hay {blockedCount} contacto(s) que necesitan revision antes de avanzar.
            </div>
          )}
          <div className="space-y-3">
            {conversations.map((conversation) => {
              const actionItem = conversation.pending ?? conversation.latestSent;
              return (
                <div key={conversation.lead.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-slate-950">{conversation.lead.nombreNegocio}</strong>
                        <Badge value={conversationStatusLabel(conversation.status)} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{conversation.lead.personaContacto || "Sin contacto"} · {conversation.lead.telefono}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {conversation.messages.length} mensajes
                    </span>
                  </div>
                  <div className="mt-3 rounded-md bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Ultimo movimiento</p>
                    <p className="mt-1 line-clamp-2 text-slate-700">
                      {conversation.lastInbound
                        ? `Cliente: ${conversation.lastInbound.body}`
                        : conversation.lastOutbound
                          ? `Enviado: ${conversation.lastOutbound.body}`
                          : conversation.pending
                            ? `Preparado: ${conversation.pending.body}`
                            : conversation.blockedReason ?? "Aun sin mensajes preparados."}
                    </p>
                  </div>
                  {conversation.messages.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {conversation.messages.slice(-3).map((message) => (
                        <div key={message.id} className={`rounded-md px-3 py-2 ${message.direction === "inbound" ? "bg-connessia-50 text-connessia-950" : "bg-slate-50 text-slate-700"}`}>
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold">
                            <span>{message.direction === "inbound" ? "Cliente respondio" : "Mensaje enviado"}</span>
                            <span className="text-slate-500">{formatDateTime(message.createdAt)}</span>
                          </div>
                          <p className="line-clamp-2 whitespace-pre-wrap">{message.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {conversation.pending && (
                      <>
                        <a
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-connessia-300 hover:text-connessia-800"
                          href={buildWhatsAppWebUrl(conversation.pending.phone, queueComposerBody(conversation.pending))}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => {
                            event.preventDefault();
                            openQueueItem(conversation.pending as QueueItem);
                          }}
                        >
                          <ExternalLink size={16} />
                          Abrir chat
                        </a>
                        <Button variant="secondary" icon={<ClipboardCheck size={16} />} onClick={() => markQueueItemSent(conversation.pending as QueueItem)}>
                          Marcar enviado
                        </Button>
                        <Button icon={<Send size={16} />} onClick={() => markQueueItemSent(conversation.pending as QueueItem, true)}>
                          Enviado y siguiente
                        </Button>
                      </>
                    )}
                    {!conversation.pending && conversation.latestSent && !conversation.lastInbound && (
                      <>
                        <Button variant="secondary" onClick={() => registerQueueReply(conversation.latestSent as QueueItem, "SI")}>Respuesta SI</Button>
                        <Button variant="secondary" onClick={() => registerQueueReply(conversation.latestSent as QueueItem, "NO", false)}>Respuesta NO</Button>
                        <Button variant="danger" onClick={() => registerQueueReply(conversation.latestSent as QueueItem, "BAJA", false)}>BAJA</Button>
                        {campaignConfiguredSteps(campaign).includes(3) &&
                          !conversation.queue.some((item) => item.campaignStep === 3 && ["pending", "processing", "sent"].includes(item.status)) && (
                            <Button icon={<Send size={16} />} onClick={() => handlePrepareSpecificStep(3, conversation.lead.id)}>
                              Preparar Mensaje 3
                            </Button>
                        )}
                        {campaignConfiguredSteps(campaign).includes(4) &&
                          !conversation.queue.some((item) => item.campaignStep === 4 && ["pending", "processing", "sent"].includes(item.status)) &&
                          (!campaignConfiguredSteps(campaign).includes(3) || conversation.queue.some((item) => item.campaignStep === 3 && ["sent"].includes(item.status))) && (
                            <Button icon={<Send size={16} />} onClick={() => handlePrepareSpecificStep(4, conversation.lead.id)}>
                              Preparar Mensaje 4
                            </Button>
                        )}
                      </>
                    )}
                    {conversation.lastInbound && (
                      <span className="inline-flex min-h-10 items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
                        Ya respondio. Seguimiento registrado.
                      </span>
                    )}
                    {!actionItem && !conversation.lastInbound && conversation.blockedReason && (
                      <span className="inline-flex min-h-10 items-center rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                        {conversation.blockedReason}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {conversations.length === 0 && <p className="text-sm text-slate-500">Todavia no hay leads dentro de esta campana.</p>}
          </div>
        </Card>
      </div>
      </div>
      {editingCampaign && (
        <CampaignFormModal
          campaign={editingCampaign}
          groups={state.leadGroups}
          templates={state.templates}
          assets={state.assets}
          onClose={() => setEditingCampaign(null)}
          onSave={saveCampaign}
        />
      )}
    </div>
  );
}

function ContactedLeadsScreen({
  state,
  onSelect,
  onSave,
  onScheduleDemo
}: {
  state: ReturnType<typeof useCrmStore>["state"];
  onSelect: (id: string) => void;
  onSave: (lead: Lead) => void;
  onScheduleDemo: (lead: Lead) => void;
}) {
  const outcomes: ContactedLeadOutcome[] = ["interesado_comercial", "dudoso_comercial", "no_interesa"];
  const contactedLeads = state.leads
    .filter((lead) => lead.contactadoResultado && !lead.contactadoCerradoAt && lead.seguimiento !== "finalizado")
    .sort((a, b) => (b.contactadoAt ?? "").localeCompare(a.contactadoAt ?? ""));

  function closeLead(lead: Lead, closeStatus: ContactedLeadCloseStatus) {
    const now = new Date().toISOString();
    onSave({
      ...lead,
      estado: closeStatus === "baja" ? "baja" : lead.estado,
      fechaBaja: closeStatus === "baja" ? now : lead.fechaBaja,
      motivoBaja: closeStatus === "baja" ? "Cerrado como baja por comercial" : lead.motivoBaja,
      contactadoCierre: closeStatus,
      contactadoCerradoAt: now,
      contactadoCerradoBy: state.currentUser.uid,
      contactadoCierreNotas: closeStatus === "baja" ? "No volver a contactar" : "Gestionado por comercial",
      proximaAccion: closeStatus === "baja" ? "No contactar" : "Gestion terminado",
      updatedAt: now
    });
  }

  function sectionTone(outcome: ContactedLeadOutcome) {
    if (outcome === "interesado_comercial") return "border-emerald-200 bg-emerald-50";
    if (outcome === "dudoso_comercial") return "border-amber-200 bg-amber-50";
    return "border-red-200 bg-red-50";
  }

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Leads contactados"
        subtitle="Bandeja compartida para que admin y comerciales trabajen los cierres de campana."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {outcomes.map((outcome) => (
          <StatCard
            key={outcome}
            label={contactedOutcomeLabels[outcome]}
            value={contactedLeads.filter((lead) => lead.contactadoResultado === outcome).length}
            icon={<Users size={20} />}
            tone={outcome === "no_interesa" ? "coral" : outcome === "dudoso_comercial" ? "slate" : "blue"}
          />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {outcomes.map((outcome) => {
          const leads = contactedLeads.filter((lead) => lead.contactadoResultado === outcome);
          return (
            <Card key={outcome} className="overflow-hidden">
              <div className={`border-b p-4 ${sectionTone(outcome)}`}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-slate-950">{contactedOutcomeLabels[outcome]}</h3>
                  <Badge value={outcome} />
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {leads.map((lead) => {
                  const campaign = state.campaigns.find((item) => item.id === lead.contactadoCampaignId);
                  const assigned = state.users.find((user) => user.uid === lead.comercialAsignado)?.nombre ?? (lead.comercialAsignado || "Sin asignar");
                  return (
                    <div key={lead.id} className="p-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <button className="font-bold text-connessia-800" onClick={() => onSelect(lead.id)}>
                            {lead.nombreNegocio}
                          </button>
                          <p className="text-xs text-slate-500">{lead.personaContacto || "Sin contacto"} · {lead.telefono}</p>
                        </div>
                        <Badge value={lead.estado} />
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-slate-600">
                        <p><strong>Comercial:</strong> {assigned}</p>
                        <p><strong>Campana:</strong> {campaign?.nombre ?? "Sin campana"}</p>
                        <p><strong>Clasificado:</strong> {formatDateTime(lead.contactadoAt)}</p>
                        <p><strong>Proxima accion:</strong> {lead.proximaAccion ?? "Contactar lead"}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => onSelect(lead.id)}>Abrir ficha</Button>
                        {outcome !== "no_interesa" && (
                          <Button onClick={() => onScheduleDemo(lead)}>
                            Agendar demo
                          </Button>
                        )}
                        <Button onClick={() => closeLead(lead, "terminado")}>
                          Terminado
                        </Button>
                        <Button variant="danger" onClick={() => closeLead(lead, "baja")}>
                          Baja
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {leads.length === 0 && <p className="p-4 text-sm text-slate-500">Sin leads en esta bandeja.</p>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function FinishedLeadsScreen({
  state,
  onSelect
}: {
  state: ReturnType<typeof useCrmStore>["state"];
  onSelect: (id: string) => void;
}) {
  const finishedLeads = state.leads
    .filter((lead) => lead.contactadoCerradoAt || lead.seguimiento === "finalizado")
    .sort((a, b) => {
      const dateA = a.contactadoCerradoAt || a.updatedAt || "";
      const dateB = b.contactadoCerradoAt || b.updatedAt || "";
      return dateB.localeCompare(dateA);
    });
  const closeStatuses: ContactedLeadCloseStatus[] = ["terminado", "baja"];

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Leads terminados"
        subtitle="Archivo compartido de leads ya gestionados para no volver a repetirlos en futuras busquedas."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {closeStatuses.map((status) => (
          <StatCard
            key={status}
            label={contactedCloseLabels[status]}
            value={finishedLeads.filter((lead) => 
              lead.contactadoCierre === status || (status === "terminado" && !lead.contactadoCierre && lead.seguimiento === "finalizado")
            ).length}
            icon={<Users size={20} />}
            tone={status === "baja" ? "coral" : "blue"}
          />
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Negocio</th>
                <th>Resultado campana</th>
                <th>Cierre</th>
                <th>Telefono</th>
                <th>Sector</th>
                <th>Campana</th>
                <th>Fecha cierre</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {finishedLeads.map((lead) => {
                const campaign = state.campaigns.find((item) => item.id === lead.contactadoCampaignId);
                return (
                  <tr key={lead.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <button className="font-bold text-connessia-800" onClick={() => onSelect(lead.id)}>
                        {lead.nombreNegocio}
                      </button>
                      <p className="text-xs text-slate-500">{lead.personaContacto || "Sin contacto"}</p>
                    </td>
                    <td><Badge value={lead.contactadoResultado ?? "sin resultado"} /></td>
                    <td><Badge value={lead.contactadoCierre ?? "terminado"} /></td>
                    <td>{lead.telefono}</td>
                    <td>{lead.sector || "Sin sector"}</td>
                    <td>{campaign?.nombre ?? "Sin campana"}</td>
                    <td>{formatDateTime(lead.contactadoCerradoAt || lead.updatedAt)}</td>
                    <td>
                      <Button variant="secondary" onClick={() => onSelect(lead.id)}>
                        Abrir ficha
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {finishedLeads.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    Todavia no hay leads terminados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function TemplatesScreen({
  templates,
  onSave,
  onDelete
}: {
  templates: MessageTemplate[];
  onSave: (template: MessageTemplate) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Plantillas"
        subtitle="Mensajes base para WhatsApp Web. Los iniciales no se preparan si no están aprobados."
        action={<Button icon={<Plus size={18} />} onClick={() => setEditing(emptyTemplate())}>Nueva plantilla</Button>}
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
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" icon={<Edit3 size={16} />} onClick={() => setEditing(template)}>Editar</Button>
              <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => window.confirm("Eliminar esta plantilla? Se quitara de las campanas que la usen.") && onDelete(template.id)}>Eliminar</Button>
            </div>
          </Card>
        ))}
        {templates.length === 0 && <Card className="p-5 text-sm text-slate-500">Todavia no hay plantillas.</Card>}
      </div>
      {editing && (
        <TemplateFormModal
          template={editing}
          onClose={() => setEditing(null)}
          onSave={(template) => {
            onSave(template);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function TemplateFormModal({
  template,
  onClose,
  onSave
}: {
  template: MessageTemplate;
  onClose: () => void;
  onSave: (template: MessageTemplate) => void;
}) {
  const [draft, setDraft] = useState(template);

  return (
    <Modal title="Plantilla WhatsApp" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre" value={draft.nombre} onChange={(value) => setDraft({ ...draft, nombre: value })} />
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Tipo</span>
          <select className={inputClass} value={draft.tipo} onChange={(event) => setDraft({ ...draft, tipo: event.target.value as MessageTemplate["tipo"] })}>
            <option value="plantilla_inicial">Inicial</option>
            <option value="plantilla_seguimiento">Seguimiento sin respuesta</option>
            <option value="plantilla_info">Info tras SI</option>
            <option value="plantilla_recordatorio_demo">Recordatorio demo</option>
            <option value="plantilla_baja">Baja / cierre</option>
            <option value="plantilla_error">Error</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Estado</span>
          <select className={inputClass} value={draft.estado} onChange={(event) => setDraft({ ...draft, estado: event.target.value as MessageTemplate["estado"] })}>
            {["borrador", "enviada_a_revision", "aprobada", "rechazada", "pausada"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <Field label="Idioma" value={draft.idioma} onChange={(value) => setDraft({ ...draft, idioma: value })} />
        <Field label="Categoria" value={draft.categoria} onChange={(value) => setDraft({ ...draft, categoria: value })} />
        <Field label="Variables separadas por coma" value={draft.variables.join(", ")} onChange={(value) => setDraft({ ...draft, variables: value.split(",").map((item) => item.trim()).filter(Boolean) })} />
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Texto</span>
          <textarea className={inputClass} rows={8} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => onSave({ ...draft, nombre: draft.nombre.trim() || "Plantilla sin nombre", body: draft.body.trim() })}>Guardar plantilla</Button>
      </div>
    </Modal>
  );
}

function AssetsScreen({
  state,
  onSave,
  onDelete
}: {
  state: ReturnType<typeof useCrmStore>["state"];
  onSave: (asset: CommercialAsset) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<CommercialAsset | null>(null);
  return (
    <div className="space-y-5">
      <ScreenHeader title="Assets comerciales" subtitle="Imágenes, PDF y vídeos para campañas. En producción se suben a Firebase Storage." />
      <div className="flex justify-end">
        <Button icon={<FileUp size={18} />} onClick={() => setEditing(emptyAsset())}>Nuevo asset</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.assets.map((asset) => (
          <Card key={asset.id} className="overflow-hidden">
            {asset.type === "imagen" && asset.url && <img className="h-44 w-full object-cover" src={asset.url} alt={asset.name} />}
            {asset.type !== "imagen" && (
              <div className="flex h-44 items-center justify-center bg-slate-100 text-sm font-semibold uppercase text-slate-500">
                {asset.type}
              </div>
            )}
            <div className="p-4">
              <h3 className="font-bold text-slate-950">{asset.name}</h3>
              <p className="text-sm text-slate-500">{asset.type} · {asset.storagePath}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {asset.url && <Button variant="secondary" icon={<ExternalLink size={16} />} onClick={() => window.open(asset.url, "_blank", "noopener,noreferrer")}>Abrir</Button>}
                <Button variant="secondary" icon={<Edit3 size={16} />} onClick={() => setEditing(asset)}>Editar</Button>
                <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => window.confirm("Eliminar este asset? Se quitara de las campanas que lo usen.") && onDelete(asset.id)}>Eliminar</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {state.assets.length === 0 && <Card className="p-5 text-sm text-slate-500">Todavia no hay assets. Crea uno con una URL publica de Firebase Storage, una imagen o un PDF.</Card>}
      {editing && (
        <AssetFormModal
          asset={editing}
          firebaseConfig={state.settings.firebaseConfig}
          onClose={() => setEditing(null)}
          onSave={(asset) => {
            onSave(asset);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CampaignFormModal({
  campaign,
  groups,
  templates,
  assets,
  onClose,
  onSave
}: {
  campaign: Campaign;
  groups: LeadGroup[];
  templates: MessageTemplate[];
  assets: CommercialAsset[];
  onClose: () => void;
  onSave: (campaign: Campaign) => void;
}) {
  const [draft, setDraft] = useState(campaign);
  const postSiSteps = draft.mensajesPostSi ?? [{ step: 3 as const }, { step: 4 as const }];
  const templateOptions = templates.filter(
    (template) =>
      template.estado === "aprobada" ||
      template.id === draft.plantillaInicialId ||
      template.id === draft.plantillaInfoId ||
      template.id === draft.plantillaSeguimientoId ||
      postSiSteps.some((step) => step.templateId === template.id)
  );

  function toggleGroup(groupId: string, checked: boolean) {
    setDraft((current) => ({
      ...current,
      segmento: {
        ...current.segmento,
        grupoIds: checked
          ? [...current.segmento.grupoIds, groupId]
          : current.segmento.grupoIds.filter((id) => id !== groupId)
      }
    }));
  }

  function updateCsv(key: "zonas" | "sectores", value: string) {
    setDraft((current) => ({
      ...current,
      segmento: {
        ...current.segmento,
        [key]: value.split(",").map((item) => item.trim()).filter(Boolean)
      }
    }));
  }

  function updatePostSiStep(stepNumber: 3 | 4, patch: { templateId?: string; assetId?: string }) {
    setDraft((current) => {
      const existing = current.mensajesPostSi ?? [{ step: 3 as const }, { step: 4 as const }];
      const nextSteps = [3, 4].map((step) => {
        const currentStep = existing.find((item) => item.step === step) ?? { step: step as 3 | 4 };
        return step === stepNumber ? { ...currentStep, ...patch } : currentStep;
      });
      return { ...current, mensajesPostSi: nextSteps };
    });
  }

  return (
    <Modal title="Campana" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre" value={draft.nombre} onChange={(value) => setDraft({ ...draft, nombre: value })} />
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Estado</span>
          <select className={inputClass} value={draft.estado} onChange={(event) => setDraft({ ...draft, estado: event.target.value as Campaign["estado"] })}>
            {["borrador", "activa", "pausada", "finalizada"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Descripcion</span>
          <textarea className={inputClass} rows={3} value={draft.descripcion} onChange={(event) => setDraft({ ...draft, descripcion: event.target.value })} />
        </label>
        <Field label="Zonas separadas por coma" value={draft.segmento.zonas.join(", ")} onChange={(value) => updateCsv("zonas", value)} />
        <Field label="Sectores separados por coma" value={draft.segmento.sectores.join(", ")} onChange={(value) => updateCsv("sectores", value)} />
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Plantilla inicial</span>
          <select className={inputClass} value={draft.plantillaInicialId} onChange={(event) => setDraft({ ...draft, plantillaInicialId: event.target.value })}>
            {templateOptions.map((template) => <option key={template.id} value={template.id}>{template.nombre}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Plantilla tras SI</span>
          <select className={inputClass} value={draft.plantillaInfoId ?? ""} onChange={(event) => setDraft({ ...draft, plantillaInfoId: event.target.value || undefined })}>
            <option value="">Sin plantilla informativa</option>
            {templateOptions.map((template) => <option key={template.id} value={template.id}>{template.nombre}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Plantilla si no responde</span>
          <select className={inputClass} value={draft.plantillaSeguimientoId ?? ""} onChange={(event) => setDraft({ ...draft, plantillaSeguimientoId: event.target.value || undefined })}>
            <option value="">Sin seguimiento</option>
            {templateOptions
              .filter((template) => template.tipo === "plantilla_seguimiento" || template.id === draft.plantillaSeguimientoId)
              .map((template) => <option key={template.id} value={template.id}>{template.nombre}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Enviar seguimiento tras</span>
          <select className={inputClass} value={String(campaignFollowupHours(draft))} onChange={(event) => setDraft({ ...draft, diasParaSeguimiento: Number(event.target.value) })}>
            <option value="12">12 horas sin respuesta</option>
            <option value="24">24 horas sin respuesta</option>
            <option value="72">3 dias sin respuesta</option>
          </select>
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Asset a enviar tras SI</span>
          <select className={inputClass} value={draft.assetInfoId ?? ""} onChange={(event) => setDraft({ ...draft, assetInfoId: event.target.value || undefined })}>
            <option value="">No enviar asset</option>
            {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} ({asset.type})</option>)}
          </select>
        </label>
        <div className="md:col-span-2 rounded-lg border border-slate-200 p-4">
          <h4 className="font-bold text-slate-950">Mensajes 3 y 4 de la campaña</h4>
          <p className="mt-1 text-sm text-slate-500">Se preparan cuando marcas como enviado el mensaje anterior.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[3, 4].map((stepNumber) => {
              const step = postSiSteps.find((item) => item.step === stepNumber);
              return (
                <div key={stepNumber} className="rounded-md bg-slate-50 p-3">
                  <p className="mb-3 text-sm font-bold text-slate-950">Mensaje {stepNumber}</p>
                  <label>
                    <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Plantilla</span>
                    <select className={inputClass} value={step?.templateId ?? ""} onChange={(event) => updatePostSiStep(stepNumber as 3 | 4, { templateId: event.target.value || undefined })}>
                      <option value="">Sin plantilla</option>
                      {templateOptions.map((template) => <option key={template.id} value={template.id}>{template.nombre}</option>)}
                    </select>
                  </label>
                  <label className="mt-3 block">
                    <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Asset opcional</span>
                    <select className={inputClass} value={step?.assetId ?? ""} onChange={(event) => updatePostSiStep(stepNumber as 3 | 4, { assetId: event.target.value || undefined })}>
                      <option value="">Sin asset</option>
                      {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} ({asset.type})</option>)}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
        <Field label="Seguimientos maximos" type="number" value={String(draft.maxSeguimientos)} onChange={(value) => setDraft({ ...draft, maxSeguimientos: Number(value) || 0 })} />
        <label className="flex items-center gap-2.5 md:col-span-2 py-2 select-none">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-connessia-600 focus:ring-connessia-500"
            checked={draft.excluirContactados || false}
            onChange={(event) => setDraft({ ...draft, excluirContactados: event.target.checked })}
          />
          <span className="text-sm font-semibold text-slate-700">
            Excluir contactos ya contactados en otras campañas
          </span>
        </label>
        <label className="md:col-span-2">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Grupos de leads</span>
          <div className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
            {groups.map((group) => (
              <label key={group.id} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={draft.segmento.grupoIds.includes(group.id)} onChange={(event) => toggleGroup(group.id, event.target.checked)} />
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
                {group.nombre}
              </label>
            ))}
            {groups.length === 0 && <p className="text-sm text-slate-500">Crea grupos desde Leads para segmentar mejor.</p>}
          </div>
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => onSave({ ...draft, nombre: draft.nombre.trim() || "Campana sin nombre", updatedAt: new Date().toISOString() })}>Guardar campana</Button>
      </div>
    </Modal>
  );
}

function AssetFormModal({
  asset,
  firebaseConfig,
  onClose,
  onSave
}: {
  asset: CommercialAsset;
  firebaseConfig: Settings["firebaseConfig"];
  onClose: () => void;
  onSave: (asset: CommercialAsset) => void;
}) {
  const [draft, setDraft] = useState(asset);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function handleAssetFile(file: File) {
    setUploading(true);
    setUploadError("");
    try {
      const uploaded = await uploadCommercialAsset(file, firebaseConfig);
      setDraft((current) => ({
        ...current,
        name: current.name || uploaded.name,
        type: uploaded.type,
        url: uploaded.url,
        storagePath: uploaded.storagePath
      }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "No se pudo subir el archivo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal title="Asset comercial" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <label
          className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center transition hover:border-connessia-300 hover:bg-connessia-50 md:col-span-2"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void handleAssetFile(file);
          }}
        >
          <Upload className="mb-3 text-connessia-700" size={30} />
          <span className="font-bold text-slate-950">{uploading ? "Subiendo archivo..." : "Arrastra aqui el asset o haz clic para subirlo"}</span>
          <span className="mt-1 text-sm text-slate-500">Imagen, PDF o video. Se guarda en Firebase Storage.</span>
          <input className="hidden" type="file" accept="image/*,application/pdf,video/*" onChange={(event) => event.target.files?.[0] && void handleAssetFile(event.target.files[0])} />
        </label>
        {uploadError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800 md:col-span-2">{uploadError}</div>}
        {draft.url && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 md:col-span-2">
            Archivo listo: <strong>{draft.storagePath || draft.url}</strong>
          </div>
        )}
        <Field label="Nombre" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
        <label>
          <span className="mb-1 block text-sm font-semibold text-slate-700">Tipo</span>
          <select className={inputClass} value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as CommercialAsset["type"] })}>
            <option value="imagen">Imagen</option>
            <option value="pdf">PDF</option>
            <option value="video">Video</option>
          </select>
        </label>
        <Field label="URL publica generada" value={draft.url} onChange={(value) => setDraft({ ...draft, url: value })} />
        <Field label="Ruta interna o referencia" value={draft.storagePath} onChange={(value) => setDraft({ ...draft, storagePath: value })} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button disabled={uploading || !draft.url.trim()} onClick={() => onSave({ ...draft, name: draft.name.trim() || "Asset sin nombre", url: draft.url.trim(), storagePath: draft.storagePath.trim() })}>Guardar asset</Button>
      </div>
    </Modal>
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
            {users.filter(u => u.activo && (u.role === "admin" || u.role === "comercial")).map((user) => <option key={user.uid} value={user.uid}>{user.nombre}</option>)}
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
            {users.filter(u => u.activo && (u.role === "admin" || u.role === "comercial")).map((user) => <option key={user.uid} value={user.uid}>{user.nombre}</option>)}
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
  useEffect(() => {
    setDraft(settings);
  }, [settings]);
  const updateChannel = (key: keyof Settings["whatsappChannel"], value: string) =>
    setDraft((current) => ({ ...current, whatsappProvider: key === "provider" ? (value as ProviderName) : current.whatsappProvider, whatsappChannel: { ...current.whatsappChannel, [key]: value } }));
  const updateFirebase = (key: keyof Settings["firebaseConfig"], value: string) =>
    setDraft((current) => ({
      ...current,
      firebaseConfig: {
        ...current.firebaseConfig,
        [key]: value,
        updatedAt: new Date().toISOString()
      }
    }));
  const firebaseReady = Boolean(
    draft.firebaseConfig.apiKey &&
    draft.firebaseConfig.authDomain &&
    draft.firebaseConfig.projectId &&
    draft.firebaseConfig.storageBucket &&
    draft.firebaseConfig.messagingSenderId &&
    draft.firebaseConfig.appId
  );

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
      <Card className="p-5">
        <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
          <div>
            <h3 className="font-bold text-slate-950">Firebase para datos y assets</h3>
            <p className="text-sm text-slate-500">Configura Firestore y Storage para guardar leads y subir archivos desde el panel.</p>
          </div>
          <Badge value={firebaseReady ? "configurado" : "pendiente"} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="API key" value={draft.firebaseConfig.apiKey} onChange={(value) => updateFirebase("apiKey", value)} />
          <Field label="Auth domain" value={draft.firebaseConfig.authDomain} onChange={(value) => updateFirebase("authDomain", value)} />
          <Field label="Project ID" value={draft.firebaseConfig.projectId} onChange={(value) => updateFirebase("projectId", value)} />
          <Field label="Storage bucket" value={draft.firebaseConfig.storageBucket} onChange={(value) => updateFirebase("storageBucket", value)} />
          <Field label="Messaging sender ID" value={draft.firebaseConfig.messagingSenderId} onChange={(value) => updateFirebase("messagingSenderId", value)} />
          <Field label="App ID" value={draft.firebaseConfig.appId} onChange={(value) => updateFirebase("appId", value)} />
          <Field label="Measurement ID opcional" value={draft.firebaseConfig.measurementId ?? ""} onChange={(value) => updateFirebase("measurementId", value)} />
        </div>
        <div className="mt-5">
          <Button onClick={() => onSave(draft)}>Guardar Firebase</Button>
        </div>
      </Card>
    </div>
  );
}


function TutorialScreen() {
  const steps = [
    {
      title: "1. Importa o crea leads",
      text: "En Importar puedes subir un CSV. Asegúrate de que el teléfono tenga prefijo internacional, por ejemplo +34600111222."
    },
    {
      title: "2. Revisa consentimiento",
      text: "Cada lead debe tener consentimiento WhatsApp. Sin ese check, la campaña no lo encola."
    },
    {
      title: "3. Encola una campaña",
      text: "En Campañas marca el checklist legal y pulsa Validar y encolar campaña. La cola crea los mensajes preparados."
    },
    {
      title: "4. Envía con WhatsApp Web",
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

function UsersScreen({
  state,
  onSaveUser
}: {
  state: ReturnType<typeof useCrmStore>["state"];
  onSaveUser: (user: AppUser) => void;
}) {
  const [editing, setEditing] = useState<AppUser | null>(null);

  const handleNewUser = () => {
    setEditing({
      uid: `user-${crypto.randomUUID()}`,
      nombre: "",
      email: "",
      role: "comercial",
      activo: true,
      createdAt: new Date().toISOString()
    });
  };

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Gestión de Usuarios"
        subtitle="Administra los comerciales y administradores con acceso a la plataforma."
        action={
          <Button icon={<Plus size={18} />} onClick={handleNewUser}>
            Nuevo Usuario
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Fecha de registro</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.users.map((user) => (
                <tr key={user.uid} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{user.nombre}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        user.role === "admin"
                          ? "bg-connessia-50 text-connessia-800 border border-connessia-200"
                          : "bg-slate-50 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {user.role === "admin" ? "Admin" : "Comercial"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        user.activo
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-coral-50 text-coral-800 border border-coral-200"
                      }`}
                    >
                      {user.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {user.createdAt ? formatDate(user.createdAt.slice(0, 10)) : "Sin fecha"}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="secondary"
                      icon={<Edit3 size={16} />}
                      onClick={() => setEditing(user)}
                    >
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
              {state.users.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-slate-500 text-center" colSpan={6}>
                    No hay usuarios registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <UserFormModal
          user={editing}
          onClose={() => setEditing(null)}
          onSave={(updatedUser) => {
            onSaveUser(updatedUser);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function UserFormModal({
  user,
  onClose,
  onSave
}: {
  user: AppUser;
  onClose: () => void;
  onSave: (user: AppUser) => void;
}) {
  const [draft, setDraft] = useState<AppUser>({ ...user });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.nombre.trim() || !draft.email.trim()) {
      alert("Por favor rellena el nombre y email del usuario.");
      return;
    }
    onSave(draft);
  };

  return (
    <Modal title={user.uid.startsWith("user-") && !user.email ? "Nuevo Usuario" : "Editar Usuario"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre</label>
          <input
            className={inputClass}
            value={draft.nombre}
            onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
            placeholder="Nombre del comercial"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
          <input
            type="email"
            className={inputClass}
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value.trim().toLowerCase() })}
            placeholder="comercial@correo.com"
            required
            disabled={user.email ? true : false}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Rol</label>
          <select
            className={inputClass}
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value as any })}
          >
            <option value="admin">Administrador</option>
            <option value="comercial">Comercial</option>
          </select>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="userActiveCheckbox"
            className="h-5 w-5 rounded border-slate-300 text-connessia-600 focus:ring-connessia-500 cursor-pointer"
            checked={draft.activo}
            onChange={(e) => setDraft({ ...draft, activo: e.target.checked })}
          />
          <label
            htmlFor="userActiveCheckbox"
            className="text-sm font-semibold text-slate-700 cursor-pointer select-none"
          >
            Usuario Activo
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button type="submit">
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AuditScreen({ state }: { state: ReturnType<typeof useCrmStore>["state"] }) {
  const entries = [
    ...state.messages.map((message) => {
      const lead = state.leads.find((item) => item.id === message.leadId);
      const campaign = state.campaigns.find((item) => item.id === message.campaignId);
      return {
        id: message.id,
        at: message.createdAt,
        title: message.direction === "inbound" ? "Respuesta recibida" : "Mensaje enviado",
        who: lead?.nombreNegocio ?? "Lead eliminado",
        detail: `${campaign?.nombre ?? "Sin campana"} · ${message.body.slice(0, 120)}`,
        status: message.status
      };
    }),
    ...state.queue.map((item) => {
      const lead = state.leads.find((lead) => lead.id === item.leadId);
      const campaign = state.campaigns.find((campaign) => campaign.id === item.campaignId);
      return {
        id: item.id,
        at: item.scheduledAt,
        title: item.status === "pending" ? "Mensaje pendiente" : item.status === "processing" ? "Chat abierto" : item.status === "sent" ? "Envio confirmado" : "Envio a revisar",
        who: lead?.nombreNegocio ?? item.phone,
        detail: `${campaign?.nombre ?? "Sin campana"} · ${item.errorMessage || item.body.slice(0, 120)}`,
        status: item.status
      };
    }),
    ...state.tasks.map((task) => {
      const lead = state.leads.find((lead) => lead.id === task.leadId);
      return {
        id: task.id,
        at: task.createdAt,
        title: "Tarea creada",
        who: lead?.nombreNegocio ?? "Sin lead",
        detail: `${task.title} · vence ${formatDate(task.dueDate)} · prioridad ${task.priority}`,
        status: task.status
      };
    })
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-5">
      <ScreenHeader title="Auditoria" subtitle="Linea temporal clara de mensajes, respuestas, cola y tareas." />
      <Card className="divide-y divide-slate-100">
        {entries.slice(0, 40).map((entry) => (
          <div key={entry.id} className="grid gap-3 p-4 text-sm md:grid-cols-[150px_1fr_auto] md:items-start">
            <div className="font-semibold text-slate-500">{formatDateTime(entry.at)}</div>
            <div>
              <p className="font-bold text-slate-950">{entry.title} · {entry.who}</p>
              <p className="mt-1 text-slate-600">{entry.detail}</p>
            </div>
            <Badge value={entry.status} />
          </div>
        ))}
        {entries.length === 0 && <p className="p-4 text-sm text-slate-500">Todavia no hay actividad.</p>}
      </Card>
    </div>
  );
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

function getLeadStateLabel(lead: Lead) {
  if (lead.estado === "dudoso" || lead.contactadoResultado === "dudoso_comercial") return "Dudoso";
  if (lead.contactadoResultado === "interesado_comercial") return "Interesado";
  if (lead.contactadoResultado === "no_interesa") return "No interesa";
  if (lead.estado === "campaña_enviada") return "En campaña";
  if (lead.estado === "sin_respuesta") return "Sin respuesta";
  if (lead.estado === "interesado") return "Interesado";
  if (lead.estado === "no_interesado") return "No interesa";
  return String(lead.estado).replaceAll("_", " ");
}

function getLeadStateValue(lead: Lead) {
  if (lead.estado === "dudoso" || lead.contactadoResultado === "dudoso_comercial") return "dudoso";
  if (lead.contactadoResultado === "interesado_comercial") return "interesado";
  if (lead.contactadoResultado === "no_interesa") return "no_interesa";
  if (lead.estado === "campaña_enviada") return "campaña_enviada";
  if (lead.estado === "sin_respuesta") return "sin_respuesta";
  if (lead.estado === "interesado") return "interesado";
  if (lead.estado === "no_interesado") return "no_interesa";
  return lead.estado;
}

function MultiSelectDropdown({
  label,
  options,
  selectedValues,
  onChange
}: {
  label: string;
  options: { value: string; label: string }[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleValue = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter((v) => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${inputClass} flex items-center justify-between gap-2 bg-white`}
      >
        <span className="truncate">
          {selectedValues.length === 0
            ? label
            : `${label} (${selectedValues.length})`}
        </span>
        <ChevronDown size={16} className="text-slate-500 shrink-0" />
      </button>
      {isOpen && (
        <div className="absolute right-0 left-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          {options.map((opt) => {
            const isChecked = selectedValues.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-connessia-600 focus:ring-connessia-500"
                  checked={isChecked}
                  onChange={() => toggleValue(opt.value)}
                />
                <span className="ml-2 font-medium text-slate-700">{opt.label}</span>
              </label>
            );
          })}
          {selectedValues.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2 text-right">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-bold text-coral-600 hover:text-coral-800"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface InProgressLeadEditSheetProps {
  lead: Lead;
  users: AppUser[];
  observations: LeadObservation[];
  messages: Message[];
  onSaveLead: (lead: Lead) => void;
  onSaveObservation: (obs: LeadObservation) => void;
  onScheduleDemo: () => void;
  onClose: () => void;
}

function InProgressLeadEditSheet({
  lead,
  users,
  observations,
  messages,
  onSaveLead,
  onSaveObservation,
  onScheduleDemo,
  onClose
}: InProgressLeadEditSheetProps) {
  const [editForm, setEditForm] = useState<Lead>({ ...lead });
  const [newObs, setNewObs] = useState("");
  const [viewingObs, setViewingObs] = useState<LeadObservation | null>(null);
  const [showChatModal, setShowChatModal] = useState(false);

  const leadMessages = useMemo(() => {
    return messages
      .filter((msg) => msg.leadId === lead.id && msg.kind !== "internal_note")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [messages, lead.id]);

  const leadObservations = observations
    .filter((o) => o.leadId === lead.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const handleSaveLead = () => {
    onSaveLead({
      ...editForm,
      ultimoContacto: new Date().toISOString()
    });
    onClose();
  };

  const handleSaveObservation = () => {
    if (!newObs.trim()) return;
    const observation: LeadObservation = {
      id: crypto.randomUUID(),
      leadId: lead.id,
      texto: newObs.trim(),
      createdAt: new Date().toISOString()
    };
    onSaveObservation(observation);
    setNewObs("");
  };

  const handleScheduleDemo = () => {
    onSaveLead({
      ...editForm,
      ultimoContacto: new Date().toISOString()
    });
    onScheduleDemo();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="flex h-[90vh] w-full max-w-6xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Editar Ficha Comercial: {lead.nombreNegocio}</h2>
            <p className="text-xs text-slate-500">ID del Lead: {lead.id}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 border-b border-slate-100 pb-1">Datos de la Ficha</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Nombre Negocio</label>
                <input
                  className={inputClass}
                  value={editForm.nombreNegocio}
                  onChange={(e) => setEditForm({ ...editForm, nombreNegocio: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Persona Contacto</label>
                <input
                  className={inputClass}
                  value={editForm.personaContacto}
                  onChange={(e) => setEditForm({ ...editForm, personaContacto: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Teléfono</label>
                <input
                  className={inputClass}
                  value={editForm.telefono}
                  onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email</label>
                <input
                  className={inputClass}
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">CIF</label>
                <input
                  className={inputClass}
                  placeholder="Introducir CIF..."
                  value={editForm.cif || ""}
                  onChange={(e) => setEditForm({ ...editForm, cif: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Dirección</label>
                <input
                  className={inputClass}
                  value={editForm.direccion}
                  onChange={(e) => setEditForm({ ...editForm, direccion: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Código Postal</label>
                <input
                  className={inputClass}
                  placeholder="Código postal..."
                  value={editForm.codigoPostal || ""}
                  onChange={(e) => setEditForm({ ...editForm, codigoPostal: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Ciudad</label>
                <input
                  className={inputClass}
                  value={editForm.ciudad}
                  onChange={(e) => setEditForm({ ...editForm, ciudad: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Zona</label>
                <input
                  className={inputClass}
                  value={editForm.zona}
                  onChange={(e) => setEditForm({ ...editForm, zona: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Sector</label>
                <input
                  className={inputClass}
                  value={editForm.sector}
                  onChange={(e) => setEditForm({ ...editForm, sector: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Sitio Web</label>
                <input
                  className={inputClass}
                  value={editForm.web}
                  onChange={(e) => setEditForm({ ...editForm, web: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Comercial Asignado</label>
                <select
                  className={inputClass}
                  value={editForm.comercialAsignado || ""}
                  onChange={(e) => setEditForm({ ...editForm, comercialAsignado: e.target.value })}
                >
                  <option value="">Sin asignar</option>
                  {users
                    .filter((u) => u.activo && (u.role === "admin" || u.role === "comercial"))
                    .map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.nombre}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Estado</label>
                <select
                  className={inputClass}
                  value={getLeadStateValue(editForm) ?? "nuevo"}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "dudoso") {
                      setEditForm({
                        ...editForm,
                        estado: "dudoso",
                        contactadoResultado: "dudoso_comercial"
                      });
                    } else if (val === "interesado") {
                      setEditForm({
                        ...editForm,
                        estado: "interesado",
                        contactadoResultado: "interesado_comercial"
                      });
                    } else if (val === "no_interesa") {
                      setEditForm({
                        ...editForm,
                        estado: "no_interesado",
                        contactadoResultado: "no_interesa"
                      });
                    } else if (val === "campaña_enviada") {
                      setEditForm({
                        ...editForm,
                        estado: "campaña_enviada",
                        contactadoResultado: undefined
                      });
                    } else if (val === "sin_respuesta") {
                      setEditForm({
                        ...editForm,
                        estado: "sin_respuesta",
                        contactadoResultado: undefined
                      });
                    } else {
                      setEditForm({
                        ...editForm,
                        estado: val as any,
                        contactadoResultado: undefined
                      });
                    }
                  }}
                >
                  <option value="nuevo">Nuevo</option>
                  <option value="pendiente_consentimiento">Pendiente consentimiento</option>
                  <option value="consentimiento_obtenido">Consentimiento obtenido</option>
                  <option value="campaña_enviada">En campaña</option>
                  <option value="sin_respuesta">Sin respuesta</option>
                  <option value="interesado">Interesado</option>
                  <option value="dudoso">Dudoso</option>
                  <option value="no_interesa">No interesa</option>
                  <option value="demo_agendada">Demo agendada</option>
                  <option value="convertido">Convertido</option>
                  <option value="baja">Baja</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Seguimiento</label>
                <select
                  className={inputClass}
                  value={editForm.seguimiento || "pendiente"}
                  onChange={(e) => setEditForm({ ...editForm, seguimiento: e.target.value as any })}
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="en_curso">En curso</option>
                  <option value="finalizado">Finalizado</option>
                  <option value="no_contesta">No contesta</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="sheetConsentCheckbox"
                  className="h-5 w-5 rounded border-slate-300 text-connessia-600 focus:ring-connessia-500 cursor-pointer"
                  checked={editForm.tieneConsentimientoWhatsapp}
                  onChange={(e) => setEditForm({ ...editForm, tieneConsentimientoWhatsapp: e.target.checked })}
                />
                <label htmlFor="sheetConsentCheckbox" className="text-sm font-semibold text-slate-700 cursor-pointer select-none">
                  Consentimiento de WhatsApp
                </label>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Notas Generales</label>
              <textarea
                className={`${inputClass} h-20 resize-none`}
                placeholder="Añadir notas sobre este lead..."
                value={editForm.notas || ""}
                onChange={(e) => setEditForm({ ...editForm, notas: e.target.value })}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 border-b border-slate-100 pb-1">Historial de Observaciones</h3>
            <div className="space-y-4">
              <div className="flex gap-3">
                <textarea
                  className={`${inputClass} h-16 resize-none flex-1`}
                  placeholder="Escribir una nueva observación comercial..."
                  value={newObs}
                  onChange={(e) => setNewObs(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleSaveObservation}
                  className="rounded-lg bg-connessia-600 px-5 text-sm font-bold text-white hover:bg-connessia-700 active:scale-95 transition focus:outline-none shrink-0"
                >
                  Guardar Observación
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-2 font-bold w-1/4">Fecha</th>
                      <th className="px-4 py-2 font-bold w-3/4">Detalle de la Observación (Pinchar para ver completa)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leadObservations.map((obs) => (
                      <tr key={obs.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-2 text-xs font-semibold text-slate-500 whitespace-nowrap">
                          {formatDateTime(obs.createdAt)}
                        </td>
                        <td className="px-4 py-2">
                          <p
                            onClick={() => setViewingObs(obs)}
                            className="max-w-xl truncate text-slate-700 font-medium cursor-pointer hover:text-connessia-700 transition"
                            title="Haz clic para ver la observación completa"
                          >
                            {obs.texto}
                          </p>
                        </td>
                      </tr>
                    ))}
                    {leadObservations.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-slate-400 font-medium">
                          No hay observaciones registradas para este lead.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleScheduleDemo}
              className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100 transition"
            >
              <CalendarClock size={16} />
              Agendar Demo
            </button>
            <button
              type="button"
              onClick={() => setShowChatModal(true)}
              className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 transition"
            >
              <MessageCircle size={16} />
              Mostrar WhatsApps enviados
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveLead}
              className="rounded-lg bg-connessia-600 px-5 py-2 text-sm font-bold text-white hover:bg-connessia-700 transition"
            >
              Guardar y Cerrar
            </button>
          </div>
        </div>
      </div>

      {showChatModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4 animate-fade-in">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl animate-scale-up border border-slate-100 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 shrink-0">
              <div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <MessageCircle size={18} className="text-emerald-600" />
                  Historial de WhatsApp: {lead.nombreNegocio}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">Mensajes de campaña y respuestas registradas</p>
              </div>
              <button
                onClick={() => setShowChatModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-100 min-h-[300px]">
              {leadMessages.map((msg) => {
                const isInbound = msg.direction === "inbound";
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isInbound ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 text-sm shadow-sm ${
                        isInbound
                          ? "bg-white text-slate-800 border border-slate-200/60 rounded-tl-none font-medium"
                          : "bg-emerald-600 text-white rounded-tr-none font-medium"
                      }`}
                    >
                      <div className="whitespace-pre-wrap leading-relaxed">{msg.body}</div>
                      <div
                        className={`text-[10px] mt-1.5 text-right ${
                          isInbound ? "text-slate-400" : "text-emerald-100"
                        }`}
                      >
                        {formatDateTime(msg.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
              {leadMessages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                  <MessageCircle size={40} className="opacity-20 mb-2" />
                  <p className="text-sm font-semibold">No se han registrado mensajes para este lead.</p>
                  <p className="text-xs text-slate-400">Los envíos de campaña aparecerán aquí una vez procesados.</p>
                </div>
              )}
            </div>

            <div className="mt-5 text-right shrink-0 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowChatModal(false)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-900 transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingObs && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl animate-scale-up border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Observación Registrada ({formatDateTime(viewingObs.createdAt)})
              </h4>
              <button
                onClick={() => setViewingObs(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm text-slate-700 leading-relaxed font-medium bg-slate-50 p-4 rounded-lg border border-slate-100">
              {viewingObs.texto}
            </div>
            <div className="mt-5 text-right">
              <button
                type="button"
                onClick={() => setViewingObs(null)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-900 transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InProgressLeadsScreen({
  state,
  onSave,
  onSaveObservation,
  onScheduleDemo,
  query,
  setQuery,
  sortKey,
  setSortKey,
  sortDir,
  setSortDir,
  selectedStates,
  setSelectedStates,
  selectedSeguimientos,
  setSelectedSeguimientos,
  selectedSectores,
  setSelectedSectores,
  selectedComerciales,
  setSelectedComerciales
}: {
  state: ReturnType<typeof useCrmStore>["state"];
  onSave: (lead: Lead) => void;
  onSaveObservation: (obs: LeadObservation) => void;
  onScheduleDemo: (lead: Lead) => void;
  query: string;
  setQuery: (val: string) => void;
  sortKey: string;
  setSortKey: (val: string) => void;
  sortDir: "asc" | "desc";
  setSortDir: (val: "asc" | "desc") => void;
  selectedStates: string[];
  setSelectedStates: (val: string[]) => void;
  selectedSeguimientos: string[];
  setSelectedSeguimientos: (val: string[]) => void;
  selectedSectores: string[];
  setSelectedSectores: (val: string[]) => void;
  selectedComerciales: string[];
  setSelectedComerciales: (val: string[]) => void;
}) {
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  const inProgressLeads = state.leads.filter((lead) => {
    const inActiveCampaign = lead.estado === "campaña_enviada" || lead.estado === "sin_respuesta";
    const isDudoso = lead.contactadoResultado === "dudoso_comercial" || lead.estado === "dudoso";
    const isInteresado = lead.contactadoResultado === "interesado_comercial" || lead.estado === "interesado";
    const isNoInteresa = lead.contactadoResultado === "no_interesa" || lead.estado === "no_interesado";
    return (inActiveCampaign || isDudoso || isInteresado || isNoInteresa) && 
      !lead.contactadoCerradoAt && 
      lead.estado !== "demo_agendada" &&
      lead.seguimiento !== "finalizado";
  });

  const uniqueSectores = useMemo(() => {
    const sectors = state.leads.map((l) => l.sector).filter(Boolean);
    return Array.from(new Set(sectors)).sort();
  }, [state.leads]);

  const sectorOptions = (uniqueSectores as string[]).map((sec: string) => ({ value: sec, label: sec }));

  const commercialOptions = useMemo(() => {
    const list = [
      { value: "sin_asignar", label: "Sin asignar" }
    ];
    const assignedUids = Array.from(new Set(inProgressLeads.map((l) => l.comercialAsignado).filter(Boolean)));
    const userList = assignedUids.map((uid) => {
      const user = state.users.find((u) => u.uid === uid);
      return {
        value: uid,
        label: user ? user.nombre : uid
      };
    });
    state.users
      .filter((u) => u.activo && (u.role === "admin" || u.role === "comercial"))
      .forEach((u) => {
        if (!userList.some((item) => item.value === u.uid)) {
          userList.push({ value: u.uid, label: u.nombre });
        }
      });
    userList.sort((a, b) => a.label.localeCompare(b.label));
    return [...list, ...userList];
  }, [inProgressLeads, state.users]);

  const filtered = inProgressLeads.filter((lead) => {
    const text = `${lead.nombreNegocio} ${lead.telefono} ${lead.ciudad} ${lead.zona} ${lead.sector || ""}`.toLowerCase();
    const matchesQuery = text.includes(query.toLowerCase());

    const stateValue = getLeadStateValue(lead);
    const matchesState = selectedStates.length === 0 || selectedStates.includes(stateValue);

    const segValue = lead.seguimiento ?? "pendiente";
    const matchesSeguimiento = selectedSeguimientos.length === 0 || selectedSeguimientos.includes(segValue);

    const matchesSector = selectedSectores.length === 0 || (lead.sector && selectedSectores.includes(lead.sector));

    const matchesComercial = selectedComerciales.length === 0 ||
      (selectedComerciales.includes("sin_asignar") && !lead.comercialAsignado) ||
      (lead.comercialAsignado && selectedComerciales.includes(lead.comercialAsignado));

    return matchesQuery && matchesState && matchesSeguimiento && matchesSector && matchesComercial;
  });

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = [...filtered].sort((a, b) => {
    let valA: any = "";
    let valB: any = "";

    switch (sortKey) {
      case "nombre":
        valA = a.nombreNegocio;
        valB = b.nombreNegocio;
        break;
      case "telefono":
        valA = a.telefono;
        valB = b.telefono;
        break;
      case "ciudad":
        valA = a.ciudad;
        valB = b.ciudad;
        break;
      case "zona":
        valA = a.zona;
        valB = b.zona;
        break;
      case "estado":
        valA = getLeadStateLabel(a);
        valB = getLeadStateLabel(b);
        break;
      case "seguimiento":
        valA = a.seguimiento ?? "pendiente";
        valB = b.seguimiento ?? "pendiente";
        break;
      case "ultimoContacto":
        valA = a.ultimoContacto || "";
        valB = b.ultimoContacto || "";
        break;
      case "sector":
        valA = a.sector || "";
        valB = b.sector || "";
        break;
      case "comercial":
        valA = state.users.find((u) => u.uid === a.comercialAsignado)?.nombre ?? (a.comercialAsignado || "");
        valB = state.users.find((u) => u.uid === b.comercialAsignado)?.nombre ?? (b.comercialAsignado || "");
        break;
      default:
        return 0;
    }

    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();

    if (valA < valB) return sortDir === "asc" ? -1 : 1;
    if (valA > valB) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const stateOptions = [
    { value: "interesado", label: "Interesado" },
    { value: "dudoso", label: "Dudoso" },
    { value: "no_interesa", label: "No interesa" },
    { value: "campaña_enviada", label: "En campaña" },
    { value: "sin_respuesta", label: "Sin respuesta" }
  ];

  const segOptions = [
    { value: "pendiente", label: "Pendiente" },
    { value: "en_curso", label: "En curso" },
    { value: "finalizado", label: "Finalizado" },
    { value: "no_contesta", label: "No contesta" }
  ];

  const getSortIcon = (key: string) => {
    if (sortKey !== key) return <ArrowUpDown size={14} className="text-slate-400" />;
    return sortDir === "asc" 
      ? <ArrowUp size={14} className="text-connessia-700" />
      : <ArrowDown size={14} className="text-connessia-700" />;
  };

  const getSeguimientoColor = (val: string) => {
    if (val === "en_curso") return "bg-blue-50 text-blue-800 border-blue-200";
    if (val === "finalizado") return "bg-emerald-50 text-emerald-800 border-emerald-200";
    if (val === "no_contesta") return "bg-amber-50 text-amber-800 border-amber-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  const getEstadoBadgeColor = (lead: Lead) => {
    const val = getLeadStateValue(lead);
    if (val === "interesado") return "bg-emerald-50 text-emerald-800 border-emerald-200";
    if (val === "dudoso") return "bg-amber-50 text-amber-800 border-amber-200";
    if (val === "no_interesa") return "bg-red-50 text-red-800 border-red-200";
    if (val === "campaña_enviada") return "bg-blue-50 text-blue-800 border-blue-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  return (
    <div className="space-y-5">
      <ScreenHeader
        title="Leads en curso"
        subtitle="Bandeja de leads activos en prospección, campañas y clasificaciones comerciales."
      />
      <Card className="p-4">
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3 xl:grid-cols-7">
          <label className="relative col-span-1 md:col-span-2">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input
              className={`${inputClass} pl-10`}
              placeholder="Buscar por negocio, teléfono, ciudad o zona..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <MultiSelectDropdown
            label="Filtrar Estados"
            options={stateOptions}
            selectedValues={selectedStates}
            onChange={setSelectedStates}
          />
          <MultiSelectDropdown
            label="Filtrar Seguimiento"
            options={segOptions}
            selectedValues={selectedSeguimientos}
            onChange={setSelectedSeguimientos}
          />
          <MultiSelectDropdown
            label="Filtrar Sectores"
            options={sectorOptions}
            selectedValues={selectedSectores}
            onChange={setSelectedSectores}
          />
          <MultiSelectDropdown
            label="Filtrar Comerciales"
            options={commercialOptions}
            selectedValues={selectedComerciales}
            onChange={setSelectedComerciales}
          />
          <div className="flex items-center justify-end col-span-1">
            <span className="text-xs font-semibold text-slate-400">
              {filtered.length} lead(s) en curso encontrados
            </span>
          </div>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3.5 font-bold">Acción</th>
                <th className="px-4 py-3.5 font-bold cursor-pointer hover:bg-slate-100 hover:text-slate-900" onClick={() => handleSort("nombre")}>
                  <div className="flex items-center gap-1.5">
                    Negocio {getSortIcon("nombre")}
                  </div>
                </th>
                <th className="px-4 py-3.5 font-bold cursor-pointer hover:bg-slate-100 hover:text-slate-900" onClick={() => handleSort("telefono")}>
                  <div className="flex items-center gap-1.5">
                    Teléfono {getSortIcon("telefono")}
                  </div>
                </th>
                <th className="px-4 py-3.5 font-bold cursor-pointer hover:bg-slate-100 hover:text-slate-900" onClick={() => handleSort("ciudad")}>
                  <div className="flex items-center gap-1.5">
                    Ciudad {getSortIcon("ciudad")}
                  </div>
                </th>
                <th className="px-4 py-3.5 font-bold cursor-pointer hover:bg-slate-100 hover:text-slate-900" onClick={() => handleSort("zona")}>
                  <div className="flex items-center gap-1.5">
                    Zona {getSortIcon("zona")}
                  </div>
                </th>
                <th className="px-4 py-3.5 font-bold cursor-pointer hover:bg-slate-100 hover:text-slate-900" onClick={() => handleSort("sector")}>
                  <div className="flex items-center gap-1.5">
                    Sector {getSortIcon("sector")}
                  </div>
                </th>
                <th className="px-4 py-3.5 font-bold cursor-pointer hover:bg-slate-100 hover:text-slate-900" onClick={() => handleSort("comercial")}>
                  <div className="flex items-center gap-1.5">
                    Comercial {getSortIcon("comercial")}
                  </div>
                </th>
                <th className="px-4 py-3.5 font-bold cursor-pointer hover:bg-slate-100 hover:text-slate-900" onClick={() => handleSort("ultimoContacto")}>
                  <div className="flex items-center gap-1.5">
                    Último Contacto {getSortIcon("ultimoContacto")}
                  </div>
                </th>
                <th className="px-4 py-3.5 font-bold cursor-pointer hover:bg-slate-100 hover:text-slate-900" onClick={() => handleSort("estado")}>
                  <div className="flex items-center gap-1.5">
                    Estado {getSortIcon("estado")}
                  </div>
                </th>
                <th className="px-4 py-3.5 font-bold cursor-pointer hover:bg-slate-100 hover:text-slate-900" onClick={() => handleSort("seguimiento")}>
                  <div className="flex items-center gap-1.5">
                    Seguimiento {getSortIcon("seguimiento")}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-3">
                    <button
                      className="rounded-md border border-slate-200 bg-white p-2 text-slate-500 hover:border-connessia-200 hover:bg-connessia-50 hover:text-connessia-700"
                      onClick={() => setEditingLead(lead)}
                      title="Ver ficha / Abrir chat"
                    >
                      <Edit3 size={15} />
                    </button>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{lead.nombreNegocio}</td>
                  <td className="px-4 py-3 font-medium text-slate-600">{lead.telefono}</td>
                  <td className="px-4 py-3 text-slate-600">{lead.ciudad}</td>
                  <td className="px-4 py-3 text-slate-600">{lead.zona}</td>
                  <td className="px-4 py-3 text-slate-600">{lead.sector}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {state.users.find((user) => user.uid === lead.comercialAsignado)?.nombre ?? (lead.comercialAsignado || "Sin asignar")}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-500 whitespace-nowrap">
                    {lead.ultimoContacto ? formatDateTime(lead.ultimoContacto) : "Sin contacto"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getEstadoBadgeColor(lead)}`}>
                      {getLeadStateLabel(lead)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold outline-none focus:ring-1 focus:ring-connessia-100 cursor-pointer ${getSeguimientoColor(lead.seguimiento ?? "pendiente")}`}
                      value={lead.seguimiento ?? "pendiente"}
                      onChange={(event) => {
                        onSave({
                          ...lead,
                          seguimiento: event.target.value as any,
                          updatedAt: new Date().toISOString()
                        });
                      }}
                    >
                      <option value="pendiente" className="bg-white text-slate-700">Pendiente</option>
                      <option value="en_curso" className="bg-white text-blue-800">En curso</option>
                      <option value="finalizado" className="bg-white text-emerald-800">Finalizado</option>
                      <option value="no_contesta" className="bg-white text-amber-800">No contesta</option>
                    </select>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-8 text-center text-sm text-slate-500">
                    No se encontraron leads en curso que coincidan con los criterios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editingLead && (
        <InProgressLeadEditSheet
          lead={editingLead}
          users={state.users}
          observations={state.observations}
          messages={state.messages}
          onSaveLead={(updatedLead) => {
            onSave(updatedLead);
            setEditingLead(null);
          }}
          onSaveObservation={onSaveObservation}
          onScheduleDemo={() => onScheduleDemo(editingLead)}
          onClose={() => setEditingLead(null)}
        />
      )}
    </div>
  );
}
