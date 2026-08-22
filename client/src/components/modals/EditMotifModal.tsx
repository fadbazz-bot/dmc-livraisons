import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

interface Props {
  /** ID si modification, sinon création */
  id?: string;
  /** Libellé initial (modification) */
  initialLibelle?: string;
  initialCategorie?: string;
  /** Domaine du motif : magasin ou flotte (impacte l'endpoint appelé) */
  domain: "magasin" | "flotte";
  /** Fonctions API à utiliser */
  addFn: (libelle: string, categorie?: string) => Promise<{ ok: true }>;
  updateFn: (input: { id: string; libelle?: string; categorie?: string; actif?: boolean }) => Promise<{ ok: true }>;
  /** Catégories prédéfinies (selon domaine) */
  categories: string[];
  /** Clé React Query à invalider */
  queryKey: string;
  open: boolean;
  onClose: () => void;
}

export function EditMotifModal({
  id,
  initialLibelle = "",
  initialCategorie = "",
  domain,
  addFn,
  updateFn,
  categories,
  queryKey,
  open,
  onClose,
}: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const [libelle, setLibelle] = useState(initialLibelle);
  const [categorie, setCategorie] = useState(initialCategorie || categories[0] || "");

  const isEdit = !!id;

  const m = useMutation({
    mutationFn: () => {
      if (isEdit) return updateFn({ id: id!, libelle: libelle.trim(), categorie });
      return addFn(libelle.trim(), categorie);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Motif modifié" : "Motif ajouté");
      qc.invalidateQueries({ queryKey: [queryKey] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!libelle.trim()) {
      toast.error("Libellé obligatoire");
      return;
    }
    m.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Modifier motif ${domain}` : `Nouveau motif ${domain}`}
      size="md"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={m.isPending}>
            Annuler
          </button>
          <button type="submit" form="form-motif" className="btn-primary gap-2" disabled={m.isPending}>
            <Save className="h-4 w-4" />
            {m.isPending ? "Enregistrement…" : isEdit ? "Enregistrer" : "Ajouter"}
          </button>
        </>
      }
    >
      <form id="form-motif" onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="libelle" className="label">
            Libellé <span className="text-red-500">*</span>
          </label>
          <input
            id="libelle"
            type="text"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Ex. Rupture de stock, LOI 10H, etc."
            autoComplete="off"
            autoFocus
            className="input"
          />
        </div>
        <div>
          <label htmlFor="categorie" className="label">Catégorie</label>
          <select
            id="categorie"
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
            className="input"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </form>
    </Modal>
  );
}
