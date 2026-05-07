import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Commande } from "@shared/schema";
import { StatutBadge } from "@/components/statut-badge";
import { JalonTimeline } from "@/components/jalon-timeline";
import { formatDateTime, formatDuree, dureeMinutes, ZONE_OPTIONS } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Wrench, CheckCircle2, Clock, RefreshCw, KeyRound, Camera, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function ResponsablePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filtreZone, setFiltreZone] = useState(user?.zoneLivraison || "all");
  const [loadingId, setLoadingId] = useState<number | null>(null);

  // États pour les modales anti-triche
  const [pinDialogCmd, setPinDialogCmd] = useState<Commande | null>(null);
  const [pinValue, setPinValue] = useState("");
  
  const [photoDialogCmd, setPhotoDialogCmd] = useState<Commande | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: commandes = [], isLoading, refetch } = useQuery<Commande[]>({
    queryKey: ["/api/commandes"],
    queryFn: () => apiRequest("GET", "/api/commandes").then((r) => r.json()),
    refetchInterval: 15000,
  });

  // On affiche tout le flux pour le responsable : de l'attente jusqu'au chargement
  const visibles = commandes.filter((c) => {
    const statutsVisibles = ["en_attente", "sur_site", "au_guichet", "en_preparation", "prete"];
    if (!statutsVisibles.includes(c.statut)) return false;
    if (filtreZone && filtreZone !== "all" && c.zoneLivraison !== filtreZone) return false;
    return true;
  });

  const validerJalon = useMutation({
    mutationFn: async ({ id, jalon, extraData }: { id: number; jalon: string; extraData?: any }) => {
      const res = await apiRequest("POST", `/api/commandes/${id}/jalon/${jalon}`, {
        acteurNom: user!.nom,
        acteurRole: user!.role,
        ...extraData
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur de validation");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/commandes"] });
      toast({ title: "Opération validée", description: "La progression a été mise à jour." });
      setLoadingId(null);
      setPinDialogCmd(null);
      setPhotoDialogCmd(null);
      setPhotoPreview(null);
      setPinValue("");
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
      setLoadingId(null);
    },
  });

  // Actions directes (sans modale)
  const handleJalonSimple = (id: number, jalon: string) => {
    setLoadingId(id);
    validerJalon.mutate({ id, jalon });
  };

  // Capture de l'appareil photo
  const handlePhotoCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotoPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

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
              <p className="text-sm text-muted-foreground">{visibles.length} commande(s) en cours</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filtreZone} onValueChange={setFiltreZone}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Toutes les zones" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les zones</SelectItem>
                {ZONE_OPTIONS.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-1.5" />Actualiser</Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading ? (
          <Card><CardContent className="p-5"><Skeleton className="h-28 w-full" /></CardContent></Card>
        ) : visibles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
            <p className="font-medium">Aucune commande à gérer</p>
          </div>
        ) : (
          visibles
            .sort((a, b) => new Date(a.t0!).getTime() - new Date(b.t0!).getTime())
            .map((cmd) => {
              const attente = dureeMinutes(cmd.t0, new Date().toISOString());
              const enRetard = attente !== null && attente > 30;
              const isLoadingThis = loadingId === cmd.id || validerJalon.isPending;

              return (
                <Card key={cmd.id} className={cn("border", enRetard && "border-orange-300")}>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm font-semibold font-mono">{cmd.numExpedition}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {cmd.client} · <span className="font-medium text-foreground">{cmd.zoneLivraison}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {enRetard && <span className="text-xs text-orange-500 flex items-center"><Clock className="h-3.5 w-3.5 mr-1" />{formatDuree(attente)}</span>}
                        <StatutBadge statut={cmd.statut} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-4">
                    <JalonTimeline commande={cmd} />

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {/* BOUTON 1 : Saisie du PIN (Démarre les 30 min) */}
                      {(cmd.statut === "en_attente" || cmd.statut === "sur_site") && (
                        <Button size="sm" onClick={() => setPinDialogCmd(cmd)} disabled={isLoadingThis} className="bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto">
                          <KeyRound className="h-4 w-4 mr-1.5" />
                          Chauffeur au guichet (Saisir Code)
                        </Button>
                      )}

                      {/* BOUTON 2 : Démarrage Préparation */}
                      {cmd.statut === "au_guichet" && (
                        <Button size="sm" onClick={() => handleJalonSimple(cmd.id, "t1")} disabled={isLoadingThis} className="bg-sky-600 hover:bg-sky-700 w-full sm:w-auto">
                          <Wrench className="h-4 w-4 mr-1.5" />
                          Démarrer préparation
                        </Button>
                      )}

                      {/* BOUTON 3 : Fin de Préparation */}
                      {cmd.statut === "en_preparation" && (
                        <Button size="sm" onClick={() => handleJalonSimple(cmd.id, "t2")} disabled={isLoadingThis} className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto">
                          <CheckCircle2 className="h-4 w-4 mr-1.5" />
                          Marchandise prête
                        </Button>
                      )}

                      {/* BOUTON 4 : Validation Chargement (Photo) */}
                      {cmd.statut === "prete" && (
                        <Button size="sm" onClick={() => setPhotoDialogCmd(cmd)} disabled={isLoadingThis} className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
                          <Camera className="h-4 w-4 mr-1.5" />
                          Prendre en photo le chargement
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
        )}
      </div>

      {/* --- MODALE 1 : SAISIE DU CODE PIN (ARRIVÉE GUICHET) --- */}
      <Dialog open={!!pinDialogCmd} onOpenChange={(o) => !o && setPinDialogCmd(null)}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="flex justify-center mb-2"><KeyRound className="h-10 w-10 text-indigo-500" /></DialogTitle>
            <DialogTitle>Validation Présence Chauffeur</DialogTitle>
            <DialogDescription>
              Demandez au chauffeur son code à 4 chiffres. Cette action déclenche le chronomètre de préparation de 30 minutes.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input 
              type="text" 
              maxLength={4}
              placeholder="Ex: 4821" 
              value={pinValue} 
              onChange={(e) => setPinValue(e.target.value.replace(/[^0-9]/g, ''))}
              className="text-center text-3xl font-mono tracking-[0.5em] h-16 w-3/4 mx-auto"
              autoFocus
            />
          </div>
          <DialogFooter className="sm:justify-center">
            <Button variant="outline" onClick={() => setPinDialogCmd(null)}>Annuler</Button>
            <Button 
              disabled={pinValue.length !== 4 || validerJalon.isPending} 
              onClick={() => validerJalon.mutate({ id: pinDialogCmd!.id, jalon: "tArriveeGuichet", extraData: { codeRetraitSaisi: pinValue } })}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {validerJalon.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Valider & Démarrer le chrono
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- MODALE 2 : PHOTO DU CHARGEMENT --- */}
      <Dialog open={!!photoDialogCmd} onOpenChange={(o) => !o && setPhotoDialogCmd(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-blue-600" /> Validation du chargement</DialogTitle>
            <DialogDescription>
              Prenez en photo la marchandise dans le véhicule du client pour clore votre temps de préparation.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col items-center justify-center py-4 space-y-4">
            {!photoPreview ? (
              <Button onClick={() => fileInputRef.current?.click()} className="h-24 w-full border-dashed bg-muted/50 text-muted-foreground hover:bg-muted" variant="outline">
                <Camera className="h-8 w-8 mr-3" />
                Ouvrir l'appareil photo
              </Button>
            ) : (
              <div className="relative w-full">
                <img src={photoPreview} alt="Chargement" className="w-full max-h-64 object-cover rounded-md border" />
                <Button variant="secondary" size="sm" className="absolute top-2 right-2" onClick={() => fileInputRef.current?.click()}>
                  Reprendre la photo
                </Button>
              </div>
            )}
            {/* L'attribut capture="environment" force l'ouverture de l'appareil photo arrière sur mobile */}
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPhotoDialogCmd(null)}>Annuler</Button>
            <Button 
              disabled={!photoPreview || validerJalon.isPending} 
              onClick={() => validerJalon.mutate({ id: photoDialogCmd!.id, jalon: "tChargementFini", extraData: { photoChargementUrl: photoPreview } })}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {validerJalon.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Valider le chargement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
