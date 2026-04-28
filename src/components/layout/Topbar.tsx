import { Menu, ShieldCheck } from "lucide-react";
import type { AppUser, UserRole } from "../../types/domain";
import { Button } from "../ui/Button";

export function Topbar({
  user,
  onRoleChange,
  onMenu
}: {
  user: AppUser;
  onRoleChange: (role: UserRole) => void;
  onMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="px-2 lg:hidden" onClick={onMenu} aria-label="Abrir menú">
            <Menu size={20} />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-950">Connessia Leads</h1>
            <p className="text-sm text-slate-500">Panel comercial, consentimiento y automatización SI/NO</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 md:flex">
            <ShieldCheck size={16} />
            RGPD listo
          </div>
          <select
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            value={user.role}
            onChange={(event) => onRoleChange(event.target.value as UserRole)}
          >
            <option value="admin">Admin demo</option>
            <option value="comercial">Comercial demo</option>
            <option value="visor">Visor demo</option>
          </select>
        </div>
      </div>
    </header>
  );
}
