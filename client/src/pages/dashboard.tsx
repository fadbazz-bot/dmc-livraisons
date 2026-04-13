import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, Clock, Target, AlertTriangle, RefreshCw } from "lucide-react";
import { kpiColor, formatDuree } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface KpiData {
  totalCommandes: number;
  commandesTerminees: number;
  pct30minService: number | null;
  pct30minPrep: number | null;
  moyenneMinsService: number;
  medianeMinsService: number;
  moyenneMinsPrep: number;
  topMotifs: { motif: string; count: number }[];
  parSite: { site: string; total: number; sous30: number; moyenneMins: number }[];
}

function KpiCard({
  title, value, subtitle, icon: Icon, color, unit = "",
}: {
  title: string;
  value: string | number | null;
  subtitle?: string;
  icon: React.ElementType;
  color?: string;
  unit?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className={cn("text-2xl font-bold", color || "text-foreground")}>
              {value === null ? "—" : `${value}${unit}`}
            </p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 ml-3">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateDebut, setDateDebut] = useState(today);
  const [dateFin, setDateFin] = useState(today);

  const { data: kpi, isLoading, refetch } = useQuery<KpiData>({
    queryKey: ["/api/kpi", dateDebut, dateFin],
    queryFn: () =>
      apiRequest("GET", `/api/kpi?dateDebut=${dateDebut}&dateFin=${dateFin}`).then((r) => r.json()),
  });

  const barMax = kpi ? Math.max(...kpi.parSite.map((s) => s.total), 1) : 1;

  return (
    <div className="h-full flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Dashboard KPI</h1>
              <p className="text-sm text-muted-foreground">Performance livraisons — objectif 30 min</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-sm">
              <label className="text-muted-foreground shrink-0">Du</label>
              <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className="w-36" data-testid="input-date-debut" />
              <label className="text-muted-foreground shrink-0">au</label>
              <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className="w-36" data-testid="input-date-fin" />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-kpi">
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Actualiser
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-5"><Skeleton className="h-20 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : !kpi ? null : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="% Service ≤ 30 min"
                value={kpi.pct30minService}
                subtitle={`T0 → T4 · ${kpi.commandesTerminees} commandes terminées`}
                icon={Target}
                color={kpiColor(kpi.pct30minService)}
                unit="%"
              />
              <KpiCard
                title="% Préparation ≤ 30 min"
                value={kpi.pct30minPrep}
                subtitle="T1 → T2 uniquement"
                icon={TrendingUp}
                color={kpiColor(kpi.pct30minPrep)}
                unit="%"
              />
              <KpiCard
                title="Durée moy. service"
                value={kpi.moyenneMinsService ? formatDuree(Math.round(kpi.moyenneMinsService)) : null}
                subtitle={`Médiane : ${formatDuree(Math.round(kpi.medianeMinsService))}`}
                icon={Clock}
              />
              <KpiCard
                title="Total commandes"
                value={kpi.totalCommandes}
                subtitle={`${kpi.commandesTerminees} terminées`}
                icon={BarChart3}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top motifs retard */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    Top motifs de retard
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {kpi.topMotifs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Aucun retard sur la période</p>
                  ) : (
                    <div className="space-y-3">
                      {kpi.topMotifs.map((m, i) => {
                        const maxCount = kpi.topMotifs[0]?.count || 1;
                        const pct = Math.round((m.count / maxCount) * 100);
                        return (
                          <div key={i} className="space-y-1" data-testid={`motif-row-${i}`}>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-foreground font-medium">{m.motif}</span>
                              <span className="text-muted-foreground font-mono">{m.count}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-orange-400 dark:bg-orange-500 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Performance par site */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Performance par site
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {kpi.parSite.map((s) => {
                      const pct30 = s.total > 0 ? Math.round((s.sous30 / s.total) * 100) : null;
                      return (
                        <div key={s.site} className="space-y-2" data-testid={`site-row-${s.site}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">{s.site}</span>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{s.total} cmd</span>
                              <span className={cn("font-semibold", kpiColor(pct30))}>
                                {pct30 !== null ? `${pct30}% ≤30 min` : "—"}
                              </span>
                              <span>moy. {formatDuree(Math.round(s.moyenneMins))}</span>
                            </div>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${(s.total / barMax) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Note méthodologique */}
            <div className="bg-muted/40 rounded-lg p-4 text-xs text-muted-foreground">
              <span className="font-medium">Périmètre KPI :</span> Commandes non annulées, non exclues. KPI Service = T0 → T4. KPI Préparation = T1 → T2. Les commandes sans T4 ne sont pas comptées dans le % service.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
