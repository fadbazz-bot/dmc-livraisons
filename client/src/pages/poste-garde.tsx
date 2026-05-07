import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Commande } from "@shared/schema";
import { StatutBadge } from "@/components/statut-badge";
import { formatDateTime } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ShieldCheck, ArrowRightFromLine, ArrowLeftToLine, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PosteGardePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const { data: commandes = [], isLoading } = useQuery<Commande[]>({
    queryKey: ["/api/commandes"],
    queryFn: () => apiRequest("GET", "/api/commandes").then((r) => r.json()),
    refetchInterval: 15000,
  });

  // Le garde ne voit que les commandes qui doivent entrer ou qui sont déjà sur site et prêtes à sortir
  const attendues = commandes.filter((c) => c.statut === "en_attente");
  const surSite = commandes.filter((c) => 
    ["sur_site", "au_guichet", "en_preparation", "prete"].includes(c.statut)
  );

  const validerJalon = useMutation({
    mutationFn: async ({ id, jalon }: { id: number; jalon: string }) => {
      const res = await apiRequest("POST", `/api/commandes/${id}/jalon/${jalon}`, {
        acteurNom: user!.nom,
        acteurRole: user!.role,
      });
      if (!res.ok) throw new Error("Erreur de validation");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/commandes"] });
      toast({ title: "Accès validé", description: "Le passage au portail a été enregistré." });
      setLoadingId(null);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de valider le passage.", variant: "destructive" });
      setLoadingId(null);
    },
  });

  const handlePassage = (id: number, jalon: string) => {
    setLoadingId(id);
    validerJalon.mutate({ id, jalon });
  };

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-32 w-full max-w-2xl mx-auto" /></div>;
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto bg-muted/20">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        
        {/* SECTION 1 : ENTRÉES (Camions attendus) */}
        <section>
          <div className="flex items-center gap-2 mb-4 text-emerald-700 dark:text-emerald-500">
            <ArrowRightFromLine className="h-6 w-6" />
            <h2 className="text-xl font-bold">Camions Attendus (Entrée)</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {attendues.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Aucune entrée prévue.</p>
            ) : (
              attendues.map((cmd) => (
                <Card key={cmd.id} className="border-emerald-200 dark:border-emerald-900">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-base font-mono flex items-center justify-between">
                      {cmd.numExpedition}
                      <StatutBadge statut={cmd.statut} />
                    </CardTitle>
                    <p className="text-sm font-medium">{cmd.client}</p>
                    <p className="text-xs text-muted-foreground">{cmd.zoneLivraison} • Créé le {formatDateTime(cmd.t0)}</p>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <Button 
                      onClick={() => handlePassage(cmd.id, "tEntreeSite")} 
                      disabled={loadingId === cmd.id || validerJalon.isPending}
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                    >
                      {loadingId === cmd.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Truck className="h-4 w-4 mr-2" />}
                      Valider l'entrée
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        {/* SECTION 2 : SORTIES (Camions sur site) */}
        <section>
          <div className="flex items-center gap-2 mb-4 text-blue-700 dark:text-blue-500">
            <ArrowLeftToLine className="h-6 w-6" />
            <h2 className="text-xl font-bold">Camions sur site (Sortie)</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {surSite.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Aucun camion actuellement sur le site.</p>
            ) : (
              surSite.map((cmd) => (
                <Card key={cmd.id} className="border-blue-200 dark:border-blue-900">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-base font-mono flex items-center justify-between">
                      {cmd.numExpedition}
                      <StatutBadge statut={cmd.statut} />
                    </CardTitle>
                    <p className="text-sm font-medium">{cmd.client}</p>
                    {/* Indicateur visuel si le chargement a été pris en photo (donc prêt à partir) */}
                    {cmd.photoChargementUrl && (
                      <p className="text-xs text-emerald-600 font-bold mt-1">✓ Chargement terminé</p>
                    )}
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <Button 
                      onClick={() => handlePassage(cmd.id, "tSortieSite")} 
                      disabled={loadingId === cmd.id || validerJalon.isPending}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      {loadingId === cmd.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                      Valider la sortie définitive
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
