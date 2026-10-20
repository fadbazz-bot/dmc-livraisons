import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, PackageCheck, PackageX } from "lucide-react";
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

/** Découpe "CV-MC123 / CV-MC456 / ..." en tableau de N° propres. */
function splitNumCmdNav(str: string): string[] {
  return str
    .split(/[/,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Action côté responsable magasin (flux v3) :
 * le client lui remet son code PIN, le responsable le saisit → chargement enclenché.
 *
 * Chargement partiel : si la demande regroupe plusieurs N° commande NAV et que
 * le véhicule ne peut pas tout emporter, le responsable décoche les commandes
 * qui restent au magasin. Un reliquat (nouveau code, nouvelle attente) est
 * créé automatiquement pour elles — pas besoin que le commercial recrée une
 * demande.
 */
export function SaisieCodeModal({ exp, open, onClose }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [pin, setPin] = useState("");

  const commandes = useMemo(() => splitNumCmdNav(exp.numCmdNav || ""), [exp.numCmdNav]);
  const isMultiple = commandes.length > 1;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(commandes));

  const toutSelectionne = selected.size === commandes.length;
  const nbRestantes = commandes.length - selected.size;

  function toggle(cmd: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cmd)) next.delete(cmd);
      else next.add(cmd);
      return next;
    });
  }

  const m = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Session expirée");
      return api.jalons.saisieCode(exp.id, {
        acteurEmail: user.email,
        acteurNom: user.nom,
        codeRetraitSaisi: pin.trim(),
        // On ne transmet la sélection que si elle a du sens (plusieurs
        // commandes ET pas toutes sélectionnées) — sinon comportement normal.
        commandesChargees: isMultiple ? Array.from(selected) : undefined,
      });
    },
    onSuccess: (res) => {
      if (res.reliquat) {
        toast.success(
          `Chargement partiel validé — reliquat créé (${res.reliquat.numCmdNav}), ` +
            `nouveau code : ${res.reliquat.codeRetrait}`,
        );
      } else {
        toast.success("Code validé — le chargement est enclenché");
      }
      qc.invalidateQueries({ queryKey: ["expeditions"] });
      setPin("");
      setSelected(new Set(commandes));
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
    if (isMultiple && selected.size === 0) {
      toast.error("Sélectionne au moins une commande chargée sur ce véhicule.");
      return;
    }
    m.mutate();
  }

  function handleClose() {
    setPin("");
    setSelected(new Set(commandes));
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="🔐 Saisie du code de livraison"
      description="Le client te remet le code reçu du commercial."
      size={isMultiple ? "lg" : "md"}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={handleClose} disabled={m.isPending}>
            Annuler
          </button>
          <button
            type="submit"
            form="form-saisie-code"
            className="btn-primary gap-2"
            disabled={m.isPending || pin.length !== 4 || (isMultiple && selected.size === 0)}
          >
            <KeyRound className="h-4 w-4" />
            {m.isPending
              ? "Validation…"
              : toutSelectionne
                ? "Valider et enclencher"
                : `Valider (${selected.size}/${commandes.length}) et créer le reliquat`}
          </button>
        </>
      }
    >
      <form id="form-saisie-code" onSubmit={onSubmit} className="space-y-4">
        <ExpInfoBlock exp={exp} />

        {isMultiple && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">
                Commandes effectivement chargées sur ce véhicule
              </label>
              <button
                type="button"
                onClick={() =>
                  setSelected(toutSelectionne ? new Set() : new Set(commandes))
                }
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                {toutSelectionne ? "Tout décocher" : "Tout sélectionner"}
              </button>
            </div>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {commandes.map((c) => {
                const checked = selected.has(c);
                return (
                  <label
                    key={c}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer transition-colors",
                      checked ? "bg-emerald-50" : "bg-white hover:bg-slate-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(c)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-900 focus:ring-brand-400"
                    />
                    <span className="font-mono flex-1">{c}</span>
                    {checked ? (
                      <PackageCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <PackageX className="h-4 w-4 text-slate-300 shrink-0" />
                    )}
                  </label>
                );
              })}
            </div>
            {nbRestantes > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mt-2">
                {nbRestantes} commande(s) resteront au magasin : un nouveau code de retrait sera
                généré automatiquement et le commercial en sera notifié.
              </p>
            )}
          </div>
        )}

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
