import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, CheckCircle2, ExternalLink, Loader2, RotateCw, X } from "lucide-react";
import { api } from "@/api/appsScript";
import type { Expedition } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { ExpInfoBlock } from "@/components/modals/ExpInfoBlock";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { compressImage } from "@/lib/imageCompress";
import { cn } from "@/lib/cn";

interface Props {
  exp: Expedition;
  open: boolean;
  onClose: () => void;
}

/** Valeurs par défaut — le serveur renvoie les vraies (CONFIG.PHOTOS_CHARGEMENT_*). */
const MIN_DEFAUT = 3;
const MAX_DEFAUT = 15;

interface Item {
  key: string;
  preview: string;
  status: "envoi" | "ok" | "erreur";
  id?: string;
  dataUrl: string;
}

/** Consignes affichées selon le rang de la photo à prendre. */
function consigne(n: number): string {
  if (n === 0) return "Vue d'ensemble : l'arrière du véhicule chargé, plaque visible si possible.";
  if (n === 1) return "Vue de côté : toute la marchandise visible, rien de caché.";
  if (n === 2) return "Détail : les articles de près (références, quantités lisibles).";
  return "Ajoute des détails : palettes, colis, articles fragiles, sangles / bâche.";
}

/**
 * Photos du chargement, prises par le responsable magasin AVANT de se présenter au poste de garde.
 * Chaque photo est envoyée tout de suite vers Google Drive (dossier de l'expédition) :
 * même si le réseau coupe ensuite, ce qui est parti est sauvegardé. Preuve en cas de
 * contestation "livraison incomplète".
 */
export function PhotosChargementModal({ exp, open, onClose }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const listQ = useQuery({
    queryKey: ["photos-chargement", exp.id],
    queryFn: () => api.photos.list(exp.id),
    enabled: open,
    staleTime: 0,
  });

  const min = listQ.data?.min ?? MIN_DEFAUT;
  const max = listQ.data?.max ?? MAX_DEFAUT;
  const serveurN = (listQ.data?.photos ?? []).filter((p) => p.type === "chargement").length;
  const envoyees = items.filter((i) => i.status === "ok").length;
  // Photos déjà enregistrées (session précédente) + celles de cette session pas encore comptées par le serveur
  const total = Math.max(serveurN, envoyees);
  const enCours = items.some((i) => i.status === "envoi");
  const enErreur = items.some((i) => i.status === "erreur");
  const pret = total >= min && !enCours && !enErreur;

  useEffect(() => {
    if (!open) setItems([]);
  }, [open]);

  async function envoyer(item: Item) {
    if (!user) return;
    setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: "envoi" } : i)));
    try {
      const res = await api.photos.add({
        expId: exp.id,
        dataUrl: item.dataUrl,
        acteurEmail: user.email,
        acteurNom: user.nom,
      });
      setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: "ok", id: res.id } : i)));
      listQ.refetch();
    } catch (e) {
      setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: "erreur" } : i)));
      toast.error(e instanceof Error ? e.message : "Envoi impossible — réessaie.");
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (total + items.filter((i) => i.status !== "ok").length >= max) {
      toast.error(`Maximum ${max} photos.`);
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await compressImage(file, { maxDimension: 1280, quality: 0.8 });
      const item: Item = { key: crypto.randomUUID(), preview: dataUrl, dataUrl, status: "envoi" };
      setItems((prev) => [...prev, item]);
      void envoyer(item);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Photo illisible");
    } finally {
      setBusy(false);
    }
  }

  const retirer = useMutation({
    mutationFn: async (item: Item) => {
      if (!user) throw new Error("Session expirée");
      if (item.id) await api.photos.remove({ photoId: item.id, acteurEmail: user.email, acteurNom: user.nom });
    },
    onSuccess: (_r, item) => {
      setItems((prev) => prev.filter((i) => i.key !== item.key));
      listQ.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Impossible de retirer la photo"),
  });

  const terminer = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Session expirée");
      return api.photos.terminer({ expId: exp.id, acteurEmail: user.email, acteurNom: user.nom });
    },
    onSuccess: (res) => {
      toast.success(`${res.count} photos enregistrées — le véhicule peut passer au poste de garde`);
      qc.invalidateQueries({ queryKey: ["expeditions"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur inconnue"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Photos du chargement"
      description="À faire avant le poste de garde : elles te protègent si le client conteste la livraison."
      size="lg"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={terminer.isPending}>
            Fermer
          </button>
          <button
            type="button"
            className="btn-primary gap-2"
            disabled={!pret || terminer.isPending}
            onClick={() => terminer.mutate()}
          >
            <Check className="h-4 w-4" />
            {terminer.isPending ? "Enregistrement…" : "Terminer"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ExpInfoBlock exp={exp} />

        {/* Compteur */}
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3",
            total >= min ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900",
          )}
        >
          <div className="flex items-center gap-2.5">
            {total >= min ? <CheckCircle2 className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
            <div>
              <div className="text-sm font-semibold">
                <span className="num">{total}</span> / {min} photos minimum
              </div>
              <div className="text-xs opacity-80">
                {total >= min ? "Tu peux en ajouter d'autres, puis terminer." : consigne(total)}
              </div>
            </div>
          </div>
          <span className="text-xs opacity-70">max {max}</span>
        </div>

        {/* Vignettes */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((it) => (
            <div key={it.key} className="relative aspect-square overflow-hidden rounded-lg border border-line bg-slate-100">
              <img src={it.preview} alt="" className="h-full w-full object-cover" />
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-0.5 text-[11px] font-medium text-white",
                  it.status === "ok" && "bg-emerald-600/90",
                  it.status === "envoi" && "bg-slate-700/80",
                  it.status === "erreur" && "bg-red-600/90",
                )}
              >
                {it.status === "envoi" && <><Loader2 className="h-3 w-3 animate-spin" /> Envoi…</>}
                {it.status === "ok" && <><Check className="h-3 w-3" /> Enregistrée</>}
                {it.status === "erreur" && (
                  <button type="button" onClick={() => void envoyer(it)} className="inline-flex items-center gap-1">
                    <RotateCw className="h-3 w-3" /> Réessayer
                  </button>
                )}
              </div>
              {it.status !== "envoi" && (
                <button
                  type="button"
                  onClick={() => (it.status === "ok" ? retirer.mutate(it) : setItems((p) => p.filter((x) => x.key !== it.key)))}
                  className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-slate-700 shadow-sm hover:text-red-600"
                  aria-label="Retirer cette photo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {total < max && (
            <label
              className={cn(
                "flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-brand-300 bg-brand-50 text-brand-800 transition-colors hover:bg-brand-100",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <Camera className="h-6 w-6" />
              <span className="text-xs font-medium">{items.length === 0 && serveurN === 0 ? "Prendre une photo" : "Ajouter"}</span>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPick}
                className="sr-only"
              />
            </label>
          )}
        </div>

        {serveurN > items.filter((i) => i.status === "ok").length && (
          <p className="text-xs text-slate-500">
            {serveurN - items.filter((i) => i.status === "ok").length} photo(s) déjà enregistrée(s) lors d'une ouverture précédente.
          </p>
        )}

        {listQ.data?.folderUrl && (
          <a
            href={listQ.data.folderUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ouvrir le dossier Drive de cette expédition
          </a>
        )}
      </div>
    </Modal>
  );
}
