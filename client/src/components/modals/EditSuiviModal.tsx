import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Truck } from "lucide-react";
import { api } from "@/api/appsScript";
import type { EtatLivraison, LivraisonFlotte } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

interface Props {
  livraison: LivraisonFlotte;
  open: boolean;
  onClose: () => void;
}

const ETATS: { value: EtatLivraison; label: string; className: string }[] = [
  { value: "en_attente", label: "En attente",  className: "border-slate-300" },
  { value: "livre",      label: "Livré",       className: "border-emerald-500 bg-emerald-50" },
  { value: "partiel",    label: "Partiel",     className: "border-amber-500 bg-amber-50" },
  { value: "non_livre",  label: "Non livré",   className: "border-red-500 bg-red-50" },
  { value: "recupere",   label: "Récupéré",    className: "border-blue-500 bg-blue-50" },
];

/**
 * Modal d'édition du suivi d'une livraison flotte interne (responsable chauffeurs).
 * Champs : motif retard (multi-select), commentaire libre, état, chauffeur assigné.
 */
export function EditSuiviModal({ livraison, open, onClose }: Props) {
  const toast = useToast();
  const qc = useQueryClient();

  const [etat, setEtat] = useState<EtatLivraison>(livraison.etat);
  const [motifsSelected, setMotifsSelected] = useState<Set<string>>(
    new Set(String(livraison.motifRetard || "").split(",").map((s) => s.trim()).filter(Boolean)),
  );
  const [commentaire, setCommentaire] = useState(livraison.commentaire || "");
  const [raisonNonLivre, setRaisonNonLivre] = useState(livraison.raisonNonLivre || "");
  const [chauffeurId, setChauffeurId] = useState(livraison.chauffeurId || "");

  const { data: motifs = [] } = useQuery({
    queryKey: ["flotte-motifs"],
    queryFn: () => api.flotteMotifs.list(),
  });

  const { data: chauffeurs = [] } = useQuery({
    queryKey: ["flotte-chauffeurs"],
    queryFn: () => api.flotteChauffeurs.list(true),
  });

  const saveSuivi = useMutation({
    mutationFn: () =>
      api.flotteLivraisons.updateSuivi({
        expId: livraison.id,
        etat,
        motifRetard: Array.from(motifsSelected).join(", "),
        commentaire,
        raisonNonLivre: etat === "non_livre" || etat === "partiel" ? raisonNonLivre : "",
      }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const assignChauffeur = useMutation({
    mutationFn: () =>
      api.flotteLivraisons.assignChauffeur({ expId: livraison.id, chauffeurId }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  function toggleMotif(libelle: string) {
    setMotifsSelected((prev) => {
      const next = new Set(prev);
      if (next.has(libelle)) next.delete(libelle);
      else next.add(libelle);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await saveSuivi.mutateAsync();
      // Si le chauffeur a changé, on l'assigne
      if (chauffeurId && chauffeurId !== livraison.chauffeurId) {
        await assignChauffeur.mutateAsync();
      }
      toast.success("Suivi mis à jour");
      qc.invalidateQueries({ queryKey: ["flotte-livraisons"] });
      qc.invalidateQueries({ queryKey: ["flotte-kpi"] });
      onClose();
    } catch {
      /* erreur déjà toastée */
    }
  }

  const isLoading = saveSuivi.isPending || assignChauffeur.isPending;
  const isRetard = livraison.conformite === "retard" || livraison.loi10h;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Suivi de la livraison"
      description={`${livraison.numCmdNav || "—"} · ${livraison.nomClient || "—"} · ${livraison.zone}`}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={isLoading}>
            Annuler
          </button>
          <button type="submit" form="form-suivi" className="btn-primary gap-2" disabled={isLoading}>
            <Save className="h-4 w-4" />
            {isLoading ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <form id="form-suivi" onSubmit={onSubmit} className="space-y-4">
        {/* Récap dates */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-slate-200 p-2">
            <div className="text-slate-500">Date prévue</div>
            <div className="font-mono text-slate-900">{livraison.dateLivraisonPrevue || "—"}</div>
          </div>
          <div
            className={cn(
              "rounded-lg border p-2",
              isRetard ? "border-red-300 bg-red-50" : "border-slate-200",
            )}
          >
            <div className="text-slate-500">Date réelle</div>
            <div className="font-mono text-slate-900">
              {livraison.dateLivraisonReelle || "—"}
              {livraison.loi10h && <span className="ml-2 badge-danger">LOI 10h</span>}
              {livraison.conformite === "retard" && <span className="ml-2 badge-danger">Retard</span>}
            </div>
          </div>
        </div>

        {/* État */}
        <div>
          <label className="label">État de livraison</label>
          <div className="grid grid-cols-5 gap-1.5">
            {ETATS.map((e) => (
              <button
                key={e.value}
                type="button"
                onClick={() => setEtat(e.value)}
                className={cn(
                  "py-2 rounded-lg border text-xs font-medium transition-all",
                  etat === e.value ? e.className + " ring-2 ring-brand-200" : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chauffeur */}
        <div>
          <label htmlFor="chauffeur" className="label flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" /> Chauffeur assigné
          </label>
          <select
            id="chauffeur"
            value={chauffeurId}
            onChange={(e) => setChauffeurId(e.target.value)}
            className="input"
          >
            <option value="">— Non assigné —</option>
            {chauffeurs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} · {c.plaque}
              </option>
            ))}
          </select>
        </div>

        {/* Motifs (multi-select) */}
        <div>
          <label className="label">Motifs de retard / non-conformité</label>
          <div className="flex flex-wrap gap-1.5">
            {motifs.map((m) => {
              const sel = motifsSelected.has(m.libelle);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMotif(m.libelle)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                    sel
                      ? "bg-brand-900 text-white border-brand-900"
                      : "bg-white text-slate-700 border-slate-200 hover:border-slate-300",
                  )}
                >
                  {m.libelle}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-1">Coche un ou plusieurs motifs si applicable.</p>
        </div>

        {/* Commentaire */}
        <div>
          <label htmlFor="commentaire" className="label">Commentaire</label>
          <textarea
            id="commentaire"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={3}
            placeholder="Précisions sur la livraison, le retard, la non-conformité…"
            className="input"
          />
        </div>

        {/* Raison si non livré / partiel */}
        {(etat === "non_livre" || etat === "partiel") && (
          <div>
            <label htmlFor="raison" className="label">
              Raison si non livré / partiel <span className="text-red-500">*</span>
            </label>
            <input
              id="raison"
              type="text"
              value={raisonNonLivre}
              onChange={(e) => setRaisonNonLivre(e.target.value)}
              placeholder="Client absent, retour atelier, etc."
              className="input"
            />
          </div>
        )}
      </form>
    </Modal>
  );
}
