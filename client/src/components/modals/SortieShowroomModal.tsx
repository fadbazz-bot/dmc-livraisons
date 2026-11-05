import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { api } from "@/api/appsScript";
import type { Expedition } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { ExpInfoBlock } from "@/components/modals/ExpInfoBlock";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { formatDuree } from "@/lib/format";

interface Props {
  exp: Expedition;
  open: boolean;
  onClose: () => void;
}

export function SortieShowroomModal({ exp, open, onClose }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const m = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Session expirée");
      return api.jalons.sortieShowroom(exp.id, {
        acteurEmail: user.email,
        acteurNom: user.nom,
      });
    },
    onSuccess: (res) => {
      const msg = res.enRetard
        ? `Sortie validée — retard ${res.dureeMin} min, justification requise`
        : `Sortie validée — ${res.dureeMin} min, dans les temps`;
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["expeditions"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur inconnue"),
  });

  // Temps de service : depuis l'entrée du client sur place (pas depuis l'annonce du commercial)
  const debutService = exp.tEntreeSite ?? exp.t0;
  const ecoule =
    debutService !== null ? Math.round((Date.now() - new Date(debutService).getTime()) / 60000) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sortie showroom"
      description="Valide la sortie du client — la commande est terminée."
      size="md"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={m.isPending}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-primary gap-1.5"
            onClick={() => m.mutate()}
            disabled={m.isPending}
          >
            <LogOut className="h-4 w-4" />
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
            <div className="text-xs font-medium opacity-75">Temps depuis l'entrée du client</div>
            <div className="text-lg font-bold mt-0.5">{formatDuree(ecoule)}</div>
            {ecoule > 30 && (
              <div className="text-xs mt-1">Sortie marquée en retard — le responsable devra justifier.</div>
            )}
          </div>
        )}

        <p className="text-sm text-slate-600">
          Le client quitte le showroom avec sa commande. Aucune photo requise.
        </p>
      </div>
    </Modal>
  );
}

