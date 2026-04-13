import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Commande } from "@shared/schema";
import { StatutBadge } from "@/components/statut-badge";
import { JalonTimeline } from "@/components/jalon-timeline";
import { dureeMinutes, formatDuree, formatDateTime, SITE_OPTIONS, ZONE_OPTIONS } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Search, PackagePlus, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUTS = [
  { value: "all", label: "Tous les statuts" },
  { value: "en_attente", label: "En attente" },
  { value: "en_preparation", label: "En préparation" },
  { value: "prete", label: "Prête" },
  
  { value: "partie", label: "Partie" },
];

export default function FileCommandesPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("all");
  const [filtreSite, setFiltreSite] = useState("all");

  const { data: commandes = [], isLoading, refetch } = useQuery<Commande[]>({
    queryKey: ["/api/commandes"],
    queryFn: () => apiRequest("GET", "/api/commandes").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const filtered = commandes.filter((c) => {
    if (filtreStatut && filtreStatut !== "all" && c.statut !== filtreStatut) return false;
    if (filtreSite && filtreSite !== "all" && c.site !== filtreSite && c.zoneLivraison !== filtreSite) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.numExpedition.toLowerCase().includes(q) ||
        c.client.toLowerCase().includes(q) ||
        (c.numCommandeNav || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const enAttente = commandes.filter((c) => c.statut === "en_attente").length;
  const enCours = commandes.filter((c) => ["en_preparation", "prete"].includes(c.statut)).length;

  const getDureeAttente = (c: Commande) => {
    if (!c.t0) return null;
    const fin = c.t4 || new Date().toISOString();
    return dureeMinutes(c.t0, fin);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">File des commandes</h1>
            <p className="text-sm text-muted-foreground">
              {enAttente > 0 && <span className="text-orange-500 font-medium">{enAttente} en attente · </span>}
              {enCours} en cours · {commandes.length} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh">
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Actualiser
            </Button>
            {(user?.role === "commercial" || user?.role === "admin") && (
              <Button size="sm" onClick={() => navigate("/nouvelle-demande")} data-testid="button-nouvelle-demande">
                <PackagePlus className="h-4 w-4 mr-1.5" />
                Nouvelle demande
              </Button>
            )}
          </div>
        </div>

        {/* Filtres */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Chercher par N° expédition, client…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
            />
          </div>
          <Select value={filtreStatut} onValueChange={setFiltreStatut}>
            <SelectTrigger className="w-[180px]" data-testid="select-filtre-statut">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtreSite} onValueChange={setFiltreSite}>
            <SelectTrigger className="w-[160px]" data-testid="select-filtre-site">
              <SelectValue placeholder="Tous les sites" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les sites</SelectItem>
              {SITE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              {ZONE_OPTIONS.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <PackagePlus className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">Aucune commande trouvée</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Modifiez les filtres ou créez une nouvelle demande</p>
          </div>
        ) : (
          filtered.map((cmd) => {
            const attente = getDureeAttente(cmd);
            const enRetard = attente !== null && attente > 30 && !["partie", "annulee"].includes(cmd.statut);

            return (
              <Card
                key={cmd.id}
                className={cn(
                  "cursor-pointer hover:shadow-md transition-shadow border",
                  enRetard && "border-orange-300 dark:border-orange-800"
                )}
                onClick={() => navigate(`/commande/${cmd.id}`)}
                data-testid={`card-commande-${cmd.id}`}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Row 1: identité */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground mono text-sm">{cmd.numExpedition}</span>
                          {cmd.priorite === "aujourd_hui" && (
                            <Badge variant="outline" className="text-xs border-orange-300 text-orange-600 dark:text-orange-400">Urgent</Badge>
                          )}
                          {enRetard && (
                            <span className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 font-medium">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {formatDuree(attente)} en cours
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{cmd.client} · {cmd.zoneLivraison || cmd.site} · {cmd.typeCommande}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatutBadge statut={cmd.statut} />
                    </div>
                  </div>

                  {/* Row 2: timeline jalons */}
                  <JalonTimeline commande={cmd} />

                  {/* Row 3: meta */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Créée {formatDateTime(cmd.t0)}
                    </span>
                    <span>Commercial : {cmd.commercialNom}</span>
                    {cmd.responsableNom && <span>Responsable : {cmd.responsableNom}</span>}
                    {cmd.t4 && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        Durée totale : {formatDuree(dureeMinutes(cmd.t0, cmd.t4))}
                        {dureeMinutes(cmd.t0, cmd.t4)! <= 30 ? " ✓" : " ✗"}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
