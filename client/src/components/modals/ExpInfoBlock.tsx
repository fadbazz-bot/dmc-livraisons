import type { Expedition } from "@/types/domain";

/**
 * Bloc d'info de l'expédition affiché dans toutes les modales d'action.
 * Permet au validateur de re-vérifier qu'il valide la bonne ligne.
 */
export function ExpInfoBlock({ exp }: { exp: Expedition }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
      <div className="flex justify-between gap-2">
        <span className="text-slate-500">N° commande</span>
        <span className="font-mono font-semibold text-slate-900">{exp.numCmdNav || "—"}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-slate-500">Client</span>
        <span className="font-medium text-slate-900 text-right truncate ml-2">{exp.nomClient || "—"}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-slate-500">Magasin</span>
        <span className="text-slate-900">{exp.zone || "—"}</span>
      </div>
      {exp.plaque && (
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">Véhicule</span>
          <span className="text-slate-900">
            {exp.plaque}
            {exp.chauffeur && ` · ${exp.chauffeur}`}
          </span>
        </div>
      )}
      {exp.numeroBL && (
        <div className="flex justify-between gap-2">
          <span className="text-slate-500">N° BL</span>
          <span className="font-mono text-slate-900">{exp.numeroBL}</span>
        </div>
      )}
    </div>
  );
}
