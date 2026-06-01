"use client";

import { trpc } from "@/trpc/react";
import { useState } from "react";

// ─── Configuración visual ─────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  NEW:"Nuevo", ASSIGNED:"Asignado", IN_DIAGNOSIS:"En diagnóstico",
  IN_ANALYSIS:"En análisis", IN_PROGRESS:"En progreso", WAITING:"En espera",
  PENDING_USER:"Pend. usuario", PENDING_PROVIDER:"Pend. proveedor",
  ESCALATED:"Escalado", RESOLVED:"Resuelto", CLOSED:"Cerrado",
};
const STATUS_COLOR: Record<string, string> = {
  NEW:"bg-slate-500", ASSIGNED:"bg-blue-500", IN_DIAGNOSIS:"bg-cyan-500",
  IN_ANALYSIS:"bg-indigo-500", IN_PROGRESS:"bg-amber-500", WAITING:"bg-purple-500",
  PENDING_USER:"bg-orange-500", PENDING_PROVIDER:"bg-rose-500",
  ESCALATED:"bg-red-500", RESOLVED:"bg-green-500", CLOSED:"bg-slate-600",
};
const PRIORITY_LABEL: Record<string, string> = { LOW:"Baja", MEDIUM:"Media", HIGH:"Alta", URGENT:"Urgente" };
const PRIORITY_COLOR: Record<string, string> = { LOW:"bg-slate-500", MEDIUM:"bg-blue-500", HIGH:"bg-orange-500", URGENT:"bg-red-500" };
const TYPE_LABEL: Record<string, string> = {
  INCIDENT:"🔴 Incidencia", REQUEST:"🔵 Solicitud", ACCESS_PERMISSIONS:"🔑 Acceso",
  PURCHASE:"🛒 Compra", QUERY:"💬 Consulta", PROBLEM:"🔶 Problema", CHANGE:"🟡 Cambio",
};

// ─── Componentes ──────────────────────────────────────────────────────────────

