import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Truck } from "lucide-react";
import { api } from "@/api/appsScript";
import type { ChauffeurFlotte } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

interface Props {
  existing?: ChauffeurFlotte;
  open: boolean;
  onClose: () => void;
}

const SITES = ["", "Dakar", "Diamniadio"];

export function EditChauffeurModal({ existing, open, onClose }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const isEdit = !!existing;
  const [nom, setNom] = useState(existing?.nom ?? "");
  const [plaque, setPlaque] = useState(existing?.plaque ?? "");
  const [site, setSite] = useState(existing?.site ?? "");
  const [telephone, setTelephone] = useState(existing?.telephone ?? "");
  const [actif, setActif] = useState(existing?.actif ?? true);

  const m = useMutation({
    mutationFn: () => {
      if (isEdit) {
        return api.flotteChauffeurs.update({
          id: existing!.id,
          nom: nom.trim(),
          plaque: plaque.trim().toUpperCase(),
          site,
          telephone: telephone.trim(),
          actif,
        });
      }
      return api.flotteChauffeurs.add({
        nom: nom.trim(),
        plaque: plaque.trim().toUpperCase(),
        site,
        telephone: telephone.trim(),
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Chauffeur modifié" : "Chauffeur ajouté");
      qc.invalidateQueries({ queryKey: ["flotte-chauffeurs"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nom.trim() || !plaque.trim()) {
      toast.error("Nom et plaque obligatoires");
      return;
    }
    m.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Modifier ${existing.nom}` : "Nouveau chauffeur"}
      size="md"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={m.isPending}>
            Annuler
          </button>
          <button type="submit" form="form-chauffeur" className="btn-primary gap-2" disabled={m.isPending}>
            <Save className="h-4 w-4" />
            {m.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <form id="form-chauffeur" onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="nom" className="label">Nom complet <span className="text-red-500">*</span></label>
          <input
            id="nom"
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Hafia Seck"
            autoFocus
            className="input"
          />
        </div>
        <div>
          <label htmlFor="plaque" className="label">Plaque <span className="text-red-500">*</span></label>
          <div className="relative">
            <Truck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              id="plaque"
              type="text"
              value={plaque}
              onChange={(e) => setPlaque(e.target.value.toUpperCase())}
              placeholder="AA 642 NB"
              autoComplete="off"
              className="input pl-9 uppercase tracking-wider"
            />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="site" className="label">Site</label>
            <select id="site" value={site} onChange={(e) => setSite(e.target.value)} className="input">
              {SITES.map((s) => (
                <option key={s} value={s}>{s || "— Aucun —"}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tel" className="label">Téléphone</label>
            <input
              id="tel"
              type="tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="77 123 45 67"
              className="input"
            />
          </div>
        </div>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
            <span>Actif</span>
          </label>
        )}
      </form>
    </Modal>
  );
}
