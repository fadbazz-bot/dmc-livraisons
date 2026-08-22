import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
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
 * Action UNIQUE côté responsable magasin (flux v3) :
 * le client lui remet son code PIN, le responsable le saisit → chargement enclenché.
 * Remplace les 4 anciennes actions (arrivée guichet, T1, T2, chargement fini).
 */
export function SaisieCodeModal({ exp, open, onClose }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [pin, setPin] = useState("");

  const m = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Session expirée");
      return api.jalons.saisieCode(exp.id, {
        acteurEmail: user.email,
        acteurNom: user.nom,
        codeRetraitSaisi: pin.trim(),
      });
    },
    onSuccess: () => {
      toast.success("Code validé — le chargement est enclenché");
      qc.invalidateQueries({ queryKey: ["expeditions"] });
      setPin("");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur inconnue"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pin.trim().length !== 4) {
      toast.error("Le code PIN doit faire 4 chiffres.");
      return;
    }
    m.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setPin("");
        onClose();
      }}
      title="🔐 Saisie du code de livraison"
      description="Le client te remet le code reçu du commercial."
      footer={
        <>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setPin("");
              onClose();
            }}
            disabled={m.isPending}
          >
            Annuler
          </button>
          <button
            type="submit"
            form="form-saisie-code"
            className="btn-primary gap-2"
            disabled={m.isPending || pin.length !== 4}
          >
            <KeyRound className="h-4 w-4" />
            {m.isPending ? "Validation…" : "Valider et enclencher"}
          </button>
        </>
      }
    >
      <form id="form-saisie-code" onSubmit={onSubmit} className="space-y-4">
        <ExpInfoBlock exp={exp} />

        <div>
          <label htmlFor="pin-saisie" className="label">
            Code à 4 chiffres <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              id="pin-saisie"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              autoFocus
              autoComplete="off"
              placeholder="1234"
              className="input pl-9 text-center text-2xl tracking-[0.8em] font-mono font-bold"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Si le code n'est pas reconnu, le client doit retourner voir le commercial qui a créé la
            commande pour le revérifier.
          </p>
        </div>
      </form>
    </Modal>
  );
}
