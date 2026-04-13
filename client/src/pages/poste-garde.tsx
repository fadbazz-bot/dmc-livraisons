import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Commande, MotifRetard } from "@shared/schema";
import { StatutBadge } from "@/components/statut-badge";
import { JalonTimeline } from "@/components/jalon-timeline";
import { formatDateTime, formatDuree, dureeMinutes } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Loader2, ShieldCheck, Truck, RefreshCw, AlertTriangle, Camera, QrCode, FileCheck, Car, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type SortieData = {
  plaqueImmatriculation: string;
  nomChauffeur: string;
  numeroBL: string;
  photoBlUrl: string;
  motifRetard: string[];
  commentaireRetard: string;
};

export default function PosteGardePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCmd, setSelectedCmd] = useState<Commande | null>(null);
  const [sortieData, setSortieData] = useState<SortieData>({
    plaqueImmatriculation: "",
    nomChauffeur: "",
    numeroBL: "",
    photoBlUrl: "",
    motifRetard: [],
    commentaireRetard: "",
  });
  const [scanning, setScanning] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blInputRef = useRef<HTMLInputElement>(null);

  const { data: commandes = [], isLoading, refetch } = useQuery<Commande[]>({
    queryKey: ["/api/commandes"],
    queryFn: () => apiRequest("GET", "/api/commandes").then((r) => r.json()),
    refetchInterval: 20000,
  });

  const { data: motifs = [] } = useQuery<MotifRetard[]>({
    queryKey: ["/api/motifs-retard"],
    queryFn: () => apiRequest("GET", "/api/motifs-retard").then((r) => r.json()),
  });

  // Poste de garde : commandes prêtes uniquement
  const visibles = commandes.filter((c) => c.statut === "prete");

  const validerSortie = useMutation({
    mutationFn: ({ id, data }: { id: number; data: SortieData }) =>
      apiRequest("POST", `/api/commandes/${id}/jalon/t4`, {
        acteurNom: user!.nom,
        acteurRole: user!.role,
        motifRetard: data.motifRetard,
        commentaireRetard: data.commentaireRetard,
        plaqueImmatriculation: data.plaqueImmatriculation,
        nomChauffeur: data.nomChauffeur,
        numeroBL: data.numeroBL,
        photoBlUrl: data.photoBlUrl,
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/commandes"] });
      toast({ title: "Sortie validée (T4)", description: "La commande a bien quitté le site." });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de valider la sortie.", variant: "destructive" });
    },
  });

  const openDialog = (cmd: Commande) => {
    setSelectedCmd(cmd);
    setSortieData({
      plaqueImmatriculation: "",
      nomChauffeur: "",
      numeroBL: "",
      photoBlUrl: "",
      motifRetard: [],
      commentaireRetard: "",
    });
    setPhotoPreview(null);
    setScanning(false);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setSelectedCmd(null);
    setPhotoPreview(null);
    setScanning(false);
  };

  // Capture photo / scan BL via l'appareil photo ou fichier
  const handlePhotoCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPhotoPreview(dataUrl);
      setSortieData((prev) => ({ ...prev, photoBlUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  }, []);

  // Scan QR code via input texte (simulation — en prod: intégrer une lib QR)
  const handleQrInput = (val: string) => {
    setSortieData((prev) => ({ ...prev, numeroBL: val }));
  };

  const toggleMotif = (libelle: string) => {
    setSortieData((prev) => ({
      ...prev,
      motifRetard: prev.motifRetard.includes(libelle)
        ? prev.motifRetard.filter((m) => m !== libelle)
        : [...prev.motifRetard, libelle],
    }));
  };

  const totalService = selectedCmd
    ? dureeMinutes(selectedCmd.t0, new Date().toISOString())
    : null;
  const horsDelai = totalService !== null && totalService > 30;

  const canSubmit =
    sortieData.plaqueImmatriculation.trim().length >= 2 &&
    sortieData.numeroBL.trim().length >= 1;

  const motifsByCategorie = motifs.reduce<Record<string, MotifRetard[]>>((acc, m) => {
    if (!acc[m.categorie]) acc[m.categorie] = [];
    acc[m.categorie].push(m);
    return acc;
  }, {});

  const CATEGORIE_LABELS: Record<string, string> = {
    stock: "Stock / Arrivage",
    transport: "Transport",
    client: "Client",
    organisation: "Organisation",
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Poste de Garde</h1>
              <p className="text-sm text-muted-foreground">
                {visibles.length} commande{visibles.length > 1 ? "s" : ""} prête{visibles.length > 1 ? "s" : ""} à sortir
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Actualiser
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-28 w-full" /></CardContent></Card>
          ))
        ) : visibles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldCheck className="h-10 w-10 text-emerald-400 mb-3" />
            <p className="font-medium text-foreground">Aucune commande en attente de sortie</p>
            <p className="text-sm text-muted-foreground mt-1">Les commandes apparaissent ici une fois prêtes</p>
          </div>
        ) : (
          visibles.map((cmd) => {
            const attente = dureeMinutes(cmd.t0, new Date().toISOString());
            const enRetard = attente !== null && attente > 30;

            return (
              <Card
                key={cmd.id}
                className={cn("border", enRetard && "border-orange-300 dark:border-orange-800")}
                data-testid={`card-garde-${cmd.id}`}
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
                          <AlertTriangle className="h-3.5 w-3.5" />{formatDuree(attente)}
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
                  <div className="pt-1">
                    <Button
                      size="sm"
                      onClick={() => openDialog(cmd)}
                      className="bg-emerald-600 hover:bg-emerald-700"
                      data-testid={`button-sortie-${cmd.id}`}
                    >
                      <Truck className="h-4 w-4 mr-1.5" />
                      Valider la sortie
                    </Button>
                    <span className="text-xs text-muted-foreground ml-3">Créée {formatDateTime(cmd.t0)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Dialog de validation sortie */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-emerald-600" />
              Validation sortie — {selectedCmd?.numExpedition}
            </DialogTitle>
          </DialogHeader>

          {selectedCmd && (
            <div className="space-y-5">
              {/* Alerte retard */}
              {horsDelai && (
                <div className="flex items-start gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md p-3">
                  <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
                      Livraison hors délai — {formatDuree(totalService)}
                    </p>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                      Veuillez indiquer le(s) motif(s) de retard ci-dessous.
                    </p>
                  </div>
                </div>
              )}

              <Separator />

              {/* Section 1 : Véhicule & Chauffeur */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Car className="h-4 w-4 text-muted-foreground" />
                  Véhicule & Chauffeur
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="plaque" className="text-xs">Plaque d'immatriculation *</Label>
                    <Input
                      id="plaque"
                      placeholder="DK-1234-A"
                      value={sortieData.plaqueImmatriculation}
                      onChange={(e) => setSortieData((p) => ({ ...p, plaqueImmatriculation: e.target.value.toUpperCase() }))}
                      className="font-mono uppercase"
                      data-testid="input-plaque"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="chauffeur" className="text-xs">
                      <User className="h-3.5 w-3.5 inline mr-1" />
                      Nom du chauffeur
                    </Label>
                    <Input
                      id="chauffeur"
                      placeholder="Prénom Nom"
                      value={sortieData.nomChauffeur}
                      onChange={(e) => setSortieData((p) => ({ ...p, nomChauffeur: e.target.value }))}
                      data-testid="input-chauffeur"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Section 2 : Bon de Livraison */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-muted-foreground" />
                  Bon de Livraison (BL)
                </h3>

                {/* N° BL + scan QR */}
                <div className="space-y-1.5">
                  <Label className="text-xs">N° BL * (saisie manuelle ou scan QR code)</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="BL-2504664 ou scanner le QR code…"
                      value={sortieData.numeroBL}
                      onChange={(e) => handleQrInput(e.target.value)}
                      className="font-mono"
                      data-testid="input-numero-bl"
                      autoFocus={scanning}
                    />
                    <Button
                      type="button"
                      variant={scanning ? "default" : "outline"}
                      size="icon"
                      onClick={() => {
                        setScanning(!scanning);
                        // Focus l'input pour capter le scan clavier du douchette
                        setTimeout(() => blInputRef.current?.focus(), 100);
                      }}
                      title="Mode scan douchette QR"
                      data-testid="button-scan-qr"
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  </div>
                  {scanning && (
                    <p className="text-xs text-sky-600 dark:text-sky-400 flex items-center gap-1">
                      <QrCode className="h-3.5 w-3.5" />
                      Mode scan actif — pointez la douchette vers le QR code du BL
                    </p>
                  )}
                </div>

                {/* Photo / scan du BL */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Photo du BL (facultatif)</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-photo-bl"
                    >
                      <Camera className="h-4 w-4 mr-1.5" />
                      {photoPreview ? "Changer la photo" : "Prendre / importer une photo"}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handlePhotoCapture}
                    />
                  </div>
                  {photoPreview && (
                    <div className="relative mt-2">
                      <img
                        src={photoPreview}
                        alt="BL scanné"
                        className="w-full max-h-48 object-contain rounded-md border bg-muted"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2 h-7 px-2 text-xs"
                        onClick={() => {
                          setPhotoPreview(null);
                          setSortieData((p) => ({ ...p, photoBlUrl: "" }));
                        }}
                      >
                        Supprimer
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 3 : Motifs retard (si hors délai) */}
              {horsDelai && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-orange-600 dark:text-orange-400">
                      <AlertTriangle className="h-4 w-4" />
                      Motif(s) de retard *
                    </h3>
                    <div className="space-y-3">
                      {Object.entries(motifsByCategorie).map(([cat, items]) => (
                        <div key={cat}>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">{CATEGORIE_LABELS[cat] || cat}</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {items.map((m) => (
                              <label
                                key={m.id}
                                className={cn(
                                  "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer transition-colors",
                                  sortieData.motifRetard.includes(m.libelle)
                                    ? "border-orange-400 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                                    : "border-border hover:bg-muted/50"
                                )}
                              >
                                <Checkbox
                                  checked={sortieData.motifRetard.includes(m.libelle)}
                                  onCheckedChange={() => toggleMotif(m.libelle)}
                                />
                                {m.libelle}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <Textarea
                      placeholder="Commentaire complémentaire sur le retard…"
                      rows={2}
                      className="resize-none text-sm"
                      value={sortieData.commentaireRetard}
                      onChange={(e) => setSortieData((p) => ({ ...p, commentaireRetard: e.target.value }))}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={closeDialog}>Annuler</Button>
            <Button
              onClick={() => selectedCmd && validerSortie.mutate({ id: selectedCmd.id, data: sortieData })}
              disabled={validerSortie.isPending || !canSubmit || (horsDelai && sortieData.motifRetard.length === 0)}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-confirm-sortie"
            >
              {validerSortie.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Enregistrement…</>
                : <><ShieldCheck className="h-4 w-4 mr-1.5" />Confirmer la sortie</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
