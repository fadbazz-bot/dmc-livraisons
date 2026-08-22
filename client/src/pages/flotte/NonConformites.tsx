import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, AlertTriangle } from "lucide-react";
import { api } from "@/api/appsScript";
import type { LivraisonFlotte } from "@/types/domain";
import { FlotteLayout } from "@/components/FlotteLayout";
import { EditSuiviModal } from "@/components/modals/EditSuiviModal";
import { DateRange } from "@/pages/flotte/Effectuees";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

/**
 * Vue dédiée aux non-conformités : livraisons en retard de date OU LOI 10h.
 * Le responsable flotte clique sur la ligne pour justifier (motif + commentaire).
 */
export default function NonConformitesPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateDebut, setDateDebut] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [dateFin, setDateFin] = useState(today);
  const [editing, setEditing] = useState<LivraisonFlotte | null>(null);

  const { data: livraisons = [], isLoading, error } = useQuery({
    queryKey: ["flotte-livraisons", "non-conformes", dateDebut, dateFin],
    queryFn: () => api.flotteLivraisons.list({ dateDebut, dateFin, conformite: "non_conforme" }),
  });

  const sansJustif = useMemo(
    () => livraisons.filter((l) => !l.motifRetard).length,
    [livraisons],
  );

  return (
    <FlotteLayout
      subtitle={`${livraisons.length} non-conformités · ${sansJustif} sans justification`}
      rightSlot={
        <DateRange dateDebut={dateDebut} dateFin={dateFin} onDebut={setDateDebut} onFin={setDateFin} />
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>Non-conformités</strong> = livraisons en retard sur la date prévue OU départ après 10h (LOI 10h).
            Le responsable flotte doit justifier chaque ligne par un motif et un commentaire.
          </div>
        </div>

        {isLoading ? (
          <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>
        ) : error ? (
          <div className="card p-6 border-red-200 bg-red-50 text-sm text-red-700">
            {error instanceof Error ? error.message : "Erreur"}
          </div>
        ) : livraisons.length === 0 ? (
          <div className="card p-10 text-center text-sm text-slate-500">
            🎉 Aucune non-conformité sur la période. Bon boulot !
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Commande créée</th>
                    <th className="px-3 py-2.5 text-left">Prévue</th>
                    <th className="px-3 py-2.5 text-left">Réelle</th>
                    <th className="px-3 py-2.5 text-left">Type</th>
                    <th className="px-3 py-2.5 text-left">N° cmd</th>
                    <th className="px-3 py-2.5 text-left">Client</th>
                    <th className="px-3 py-2.5 text-left">Commercial</th>
                    <th className="px-3 py-2.5 text-left">Dépôt</th>
                    <th className="px-3 py-2.5 text-left">Chauffeur</th>
                    <th className="px-3 py-2.5 text-left">Motif</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {livraisons.map((l) => (
                    <tr
                      key={l.id}
                      className={cn(
                        "hover:bg-slate-50/60 cursor-pointer",
                        !l.motifRetard && "bg-red-50/30",
                      )}
                      onClick={() => setEditing(l)}
                    >
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {l.t0 ? formatDateTime(l.t0) : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{l.dateLivraisonPrevue || "—"}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-700">{l.dateLivraisonReelle || "—"}</td>
                      <td className="px-3 py-2">
                        {l.loi10h && <span className="badge-danger text-[10px]">LOI 10h</span>}
                        {l.conformite === "retard" && (
                          <span className="badge-danger text-[10px] ml-1">Retard</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">{l.numCmdNav || "—"}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{l.nomClient || "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">
                        {l.commercialNom || (l.commercialEmail ? l.commercialEmail.split("@")[0] : "—")}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{l.zone}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">{l.chauffeurNom || "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 max-w-[200px] truncate" title={l.motifRetard}>
                        {l.motifRetard ? (
                          l.motifRetard
                        ) : (
                          <span className="italic text-red-600">À justifier</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Pencil className="h-3.5 w-3.5 text-slate-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editing && <EditSuiviModal livraison={editing} open onClose={() => setEditing(null)} />}
    </FlotteLayout>
  );
}
