import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
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

type Decision = "valider" | "contredire";

/**
 * Modal de validation/contestation d'un justificatif — côté contrôleur.
 */
export function ValiderJustifModal({ exp, open, onClose }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [decision, setDecision] = useState<Decision>("valider");
  const [commentaire, setCommentaire] = useState("");

  const m = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Session expirée");
      if (decision === "valider") {
        return api.retards.valider({
          expId: exp.id,
          controleurEmail: user.email,
          commentaire: commentaire.trim() || undefined,
        });
      }
      return api.retards.contredire({
        expId: exp.id,
        controleurEmail: user.email,
        commentaire: commentaire.trim(),
      });
    },
    onSuccess: () => {
      toast.success(decision === "valider" ? "Justificatif validé" : "Justificatif contredit");
      qc.invalidateQueries({ queryKey: ["retards-a-valider"] });
      qc.invalidateQueries({ queryKey: ["expeditions"] });
      setCommentaire("");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (decision === "contredire" && !commentaire.trim()) {
      toast.error("Un commentaire est obligatoire pour contredire.");
      return;
    }
    m.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setCommentaire("");
        onClose();
      }}
      title="Valider le justificatif"
      description={`${exp.numCmdNav || "—"} · ${exp.nomClient || "—"}`}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={m.isPending}>
            Annuler
          </button>
          <button
            type="submit"
            form="form-controleur"
            className={cn(
              "btn gap-2",
              decision === "valider" ? "btn-primary" : "btn-danger",
            )}
            disabled={m.isPending}
          >
            {decision === "valider" ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                {m.isPending ? "Validation…" : "Valider"}
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" />
                {m.isPending ? "Envoi…" : "Contredire"}
              </>
            )}
          </button>
        </>
      }
    >
      <form id="form-controleur" onSubmit={onSubmit} className="space-y-4">
        <ExpInfoBlock exp={exp} />

        {/* Justificatif soumis par le responsable */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
          <div>
            <div className="text-xs text-slate-500">Motif(s) déclaré(s)</div>
            <div className="text-sm font-medium text-slate-900">
              {exp.motifRetard || <span className="italic text-slate-400">— aucun —</span>}
            </div>
          </div>
          {exp.commentaireRetard && (
            <div>
              <div className="text-xs text-slate-500">Commentaire responsable</div>
              <div className="text-sm text-slate-700 whitespace-pre-wrap">
                {exp.commentaireRetard}
              </div>
            </div>
          )}
        </div>

        {/* Décision */}
        <div>
          <label className="label">Ta décision</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDecision("valider")}
              className={cn(
                "flex items-center gap-2 p-3 rounded-lg border text-left transition-all",
                decision === "valider"
                  ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
                  : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <CheckCircle2 className={cn("h-5 w-5", decision === "valider" ? "text-emerald-600" : "text-slate-400")} />
              <div className="min-w-0 flex-1">
                <div className={cn("text-sm font-semibold", decision === "valider" ? "text-emerald-900" : "text-slate-900")}>
                  Valider
                </div>
                <div className="text-xs text-slate-500">Justificatif accepté</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setDecision("contredire")}
              className={cn(
                "flex items-center gap-2 p-3 rounded-lg border text-left transition-all",
                decision === "contredire"
                  ? "border-red-500 bg-red-50 ring-2 ring-red-200"
                  : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <XCircle className={cn("h-5 w-5", decision === "contredire" ? "text-red-600" : "text-slate-400")} />
              <div className="min-w-0 flex-1">
                <div className={cn("text-sm font-semibold", decision === "contredire" ? "text-red-900" : "text-slate-900")}>
                  Contredire
                </div>
                <div className="text-xs text-slate-500">Justificatif refusé</div>
              </div>
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="commentaire" className="label">
            Commentaire {decision === "contredire" && <span className="text-red-500">*</span>}
          </label>
          <textarea
            id="commentaire"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={3}
            placeholder={
              decision === "valider"
                ? "Optionnel : note à l'attention du responsable…"
                : "Obligatoire : explique pourquoi tu contredis le justificatif…"
            }
            className="input"
          />
          {decision === "contredire" && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Le responsable recevra une notification avec ton commentaire.
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
