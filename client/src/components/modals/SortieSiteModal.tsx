import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { api } from "@/api/appsScript";
import type { Expedition } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { ExpInfoBlock } from "@/components/modals/ExpInfoBlock";
import { MultiPhotoCapture } from "@/components/MultiPhotoCapture";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { formatDuree } from "@/lib/format";

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

  const m = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Session expirée");
      return api.jalons.sortieSite(exp.id, {
        acteurEmail: user.email,
        acteurNom: user.nom,
        photosVehiculeUrls: photos,
      });
    },
    onSuccess: (res) => {
      const msg = res.enRetard
        ? `Sortie validée — ⚠️ retard ${res.dureeMin} min, justification requise`
        : `Sortie validée — ✅ ${res.dureeMin} min, dans les temps`;
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["expeditions"] });
      setPhotos([]);
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur inconnue"),
  });

  // Calcul du temps écoulé depuis T0
  const ecoule =
    exp.t0 !== null
      ? Math.round((Date.now() - new Date(exp.t0).getTime()) / 60000)
      : null;

  const canSubmit = photos.length > 0 && !m.isPending;

  return (
    <Modal
      open={open}
      onClose={() => {
        setPhotos([]);
        onClose();
      }}
      title="🚗 Valider la sortie"
      description="Au moins une photo du véhicule chargé est obligatoire."
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
          label="Photos du véhicule chargé"
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
