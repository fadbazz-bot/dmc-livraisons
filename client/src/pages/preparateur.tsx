import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Commande } from "@shared/schema";
import { StatutBadge } from "@/components/statut-badge";
import { JalonTimeline } from "@/components/jalon-timeline";
import { formatDateTime, formatDuree, dureeMinutes, SITE_OPTIONS } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Wrench, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function PreparateurPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filtreSite, setFiltreSite] = useState(user?.site || "all");
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const { data: commandes = [], isLoading, refetch } = useQuery<Commande[]>({
    queryKey: ["/api/commandes"],
    queryFn: () => apiRequest("GET", "/api/commandes").then((r) => r.json()),
    refetchInterval: 20000,
  });

  // Commandes visibles pour le préparateur : en attente ou en préparation
  const visibles = commandes.filter((c) => {
    if (!["en_attente", "en_preparation"].includes(c.statut)) return false;
    if (filtreSite && filtreSite !== "all" && c.site !== filtreSite) return false;
    return true;
  });

  const jalonnement = useMutation({
    mutationFn: ({ id, jalon }: { id: number; jalon: "t1" | "t2" }) =>
      apiRequest("POST", `/api/commandes/${id}/jalon/${jalon}`, {
        acteurNom: user!.nom,
        acteurRole: user!.role,
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/commandes"] });
      toast({ title: "Jalon enregistré", description: "La progression a été mise à jour." });
      setLoadingId(null);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de mettre à jour le jalon.", variant: "destructive" });
      setLoadingId(null);
    },
  });

  const handleJalon = (id: number, jalon: "t1" | "t2") => {
    setLoadingId(id);
    jalonnement.mutate({ id, jalon });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
              <Wrench className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Espace préparateur</h1>
              <p className="text-sm text-muted-foreground">
                {visibles.length} commande{visibles.length > 1 ? "s" : ""} à traiter
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filtreSite} onValueChange={setFiltreSite}>
              <SelectTrigger className="w-[160px]" data-testid="select-site-prep">
                <SelectValue placeholder="Tous les sites" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les sites</SelectItem>
                {SITE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Actualiser
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-28 w-full" /></CardContent></Card>
          ))
        ) : visibles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
            <p className="font-medium text-foreground">Aucune commande à préparer</p>
            <p className="text-sm text-muted-foreground mt-1">Toutes les commandes sont traitées ou filtrées</p>
          </div>
        ) : (
          visibles
            .sort((a, b) => {
              if (a.priorite === "aujourd_hui" && b.priorite !== "aujourd_hui") return -1;
              if (b.priorite === "aujourd_hui" && a.priorite !== "aujourd_hui") return 1;
              return new Date(a.t0!).getTime() - new Date(b.t0!).getTime();
            })
            .map((cmd) => {
              const attente = dureeMinutes(cmd.t0, new Date().toISOString());
              const enRetard = attente !== null && attente > 30;
              const isLoading = loadingId === cmd.id;

              return (
                <Card
                  key={cmd.id}
                  className={cn("border", enRetard && "border-orange-300 dark:border-orange-800")}
                  data-testid={`card-prep-${cmd.id}`}
                >
                  <CardHeader className="pb-2 pt-4 px-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm font-semibold mono">{cmd.numExpedition}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {cmd.client} · {cmd.site} · {cmd.typeCommande}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {enRetard && (
                          <span className="text-xs text-orange-500 font-medium flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />{formatDuree(attente)} d'attente
                          </span>
                        )}
                        <StatutBadge statut={cmd.statut} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-4">
                    <JalonTimeline commande={cmd} />

                    {cmd.commentaireCommercial && (
                      <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground italic">
                        "{cmd.commentaireCommercial}"
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      {cmd.statut === "en_attente" && (
                        <Button
                          size="sm"
                          onClick={() => handleJalon(cmd.id, "t1")}
                          disabled={isLoading}
                          data-testid={`button-t1-${cmd.id}`}
                          className="bg-sky-600 hover:bg-sky-700"
                        >
                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Wrench className="h-4 w-4 mr-1.5" />}
                          Démarrer préparation (T1)
                        </Button>
                      )}
                      {cmd.statut === "en_preparation" && (
                        <Button
                          size="sm"
                          onClick={() => handleJalon(cmd.id, "t2")}
                          disabled={isLoading}
                          data-testid={`button-t2-${cmd.id}`}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                          Marquer prête (T2)
                        </Button>
                      )}
                      <span className="text-xs text-muted-foreground ml-1">Créée {formatDateTime(cmd.t0)}</span>
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
