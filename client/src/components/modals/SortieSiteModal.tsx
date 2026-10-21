import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, AlertTriangle } from "lucide-react";
import { api } from "@/api/appsScript";
import type { Expedition } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { ExpInfoBlock } from "@/components/modals/ExpInfoBlock";
import { MultiPhotoCapture } from "@/components/MultiPhotoCapture";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { formatDuree } from "@/lib/format";

/** Doit rester aligné sur CONFIG.PHOTOS_CHARGEMENT_MIN (Code.gs). */
const PHOTOS_MIN = 3;

interface Props {
  exp: Expedition;
  open: boolean;
  onClose: () => void;
}

export function SortieSiteModal({ exp, open, onClose }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [photos, setPhotos] = useState<string[]>([]);
  const [derogation, setDerogation] = useState("");
  const nbChargement = exp.nbPhotosChargement ?? 0;
  // Ancien backend (champ absent) : pas de contrôle, comme avant.
  const photosOk = exp.nbPhotosChargement === undefined || nbChargement >= PHOTOS_MIN;

  const m = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Session expirée");
      return api.jalons.sortieSite(exp.id, {
        acteurEmail: user.email,
        acteurNom: user.nom,
        photosVehiculeUrls: photos,
        derogationMotif: photosOk ? undefined : derogation.trim(),
      });
    },
    onSuccess: (res) => {
      const msg = res.enRetard
        ? `Sortie validée — retard ${res.dureeMin} min, justification requise`
        : `Sortie validée — ${res.dureeMin} min, dans les temps`;
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["expeditions"] });
      setPhotos([]);
      setDerogation("");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur inconnue"),
  });

  // Calcul du temps écoulé depuis T0
  const ecoule =
    exp.t0 !== null
      ? Math.round((Date.now() - new Date(exp.t0).getTime()) / 60000)
      : null;

  const canSubmit = photos.length > 0 && (photosOk || derogation.trim().length >= 5) && !m.isPending;

  return (
    <Modal
      open={open}
      onClose={() => {
        setPhotos([]);
        onClose();
      }}
      title="Valider la sortie"
      description="Photos du livreur vérifiées, puis au moins une photo du véhicule au portail."
      size="lg"
      footer={
        <>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setPhotos([]);
              onClose();
            }}
            disabled={m.isPending}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => m.mutate()}
            className="btn-primary gap-2"
            disabled={!canSubmit}
          >
            <Check className="h-4 w-4" />
            {m.isPending ? "Validation…" : "Valider la sortie"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ExpInfoBlock exp={exp} />

        {photosOk ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900">
            <Camera className="h-4 w-4 shrink-0" />
            <span>
              <strong className="num">{nbChargement}</strong> photos du chargement enregistrées dans Drive par le livreur.
            </span>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Photos de chargement manquantes</strong> ({nbChargement}/{PHOTOS_MIN}). Renvoie le livreur
                les prendre auprès du responsable magasin. Sortie sans photos uniquement en dernier recours :
                le motif sera tracé.
              </span>
            </div>
            <input
              className="input"
              value={derogation}
              onChange={(e) => setDerogation(e.target.value)}
              placeholder="Motif de la dérogation (obligatoire pour sortir sans photos)"
            />
          </div>
        )}

        {ecoule !== null && (
          <div
            className={
              "rounded-lg p-3 border " +
              (ecoule > 30
                ? "bg-red-50 border-red-200 text-red-800"
                : ecoule > 25
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-emerald-50 border-emerald-200 text-emerald-800")
            }
          >
            <div className="text-xs font-medium opacity-75">Temps écoulé depuis instruction</div>
            <div className="text-lg font-bold mt-0.5">{formatDuree(ecoule)}</div>
            {ecoule > 30 && (
              <div className="text-xs mt-1">
                Sortie marquée en retard — le responsable devra justifier.
              </div>
            )}
          </div>
        )}

        <MultiPhotoCapture
          label="Photos du véhicule au portail"
          hint="Vue d'ensemble + détails. Au moins 1, jusqu'à 6 photos."
          values={photos}
          onChange={setPhotos}
          required
          maxPhotos={6}
        />
      </div>
    </Modal>
  );
}
