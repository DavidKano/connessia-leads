import { clsx } from "clsx";
import type { LeadStatus, TemplateStatus } from "../../types/domain";

const statusColors: Record<string, string> = {
  nuevo: "bg-slate-100 text-slate-700",
  pendiente_consentimiento: "bg-amber-100 text-amber-800",
  consentimiento_obtenido: "bg-emerald-100 text-emerald-800",
  campaña_enviada: "bg-blue-100 text-blue-800",
  interesado: "bg-connessia-100 text-connessia-800",
  no_interesado: "bg-slate-200 text-slate-700",
  demo_agendada: "bg-violet-100 text-violet-800",
  convertido: "bg-green-100 text-green-800",
  baja: "bg-red-100 text-red-800",
  bloqueado: "bg-red-100 text-red-800",
  error_envio: "bg-red-100 text-red-800",
  respuesta_ambigua: "bg-orange-100 text-orange-800",
  sin_respuesta: "bg-slate-100 text-slate-700",
  aprobada: "bg-emerald-100 text-emerald-800",
  borrador: "bg-slate-100 text-slate-700",
  enviada_a_revision: "bg-blue-100 text-blue-800",
  rechazada: "bg-red-100 text-red-800",
  pausada: "bg-amber-100 text-amber-800",
  "pendiente envio": "bg-slate-100 text-slate-700",
  "chat abierto": "bg-blue-100 text-blue-800",
  "esperando respuesta": "bg-amber-100 text-amber-800",
  "respondio SI": "bg-emerald-100 text-emerald-800",
  "respondio NO": "bg-red-100 text-red-800",
  respondido: "bg-connessia-100 text-connessia-800",
  revisar: "bg-orange-100 text-orange-800",
  "sin preparar": "bg-slate-100 text-slate-700",
  pending: "bg-slate-100 text-slate-700",
  processing: "bg-blue-100 text-blue-800",
  sent: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-slate-200 text-slate-700",
  received: "bg-connessia-100 text-connessia-800"
};

export function Badge({ value }: { value: LeadStatus | TemplateStatus | string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        statusColors[value] ?? "bg-slate-100 text-slate-700"
      )}
    >
      {String(value).replaceAll("_", " ")}
    </span>
  );
}
