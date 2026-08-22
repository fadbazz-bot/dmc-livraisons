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
  LineChart,
  Line,
} from "recharts";
import { Target, Clock, Truck, Database, AlertCircle, TrendingUp } from "lucide-react";
import { api } from "@/api/appsScript";
import { FlotteLayout } from "@/components/FlotteLayout";
import { DateRange } from "@/pages/flotte/Effectuees";
import { formatDuree, kpiColorClass } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Tableau de bord KPI flotte interne.
 * - Cartes globales : conformité, LOI 10h, NAV, durée moyenne
 * - Top motifs (bar chart)
 * - Performance par chauffeur (bar chart)
 * - Évolution dans le temps (line chart)
 * - Répartition par dépôt (bar chart)
 */
export default function KpiFlottePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateDebut, setDateDebut] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [dateFin, setDateFin] = useState(today);

  const { data: kpi, isLoading, error } = useQuery({
    queryKey: ["flotte-kpi", dateDebut, dateFin],
    queryFn: () => api.flotteLivraisons.kpi({ dateDebut, dateFin }),
  });

  return (
    <FlotteLayout
      subtitle="Indicateurs de performance flotte interne DMC"
      rightSlot={
        <DateRange dateDebut={dateDebut} dateFin={dateFin} onDebut={setDateDebut} onFin={setDateFin} />
      }
    >
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
            <KpiCard
              icon={Target}
              title="Taux conformité"
              value={kpi.tauxConformite !== null ? `${kpi.tauxConformite}%` : "—"}
              hint={`${kpi.conformes} / ${kpi.terminees} dans les temps`}
              colorClass={kpiColorClass(kpi.tauxConformite)}
            />
            <KpiCard
              icon={AlertCircle}
              title="LOI 10h respectée"
              value={kpi.tauxLoi10h !== null ? `${100 - kpi.tauxLoi10h}%` : "—"}
              hint={`${kpi.loi10h} départ${kpi.loi10h > 1 ? "s" : ""} ≥ 10h sur ${kpi.terminees}`}
              colorClass={kpiColorClass(kpi.tauxLoi10h !== null ? 100 - kpi.tauxLoi10h : null)}
            />
            <KpiCard
              icon={Clock}
              title="Durée moyenne"
              value={kpi.moyenneDureeMin !== null ? formatDuree(kpi.moyenneDureeMin) : "—"}
              hint="Du lancement à la sortie"
            />
            <KpiCard
              icon={Database}
              title="Confirmé NAV"
              value={kpi.tauxConfirmeNav !== null ? `${kpi.tauxConfirmeNav}%` : "—"}
              hint={`${kpi.confirmesNav} / ${kpi.totalPlanifiees} confirmées NAV`}
              colorClass={kpiColorClass(kpi.tauxConfirmeNav)}
            />
          </div>

          {/* Volume cards */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            <SmallCard label="Planifiées" value={kpi.totalPlanifiees} accent="" />
            <SmallCard label="Terminées" value={kpi.terminees} accent="text-blue-600" />
            <SmallCard label="Livrées" value={kpi.livrees} accent="text-emerald-600" />
            <SmallCard label="Partielles" value={kpi.partielles} accent="text-amber-600" />
            <SmallCard label="Non livrées" value={kpi.nonLivrees} accent="text-red-600" />
          </div>

          {/* Charts ligne 1 : courbe temporelle */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-brand-900" />
              <h3 className="text-sm font-semibold text-slate-900">Évolution dans le temps</h3>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={kpi.courbeJour} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="planifiees" name="Planifiées" stroke="#1a3a5c" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="terminees" name="Terminées" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="retards" name="Retards" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Charts ligne 2 : top motifs + chauffeurs */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-slate-900">Top motifs de retard</h3>
              </div>
              {kpi.topMotifs.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">Aucun motif sur la période</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={kpi.topMotifs} layout="vertical" margin={{ top: 5, right: 10, left: 100, bottom: 0 }}>
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
                <Truck className="h-4 w-4 text-brand-900" />
                <h3 className="text-sm font-semibold text-slate-900">Performance par chauffeur</h3>
              </div>
              {kpi.classementChauffeurs.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">
                  Aucun chauffeur n'a livré sur la période
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-2 py-2 text-left">Chauffeur</th>
                        <th className="px-2 py-2 text-right">Total</th>
                        <th className="px-2 py-2 text-right">OK</th>
                        <th className="px-2 py-2 text-right">Retards</th>
                        <th className="px-2 py-2 text-right">LOI 10h</th>
                        <th className="px-2 py-2 text-right">Taux</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {kpi.classementChauffeurs.map((c, i) => (
                        <tr key={c.nom}>
                          <td className="px-2 py-2 font-medium text-slate-900 flex items-center gap-1.5">
                            {i === 0 && <span>🥇</span>}
                            {i === 1 && <span>🥈</span>}
                            {i === 2 && <span>🥉</span>}
                            {c.nom}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-xs">{c.total}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs text-emerald-700">{c.conformes}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs text-amber-700">{c.retards}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs text-red-700">{c.loi10h}</td>
                          <td className={cn("px-2 py-2 text-right font-semibold", kpiColorClass(c.taux))}>
                            {c.taux !== null ? `${c.taux}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Répartition par dépôt */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Database className="h-4 w-4 text-brand-900" />
              <h3 className="text-sm font-semibold text-slate-900">Répartition par dépôt</h3>
            </div>
            {kpi.repartitionDepots.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">—</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kpi.repartitionDepots} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="depot" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="total"   name="Total"     fill="#1a3a5c" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="livrees" name="Livrées"   fill="#16a34a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </FlotteLayout>
  );
}

function KpiCard({
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
        <div className="text-[11px] uppercase tracking-wider font-medium text-slate-500">{title}</div>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className={cn("text-2xl font-bold mt-1", colorClass || "text-slate-900")}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function SmallCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("text-lg font-bold mt-0.5", accent || "text-slate-900")}>{value}</div>
    </div>
  );
}
