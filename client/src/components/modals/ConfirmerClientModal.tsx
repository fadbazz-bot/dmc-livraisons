import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Expedition } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { clientsProches } from "@/lib/similarite";
import { formatRelative } from "@/lib/format";

interface Props {
  exp: Expedition;
  /** Les autres expéditions en attente (pour repérer les noms qui se ressemblent). */
  voisins: Expedition[];
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Dernier garde-fou avant l'entrée : le nom du client en très grand, et une alerte
 * s'il existe un autre client en attente dont le nom ressemble (à une lettre près…).
 * Dans ce cas, il faut cocher « j'ai vérifié avec le chauffeur » pour continuer.
 */
export function ConfirmerClientModal({ exp, voisins, onConfirm, onClose }: Props) {
  const proches = clientsProches(exp, voisins);
  const [verifie, setVerifie] = useState(false);
  const bloque = proches.length > 0 && !verifie;

  return (
    <Modal
      open
      onClose={onClose}
      title="C'est bien ce client ?"
      description="Vérifie le nom avec le chauffeur avant de continuer."
      size="md"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>Non, retour</button>
          <button type="button" className="btn-primary gap-1.5" disabled={bloque} onClick={onConfirm}>
            <CheckCircle2 className="h-4 w-4" /> Oui, c'est lui
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border-2 border-brand-900 bg-brand-50 px-4 py-5 text-center">
          <div className="text-2xl font-bold text-brand-900 break-words" data-testid="client-confirme">
            {exp.nomClient || "Client inconnu"}
          </div>
          <div className="mt-2 text-sm text-slate-700">
            {exp.zone}
            {exp.nomActeurCommercial && <> · commercial : {exp.nomActeurCommercial}</>}
          </div>
          <div className="text-xs text-slate-500">Préparée {formatRelative(exp.t0)}</div>
        </div>

        {proches.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" /> Attention : un nom très proche attend aussi
            </div>
            <ul className="mt-1.5 list-disc pl-5 space-y-0.5">
              {proches.map((n) => <li key={n} className="font-medium">{n}</li>)}
            </ul>
            <label className="mt-3 flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={verifie} onChange={(e) => setVerifie(e.target.checked)} />
              <span>
                J'ai demandé au chauffeur : c'est bien <strong>{exp.nomClient}</strong>, pas un des noms ci-dessus.
              </span>
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}
