import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Commande } from "@shared/schema";
import { StatutBadge } from "@/components/statut-badge";
import { JalonTimeline } from "@/components/jalon-timeline";
import { formatDateTime, formatDuree, dureeMinutes, ZONE_OPTIONS } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wrench, CheckCircle2, Clock, RefreshCw, AlertCircle, Timer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Anti-triche : délai minimum en secondes entre T1 et T2
const MIN_PREP_SECONDS = 120; // 2 minutes

export default function ResponsablePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filtreZone, setFiltreZone] = useState(user?.zoneLivraison || "all");
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Rafraîchit le "now" toutes les 10s pour mise à jour des timers
  useState(() => {
    const interval = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(interval);
  });

  const { data: commandes = [], isLoading, refetch } = useQuery<Commande[]>({
    queryKey: ["/api/commandes"],
    queryFn: () => apiRequest("GET", "/api/commandes").then((r) => r.json()),
    refetchInterval: 20000,
  });

  // Commandes pour le responsable : en attente ou en préparation
  const visibles = commandes.filter((c) => {
    if (!["en_attente", "en_preparation"].includes(c.statut)) return false;
    if (filtreZone && filtreZone !== "all" && c.zoneLivraison !== filtreZone) return false;
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

  // Calcul du temps restant avant de pouvoir valider T2 (anti-triche)
  const getSecondsUntilT2Allowed = (cmd: Commande): number => {
    if (!cmd.t1) return 0;
    const elapsed = (Date.now() - new Date(cmd.t1).getTime()) / 1000;
    return Math.max(0, MIN_PREP_SECONDS - elapsed);
  };

  const formatCountdown = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
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
              <h1 className="text-lg font-semibold">Préparation & Livraison</h1>
              <p className="text-sm text-muted-foreground">
                {visibles.length} commande{visibles.length > 1 ? "s" : ""} à traiter
                {user?.zoneLivraison && (
                  <span className="ml-2 text-sky-600 dark:text-sky-400 font-medium">· {user.zoneLivraison}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filtreZone} onValueChange={setFiltreZone}>
              <SelectTrigger className="w-[200px]" data-testid="select-zone-resp">
                <SelectValue placeholder="Toutes les zones" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les zones</SelectItem>
                {ZONE_OPTIONS.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
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
              const isLoadingThis = loadingId === cmd.id;
              const secsLeft = getSecondsUntilT2Allowed(cmd);
              const t2Blocked = cmd.statut === "en_preparation" && secsLeft > 0;

              return (
                <Card
                  key={cmd.id}
                  className={cn("border", enRetard && "border-orange-300 dark:border-orange-800")}
                  data-testid={`card-resp-${cmd.id}`}
                >
                  <CardHeader className="pb-2 pt-4 px-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-semibold font-mono">{cmd.numExpedition}</CardTitle>
                          {cmd.numCommandeNav && (
                            <span className="text-xs text-muted-foreground font-mono">{cmd.numCommandeNav}</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {cmd.client} · <span className="font-medium text-foreground">{cmd.zoneLivraison}</span> · {cmd.typeCommande}
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

                    {/* Anti-triche : avertissement si T2 bloqué */}
                    {t2Blocked && (
                      <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                        <Timer className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Délai minimum de préparation non atteint. Fin dans{" "}
                          <span className="font-semibold font-mono">{formatCountdown(secsLeft)}</span>
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      {cmd.statut === "en_attente" && (
                        <Button
                          size="sm"
                          onClick={() => handleJalon(cmd.id, "t1")}
                          disabled={isLoadingThis}
                          data-testid={`button-t1-${cmd.id}`}
                          className="bg-sky-600 hover:bg-sky-700"
                        >
                          {isLoadingThis ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Wrench className="h-4 w-4 mr-1.5" />}
                          Début de préparation
                        </Button>
                      )}
                      {cmd.statut === "en_preparation" && (
                        <Button
                          size="sm"
                          onClick={() => handleJalon(cmd.id, "t2")}
                          disabled={isLoadingThis || t2Blocked}
                          data-testid={`button-t2-${cmd.id}`}
                          className={cn(
                            "transition-colors",
                            t2Blocked
                              ? "bg-muted text-muted-foreground cursor-not-allowed"
                              : "bg-emerald-600 hover:bg-emerald-700"
                          )}
                          title={t2Blocked ? "Délai minimum de préparation non atteint" : undefined}
                        >
                          {isLoadingThis
                            ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                            : t2Blocked
                              ? <AlertCircle className="h-4 w-4 mr-1.5" />
                              : <CheckCircle2 className="h-4 w-4 mr-1.5" />
                          }
                          {t2Blocked ? `Fin de préparation (${formatCountdown(secsLeft)})` : "Fin de préparation"}
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
