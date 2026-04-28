import type { ReactNode } from "react";
import { Card } from "./Card";

export function StatCard({
  label,
  value,
  icon,
  tone = "teal"
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: "teal" | "coral" | "blue" | "slate";
}) {
  const tones = {
    teal: "bg-connessia-100 text-connessia-800",
    coral: "bg-coral-100 text-coral-700",
    blue: "bg-blue-100 text-blue-800",
    slate: "bg-slate-100 text-slate-700"
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-md ${tones[tone]}`}>{icon}</div>
      </div>
    </Card>
  );
}