function KPI({ label, value, sub, color = "text-white" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <p className="text-slate-500 text-xs mb-2">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-slate-600 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function BarChart({ items, colorMap, labelMap }: {
  items: { key: string; count: number }[];
  colorMap: Record<string, string>;
  labelMap: Record<string, string>;
}) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-3">
          <span className="text-slate-400 text-xs w-36 flex-shrink-0 truncate">{labelMap[item.key] ?? item.key}</span>
          <div className="flex-1 bg-slate-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${colorMap[item.key] ?? "bg-slate-500"}`}
              style={{ width: `${Math.round((item.count / max) * 100)}%` }}
            />
          </div>
          <span className="text-slate-300 text-xs font-semibold w-6 text-right">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function MiniTimeline({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d) => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
          <div
            className="w-full bg-blue-600 hover:bg-blue-500 rounded-sm transition-colors cursor-default"
            style={{ height: `${Math.max(Math.round((d.count / max) * 56), d.count > 0 ? 4 : 0)}px` }}
          />
          {/* Tooltip */}
          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-700 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
            {d.date.slice(5)}: {d.count} ticket{d.count !== 1 ? "s" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

const PERIODS = [
  { value: "7d",  label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "90d", label: "90 días" },
  { value: "all", label: "Todo" },
] as const;

export default function ReportsPage() {
  const [period, setPeriod] = useState<"7d"|"30d"|"90d"|"all">("30d");
  const { data, isLoading } = trpc.reports.getSummary.useQuery({ period });

  return (
    <div className="space-y-6">

      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reportes y métricas</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {data?.period.from
              ? `Desde ${new Date(data.period.from).toLocaleDateString("es-CO", { day: "2-digit", month: "long" })} hasta hoy`
              : "Todo el historial"}
          </p>
        </div>
        {/* Selector de período */}
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
          {PERIODS.map((p) => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p.value ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-slate-500 text-sm py-16 text-center">Calculando métricas...</div>
      ) : !data ? null : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <KPI label="Total tickets"      value={data.total}    />
            <KPI label="Abiertos"           value={data.open}     color={data.open > 0 ? "text-amber-400" : "text-slate-600"} />
            <KPI label="Resueltos/Cerrados" value={data.resolved} color="text-green-400" />
            <KPI label="Tasa de resolución"
              value={data.total ? `${Math.round((data.resolved / data.total) * 100)}%` : "—"}
              color="text-blue-400" />
            <KPI label="Tiempo promedio"
              value={data.avgResolutionHours ? `${data.avgResolutionHours}h` : "—"}
              sub="desde creación hasta cierre"
              color="text-purple-400" />
            <KPI label="Cumplimiento SLA"
              value={`${data.slaCompliance}%`}
              color={data.slaCompliance >= 90 ? "text-green-400" : data.slaCompliance >= 70 ? "text-amber-400" : "text-red-400"} />
          </div>

          {/* Timeline */}
          {data.timeline.length > 0 && (
            <Section title={`Tickets por día (últimos ${Math.min(data.period.days ?? 30, 30)} días)`}>
              <MiniTimeline data={data.timeline} />
              <div className="flex justify-between mt-1">
                <span className="text-slate-600 text-xs">{data.timeline[0]?.date.slice(5)}</span>
                <span className="text-slate-600 text-xs">{data.timeline[data.timeline.length - 1]?.date.slice(5)}</span>
              </div>
            </Section>
          )}

          {/* Distribuciones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.byStatus.length > 0 && (
              <Section title="Por estado">
                <BarChart
                  items={data.byStatus.map((i) => ({ key: i.status, count: i.count }))}
                  colorMap={STATUS_COLOR}
                  labelMap={STATUS_LABEL}
                />
              </Section>
            )}
            {data.byPriority.length > 0 && (
              <Section title="Por prioridad">
                <BarChart
                  items={data.byPriority.map((i) => ({ key: i.priority, count: i.count }))}
                  colorMap={PRIORITY_COLOR}
                  labelMap={PRIORITY_LABEL}
                />
              </Section>
            )}
            {data.byType.length > 0 && (
              <Section title="Por tipo">
                <BarChart
                  items={data.byType.map((i) => ({ key: i.type, count: i.count }))}
                  colorMap={{}}
                  labelMap={TYPE_LABEL}
                />
              </Section>
            )}
            {data.byCategory.length > 0 && (
              <Section title="Por categoría">
                <BarChart
                  items={data.byCategory.map((i) => ({ key: i.name, count: i.count }))}
                  colorMap={{}}
                  labelMap={{}}
                />
              </Section>
            )}
            {data.byGroup.length > 0 && (
              <Section title="Por grupo">
                <BarChart
                  items={data.byGroup.map((i) => ({ key: i.name, count: i.count }))}
                  colorMap={{}}
                  labelMap={{}}
                />
              </Section>
            )}
          </div>

          {/* Tabla por agente */}
          {data.byAgent.length > 0 && (
            <Section title="Rendimiento por agente">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    {["Agente", "Asignados", "Resueltos", "Tasa", "Tiempo prom."].map((h) => (
                      <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide pb-3 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.byAgent.map((a) => {
                    const rate = a.total ? Math.round((a.resolved / a.total) * 100) : 0;
                    return (
                      <tr key={a.name} className="border-b border-slate-800/50 last:border-0">
                        <td className="py-3 pr-4 text-slate-200 text-sm font-medium">{a.name}</td>
                        <td className="py-3 pr-4 text-slate-400 text-sm">{a.total}</td>
                        <td className="py-3 pr-4 text-green-400 text-sm font-semibold">{a.resolved}</td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-800 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${rate >= 80 ? "bg-green-500" : rate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${rate}%` }} />
                            </div>
                            <span className="text-xs text-slate-400">{rate}%</span>
                          </div>
                        </td>
                        <td className="py-3 text-slate-400 text-sm">{a.avgHours ? `${a.avgHours}h` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>
          )}

          {/* Estado vacío */}
          {data.total === 0 && (
            <div className="text-center py-20 text-slate-600">
              <p className="text-4xl mb-3">📊</p>
              <p className="font-medium text-slate-400">No hay tickets en este período</p>
              <p className="text-sm mt-1">Selecciona un período más amplio o crea algunos tickets.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
