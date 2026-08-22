import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, User, Phone } from "lucide-react";
import { api } from "@/api/appsScript";
import type { Expedition } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { ExpInfoBlock } from "@/components/modals/ExpInfoBlock";
import { PhotoCapture } from "@/components/PhotoCapture";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";

interface Props {
  exp: Expedition;
  open: boolean;
  onClose: () => void;
}

export function EntreeSiteModal({ exp, open, onClose }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [plaque, setPlaque] = useState("");
  const [chauffeur, setChauffeur] = useState("");
  const [tel, setTel] = useState("");
  const [photoPlaque, setPhotoPlaque] = useState<string | null>(null);
  const [photoPermis, setPhotoPermis] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Session expirée");
      return api.jalons.entreeSite(exp.id, {
        acteurEmail: user.email,
        acteurNom: user.nom,
        plaque: plaque.trim().toUpperCase(),
        chauffeur: chauffeur.trim(),
        numeroChauffeur: tel.trim() || undefined,
        photoPlaqueUrl: photoPlaque ?? undefined,
        photoPermisUrl: photoPermis ?? undefined,
      });
    },
    onSuccess: () => {
      toast.success(`Entrée site enregistrée — ${plaque.trim().toUpperCase()}`);
      qc.invalidateQueries({ queryKey: ["expeditions"] });
      reset();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur inconnue"),
  });

  function reset() {
    setPlaque("");
    setChauffeur("");
    setTel("");
    setPhotoPlaque(null);
    setPhotoPermis(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!plaque.trim() || !chauffeur.trim()) {
      toast.error("Plaque et chauffeur obligatoires.");
      return;
    }
    if (!photoPlaque) {
      toast.error("Photo de la plaque obligatoire.");
      return;
    }
    if (!photoPermis) {
      toast.error("Photo de la pièce d'identité / permis obligatoire.");
      return;
    }
    m.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="🚛 Entrée site"
      description="Enregistre l'arrivée du camion et démarre le chrono."
      size="lg"
      footer={
        <>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={m.isPending}
          >
            Annuler
          </button>
          <button
            type="submit"
            form="form-entree-site"
            className="btn-primary"
            disabled={m.isPending}
          >
            {m.isPending ? "Enregistrement…" : "Valider l'entrée"}
          </button>
        </>
      }
    >
      <form id="form-entree-site" onSubmit={onSubmit} className="space-y-4">
        <ExpInfoBlock exp={exp} />

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="plaque" className="label">Plaque <span className="text-red-500">*</span></label>
            <div className="relative">
              <Truck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="plaque"
                type="text"
                value={plaque}
                onChange={(e) => setPlaque(e.target.value.toUpperCase())}
                placeholder="DK 1234 AA"
                autoFocus
                autoComplete="off"
                className="input pl-9 uppercase tracking-wider"
              />
            </div>
          </div>
          <div>
            <label htmlFor="chauffeur" className="label">Nom chauffeur <span className="text-red-500">*</span></label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="chauffeur"
                type="text"
                value={chauffeur}
                onChange={(e) => setChauffeur(e.target.value)}
                placeholder="Mamadou Diop"
                autoComplete="off"
                className="input pl-9"
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="tel" className="label">Téléphone chauffeur</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              id="tel"
              type="tel"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              placeholder="77 123 45 67"
              autoComplete="off"
              className="input pl-9"
            />
          </div>
        </div>

        {/* Photos — sécurité et traçabilité */}
        <div className="pt-2 border-t border-slate-100">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Pièces à photographier (obligatoire pour sécurité)
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <PhotoCapture
              label="Plaque du véhicule"
              hint="Doit être lisible"
              value={photoPlaque}
              onChange={setPhotoPlaque}
              required
            />
            <PhotoCapture
              label="Pièce d'identité / permis"
              hint="Du chauffeur"
              value={photoPermis}
              onChange={setPhotoPermis}
              required
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
