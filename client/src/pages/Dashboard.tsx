import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { BarChart3, Target, Clock, Package, AlertCircle, RefreshCw } from "lucide-react";
import { api } from "@/api/appsScript";
import { DateRange } from "@/pages/flotte/Effectuees";
import { formatDuree, kpiColorClass } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Dashboard KPI principal (toutes commandes — externe + interne).
 * S'appuie sur l'endpoint getKpi du backend (déjà existant).
 */
export default function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateDebut, setDateDebut] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [dateFin, setDateFin] = useState(today);
  const [site, setSite] = useState<string>("");

  const { data: kpi, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["kpi-global", dateDebut, dateFin, site],
    queryFn: () => api.kpi.get({ dateDebut, dateFin, site: site || undefined }),
  });

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand-900 text-white flex items-center justify-center">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Dashboard KPI</h1>
              <p className="text-xs text-slate-500">Performance globale livraisons</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={site}
              onChange={(e) => setSite(e.target.value)}
              className="input py-1.5 px-2 w-36 text-sm"
            >
              <option value="">Tous les sites</option>
              <option value="Dakar">Dakar</option>
              <option value="Diamniadio">Diamniadio</option>
            </select>
            <DateRange
              dateDebut={dateDebut}
              dateFin={dateFin}
              onDebut={setDateDebut}
              onFin={setDateFin}
            />
            <button onClick={() => refetch()} disabled={isFetching} className="btn-outline gap-1.5">
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              <span className="hidden sm:inline">Rafraîchir</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>
        ) : error ? (
          <div className="card p-6 border-red-200 bg-red-50 text-sm text-red-700">
            {error instanceof Error ? error.message : "Erreur"}
          </div>
        ) : !kpi ? null : (
          <div className="space-y-5">
            {/* Cards globales */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card
                icon={Target}
                title="% Service ≤ 30 min"
                value={kpi.pct30min !== null ? `${kpi.pct30min}%` : "—"}
                hint={`${kpi.terminees} sorties validées`}
                colorClass={kpiColorClass(kpi.pct30min)}
              />
              <Card
                icon={Clock}
                title="Durée moyenne"
                value={kpi.moyenneService !== null ? formatDuree(kpi.moyenneService) : "—"}
                hint={`Médiane : ${kpi.medianeService !== null ? formatDuree(kpi.medianeService) : "—"}`}
              />
              <Card
                icon={Clock}
                title="Attente feu vert"
                value={
                  kpi.moyenneAttenteFeuVert !== null ? formatDuree(kpi.moyenneAttenteFeuVert) : "—"
                }
                hint="T0 → arrivée site"
              />
              <Card
                icon={Package}
                title="Total expéditions"
                value={kpi.totalExpeditions}
                hint={`${kpi.terminees} terminées`}
              />
            </div>

            {/* Performance par zone */}
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="h-4 w-4 text-brand-900" />
                <h3 className="text-sm font-semibold text-slate-900">Performance par zone</h3>
              </div>
              {kpi.parZone.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">Pas de données</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left">Zone</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-right">≤ 30 min</th>
                        <th className="px-3 py-2 text-right">Taux</th>
                        <th className="px-3 py-2 text-right">Moy.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {kpi.parZone.map((z) => {
                        const taux = z.total > 0 ? Math.round((z.sous30 / z.total) * 100) : null;
                        return (
                          <tr key={z.zone}>
                            <td className="px-3 py-2 font-medium text-slate-900">{z.zone}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs">{z.total}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-emerald-700">
                              {z.sous30}
                            </td>
                            <td className={cn("px-3 py-2 text-right font-semibold", kpiColorClass(taux))}>
                              {taux !== null ? `${taux}%` : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-slate-600">
                              {z.moyenneMins !== null ? formatDuree(z.moyenneMins) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Top motifs + Classement responsables */}
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <h3 className="text-sm font-semibold text-slate-900">Top motifs de retard</h3>
                </div>
                {kpi.topMotifs.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6">Aucun retard 🎉</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={kpi.topMotifs}
                        layout="vertical"
                        margin={{ top: 5, right: 10, left: 100, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis dataKey="motif" type="category" tick={{ fontSize: 11 }} width={100} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#e67e22" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="h-4 w-4 text-brand-900" />
                  <h3 className="text-sm font-semibold text-slate-900">Classement responsables</h3>
                </div>
                {kpi.classementResp.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6">—</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-2 py-2 text-left">#</th>
                          <th className="px-2 py-2 text-left">Responsable</th>
                          <th className="px-2 py-2 text-right">Total</th>
                          <th className="px-2 py-2 text-right">Taux</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {kpi.classementResp.slice(0, 10).map((r, i) => (
                          <tr key={r.email}>
                            <td className="px-2 py-2 font-medium">
                              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                            </td>
                            <td className="px-2 py-2 font-medium text-slate-900">{r.nom}</td>
                            <td className="px-2 py-2 text-right font-mono text-xs">{r.total}</td>
                            <td
                              className={cn(
                                "px-2 py-2 text-right font-semibold",
                                kpiColorClass(r.taux),
                              )}
                            >
                              {r.taux !== null ? `${r.taux}%` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  value,
  hint,
  colorClass,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string | number;
  hint?: string;
  colorClass?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider font-medium text-slate-500">
          {title}
        </div>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className={cn("text-2xl font-bold mt-1", colorClass || "text-slate-900")}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}
