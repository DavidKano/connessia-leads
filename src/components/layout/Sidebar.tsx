import {
  ArchiveX,
  BarChart3,
  Bot,
  CalendarClock,
  ClipboardList,
  FileText,
  Gauge,
  History,
  Import,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Users
} from "lucide-react";
import { clsx } from "clsx";

export const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "leads", label: "Leads", icon: Users },
  { id: "importar", label: "Importar", icon: Import },
  { id: "campanas", label: "Campañas", icon: MessageSquareText },
  { id: "plantillas", label: "Plantillas", icon: FileText },
  { id: "assets", label: "Assets", icon: ArchiveX },
  { id: "tareas", label: "Tareas", icon: ClipboardList },
  { id: "demos", label: "Demos", icon: CalendarClock },
  { id: "metricas", label: "Métricas", icon: BarChart3 },
  { id: "whatsapp", label: "Canal WhatsApp", icon: Settings },
  { id: "exclusion", label: "Exclusión", icon: ShieldCheck },
  { id: "auditoria", label: "Auditoría", icon: History },
  { id: "simulador", label: "Simulador", icon: Bot }
] as const;

export type PageId = (typeof navItems)[number]["id"];

export function Sidebar({ page, setPage }: { page: PageId; setPage: (page: PageId) => void }) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white px-4 py-5 lg:block">
      <div className="mb-7 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-connessia-700 text-lg font-black text-white">
          C
        </div>
        <div>
          <p className="font-bold text-slate-950">Connessia Leads</p>
          <p className="text-xs font-medium text-slate-500">CRM WhatsApp compliant</p>
        </div>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={clsx(
                "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold transition",
                page === item.id
                  ? "bg-connessia-50 text-connessia-800"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              )}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-6 rounded-lg border border-connessia-200 bg-connessia-50 p-3 text-sm text-connessia-900">
        Solo WhatsApp Business Platform o proveedor oficial. El modo actual es simulación local.
      </div>
    </aside>
  );
}
