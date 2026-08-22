import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Copy, CheckCircle2, AlertCircle, Eye } from "lucide-react";
import { api } from "@/api/appsScript";
import type { Expedition } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { ExpInfoBlock } from "@/components/modals/ExpInfoBlock";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";

interface Props {
  exp: Expedition;
  open: boolean;
  onClose: () => void;
}

/**
 * Modal de consultation du codeRetrait — pour commercial créateur ou admin uniquement.
 * Charge le code à la demande (pas pré-chargé) pour ne jamais l'avoir en cache navigateur.
 * Chaque ouverture déclenche un audit côté backend (EVENEMENTS).
 */
export function CodeRetraitModal({ exp, open, onClose }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const m = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Session expirée");
      return api.expeditions.getCodeRetrait(exp.id, user.email);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur inconnue"),
  });

  // Charge le code dès l'ouverture
  useEffect(() => {
    if (open && !m.data && !m.isPending) {
      m.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleCopy() {
    if (!m.data?.codeRetrait) return;
    navigator.clipboard.writeText(m.data.codeRetrait).then(
      () => {
        setCopied(true);
        toast.success("Code copié");
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast.error("Copie impossible"),
    );
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        m.reset();
        setCopied(false);
        onClose();
      }}
      title="🔐 Code retrait"
      description="Consultation tracée — toute ouverture est enregistrée."
      size="md"
      footer={
        <button type="button" className="btn-primary" onClick={onClose}>
          Fermer
        </button>
      }
    >
      <div className="space-y-3">
        <ExpInfoBlock exp={exp} />

        {m.isPending && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <div className="h-6 w-6 rounded-full border-2 border-slate-300 border-t-brand-900 animate-spin" />
            <p className="text-sm text-slate-500">Récupération du code…</p>
          </div>
        )}

        {m.isError && (
          <div className="flex gap-2 items-start p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">
              {m.error instanceof Error ? m.error.message : "Erreur inconnue"}
            </p>
          </div>
        )}

        {m.data && (
          <>
            <button
              type="button"
              onClick={handleCopy}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 rounded-xl bg-brand-900 text-white hover:bg-brand-700 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <KeyRound className="h-5 w-5 opacity-70" />
                <div className="text-left">
                  <div className="text-[11px] uppercase tracking-wider opacity-70">Code PIN</div>
                  <div className="text-3xl font-mono font-bold tracking-[0.4em] leading-tight">
                    {m.data.codeRetrait}
                  </div>
                </div>
              </div>
              {copied ? (
                <CheckCircle2 className="h-5 w-5 opacity-80" />
              ) : (
                <Copy className="h-5 w-5 opacity-60 group-hover:opacity-100" />
              )}
            </button>

            <div className="flex gap-2 items-start p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <Eye className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                Cette consultation a été enregistrée dans le journal des événements
                (rôle « {m.data.consultedByRole} »). Le responsable peut vérifier
                qui a accédé au code et quand.
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
