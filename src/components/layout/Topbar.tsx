import { LogOut, Menu, ShieldCheck, UserCircle } from "lucide-react";
import type { AppUser } from "../../types/domain";
import { Button } from "../ui/Button";
import { auth } from "../../services/firebase";

export function Topbar({
  user,
  onChangeUser,
  onMenu
}: {
  user: AppUser;
  onChangeUser: () => void;
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
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={onChangeUser}
          >
            <UserCircle size={18} />
            <span>
              <span className="block leading-4">{user.nombre}</span>
              <span className="block text-xs font-medium text-slate-500">{user.role}</span>
            </span>
          </button>
          <Button 
            variant="secondary" 
            className="px-3" 
            onClick={() => auth.signOut()}
            title="Cerrar Sesión"
          >
            <LogOut size={18} />
          </Button>
        </div>
        </div>
      </div>
    </header>
  );
}
