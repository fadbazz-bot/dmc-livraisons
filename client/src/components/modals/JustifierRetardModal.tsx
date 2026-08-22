import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Save } from "lucide-react";
import { api } from "@/api/appsScript";
import type { Expedition } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { ExpInfoBlock } from "@/components/modals/ExpInfoBlock";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

interface Props {
  exp: Expedition;
  open: boolean;
  onClose: () => void;
}

/**
 * Modal de justification de retard côté responsable magasin.
 * Multi-select des motifs + commentaire libre.
 */
export function JustifierRetardModal({ exp, open, onClose }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [motifs, setMotifs] = useState<Set<string>>(new Set());
  const [commentaire, setCommentaire] = useState("");

  const { data: motifsRef = [] } = useQuery({
    queryKey: ["motifs-retard"],
    queryFn: () => api.referentiels.motifs(),
  });

  const m = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Session expirée");
      return api.retards.justifier({
        expId: exp.id,
        motifRetard: Array.from(motifs),
        commentaireRetard: commentaire.trim() || undefined,
        acteurEmail: user.email,
      });
    },
    onSuccess: () => {
      toast.success("Justificatif envoyé pour validation contrôleur");
      qc.invalidateQueries({ queryKey: ["retards-a-justifier"] });
      qc.invalidateQueries({ queryKey: ["expeditions"] });
      setMotifs(new Set());
      setCommentaire("");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  function toggleMotif(libelle: string) {
    setMotifs((prev) => {
      const next = new Set(prev);
      if (next.has(libelle)) next.delete(libelle);
      else next.add(libelle);
      return next;
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (motifs.size === 0) {
      toast.error("Choisis au moins un motif.");
      return;
    }
    m.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setMotifs(new Set());
        setCommentaire("");
        onClose();
      }}
      title="⚠️ Justifier le retard"
      description="Sélectionne un ou plusieurs motifs et précise si nécessaire."
      size="lg"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={m.isPending}>
            Annuler
          </button>
          <button type="submit" form="form-justif" className="btn-primary gap-2" disabled={m.isPending}>
            <Save className="h-4 w-4" />
            {m.isPending ? "Envoi…" : "Envoyer pour validation"}
          </button>
        </>
      }
    >
      <form id="form-justif" onSubmit={onSubmit} className="space-y-4">
        <ExpInfoBlock exp={exp} />

        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            Cette livraison est sortie en <strong>retard</strong>. Le contrôleur recevra ton
            justificatif et pourra le valider ou le contester.
          </div>
        </div>

        <div>
          <label className="label">Motif(s) <span className="text-red-500">*</span></label>
          <div className="flex flex-wrap gap-1.5">
            {motifsRef.map((mot) => {
              const sel = motifs.has(mot.libelle);
              return (
                <button
                  key={mot.id}
                  type="button"
                  onClick={() => toggleMotif(mot.libelle)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    sel
                      ? "bg-brand-900 text-white border-brand-900"
                      : "bg-white text-slate-700 border-slate-200 hover:border-slate-300",
                  )}
                >
                  {mot.libelle}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Tu peux cocher plusieurs motifs si applicable.
          </p>
        </div>

        <div>
          <label htmlFor="commentaire" className="label">Commentaire</label>
          <textarea
            id="commentaire"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={3}
            placeholder="Précisions sur la cause du retard…"
            className="input"
          />
        </div>
      </form>
    </Modal>
  );
}
