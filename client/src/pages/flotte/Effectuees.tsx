import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Pencil, Calendar } from "lucide-react";
import { api } from "@/api/appsScript";
import type { LivraisonFlotte } from "@/types/domain";
import { FlotteLayout } from "@/components/FlotteLayout";
import { EditSuiviModal } from "@/components/modals/EditSuiviModal";
import { cn, includesLower } from "@/lib/cn";

/**
 * Livraisons flotte terminées (T_SORTIE_SITE renseigné).
 * Édition motif / commentaire / état possible par le responsable flotte.
 */
export default function EffectueesPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateDebut, setDateDebut] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [dateFin, setDateFin] = useState(today);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<LivraisonFlotte | null>(null);

  const { data: livraisons = [], isLoading, error } = useQuery({
    queryKey: ["flotte-livraisons", "effectuees", dateDebut, dateFin],
    queryFn: () => api.flotteLivraisons.list({ dateDebut, dateFin }),
  });

  const effectuees = useMemo(() => livraisons.filter((l) => !!l.tSortieSite), [livraisons]);

  const filtered = useMemo(() => {
    if (!search.trim()) return effectuees;
    return effectuees.filter(
      (l) =>
        includesLower(l.numCmdNav, search) ||
        includesLower(l.nomClient, search) ||
        includesLower(l.zone, search) ||
        includesLower(l.chauffeurNom, search) ||
        includesLower(l.commentaire, search) ||
        includesLower(l.motifRetard, search),
    );
  }, [effectuees, search]);

  return (
    <FlotteLayout
      subtitle={`Livraisons effectuées · ${effectuees.length} sur la période`}
      rightSlot={
        <DateRange dateDebut={dateDebut} dateFin={dateFin} onDebut={setDateDebut} onFin={setDateFin} />
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher commande, client, motif, commentaire…"
            className="input pl-9"
          />
        </div>

        {isLoading ? (
          <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>
        ) : error ? (
          <div className="card p-6 border-red-200 bg-red-50 text-sm text-red-700">
            {error instanceof Error ? error.message : "Erreur"}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center text-sm text-slate-500">
            Aucune livraison effectuée sur la période.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Prévue</th>
                    <th className="px-3 py-2.5 text-left">Réelle</th>
                    <th className="px-3 py-2.5 text-left">N° cmd</th>
                    <th className="px-3 py-2.5 text-left">Client</th>
                    <th className="px-3 py-2.5 text-left">Dépôt</th>
                    <th className="px-3 py-2.5 text-left">Chauffeur</th>
                    <th className="px-3 py-2.5 text-left">État</th>
                    <th className="px-3 py-2.5 text-left">Conformité</th>
                    <th className="px-3 py-2.5 text-left">Motif</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{l.dateLivraisonPrevue || "—"}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-700">{l.dateLivraisonReelle || "—"}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{l.numCmdNav || "—"}</td>
                      <td className="px-3 py-2 font-medium text-slate-900 truncate max-w-[180px]" title={l.nomClient}>
                        {l.nomClient || "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{l.zone}</td>
                      <td className="px-3 py-2 text-slate-700 text-xs">{l.chauffeurNom || "—"}</td>
                      <td className="px-3 py-2">
                        <EtatBadge etat={l.etat} />
                      </td>
                      <td className="px-3 py-2">
                        {l.conformite === "ok" && !l.loi10h ? (
                          <span className="badge-success text-[10px]">OK</span>
                        ) : l.loi10h ? (
                          <span className="badge-danger text-[10px]">LOI 10h</span>
                        ) : l.conformite === "retard" ? (
                          <span className="badge-danger text-[10px]">Retard</span>
                        ) : (
                          <span className="badge-neutral text-[10px]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 truncate max-w-[180px]" title={l.motifRetard}>
                        {l.motifRetard || "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => setEditing(l)}
                          className="btn-ghost py-1 px-2 text-xs"
                          title="Modifier le suivi"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <EditSuiviModal livraison={editing} open onClose={() => setEditing(null)} />
      )}
    </FlotteLayout>
  );
}

function EtatBadge({ etat }: { etat: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    en_attente: { label: "En attente", cls: "badge-neutral" },
    livre:      { label: "Livré",      cls: "badge-success" },
    partiel:    { label: "Partiel",    cls: "badge-warn" },
    non_livre:  { label: "Non livré",  cls: "badge-danger" },
    recupere:   { label: "Récupéré",   cls: "badge-info" },
  };
  const cfg = map[etat] ?? { label: etat, cls: "badge-neutral" };
  return <span className={cn(cfg.cls, "text-[10px]")}>{cfg.label}</span>;
}

export function DateRange({
  dateDebut,
  dateFin,
  onDebut,
  onFin,
}: {
  dateDebut: string;
  dateFin: string;
  onDebut: (v: string) => void;
  onFin: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Calendar className="h-4 w-4 text-slate-400" />
      <input type="date" value={dateDebut} onChange={(e) => onDebut(e.target.value)} className="input py-1.5 px-2 w-36" />
      <span className="text-slate-400">→</span>
      <input type="date" value={dateFin} onChange={(e) => onFin(e.target.value)} className="input py-1.5 px-2 w-36" />
    </div>
  );
}
