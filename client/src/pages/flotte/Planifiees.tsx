import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table2, Calendar, Search } from "lucide-react";
import { api } from "@/api/appsScript";
import type { LivraisonFlotte } from "@/types/domain";
import { FlotteLayout } from "@/components/FlotteLayout";
import { AgendaView } from "@/components/AgendaView";
import { Modal } from "@/components/Modal";
import { cn, includesLower } from "@/lib/cn";

type ViewMode = "tableau" | "agenda";

/**
 * Livraisons flotte interne planifiées (non encore livrées).
 * Affichage tableau OU agenda mensuel.
 */
export default function PlanifieesPage() {
  const [view, setView] = useState<ViewMode>("tableau");
  const [search, setSearch] = useState("");
  const [agendaDate, setAgendaDate] = useState<{ date: string; items: LivraisonFlotte[] } | null>(null);

  // Plage de date : 60 jours autour d'aujourd'hui (30 avant + 30 après)
  const { dateDebut, dateFin } = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getTime() - 30 * 86400000);
    const end = new Date(today.getTime() + 30 * 86400000);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { dateDebut: fmt(start), dateFin: fmt(end) };
  }, []);

  const { data: livraisons = [], isLoading, error } = useQuery({
    queryKey: ["flotte-livraisons", "planifiees", dateDebut, dateFin],
    queryFn: () => api.flotteLivraisons.list({ dateDebut, dateFin }),
  });

  // Tableau : on ne montre que celles non encore livrées (à action)
  const planifiees = useMemo(
    () => livraisons.filter((l) => !l.tSortieSite || l.etat === "en_attente"),
    [livraisons],
  );

  // Agenda : on montre TOUTES les livraisons (passées + futures) pour une vue calendaire pleine
  const agendaLivraisons = livraisons;

  const filtered = useMemo(() => {
    if (!search.trim()) return planifiees;
    return planifiees.filter(
      (l) =>
        includesLower(l.numCmdNav, search) ||
        includesLower(l.nomClient, search) ||
        includesLower(l.zone, search) ||
        includesLower(l.chauffeurNom, search) ||
        includesLower(l.chauffeurPlaque, search),
    );
  }, [planifiees, search]);

  return (
    <FlotteLayout
      subtitle={`Livraisons planifiées · ${planifiees.length} à venir`}
      rightSlot={
        <div className="inline-flex items-center bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setView("tableau")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5",
              view === "tableau" ? "bg-white shadow-sm text-brand-900" : "text-slate-600",
            )}
          >
            <Table2 className="h-3.5 w-3.5" />
            Tableau
          </button>
          <button
            onClick={() => setView("agenda")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5",
              view === "agenda" ? "bg-white shadow-sm text-brand-900" : "text-slate-600",
            )}
          >
            <Calendar className="h-3.5 w-3.5" />
            Agenda
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {view === "tableau" && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher commande, client, magasin, chauffeur…"
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
                Aucune livraison planifiée pour la période.
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 text-left">Date prévue</th>
                        <th className="px-3 py-2.5 text-left">N° commande</th>
                        <th className="px-3 py-2.5 text-left">Client</th>
                        <th className="px-3 py-2.5 text-left">Dépôt</th>
                        <th className="px-3 py-2.5 text-left">Chauffeur</th>
                        <th className="px-3 py-2.5 text-left">Plaque</th>
                        <th className="px-3 py-2.5 text-left">État</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">{l.dateLivraisonPrevue || "—"}</td>
                          <td className="px-3 py-2 font-mono text-xs">{l.numCmdNav || "—"}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{l.nomClient || "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{l.zone}</td>
                          <td className="px-3 py-2 text-slate-700">{l.chauffeurNom || "—"}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">{l.chauffeurPlaque || "—"}</td>
                          <td className="px-3 py-2">
                            <span className="badge-neutral text-[10px]">{l.etat}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {view === "agenda" && (
          <AgendaView
            livraisons={agendaLivraisons}
            onSelectDate={(date, items) => setAgendaDate({ date, items })}
          />
        )}
      </div>

      {agendaDate && (
        <Modal
          open
          onClose={() => setAgendaDate(null)}
          title={`Livraisons du ${new Date(agendaDate.date).toLocaleDateString("fr-FR")}`}
          description={`${agendaDate.items.length} livraison${agendaDate.items.length > 1 ? "s" : ""}`}
          size="lg"
          footer={
            <button type="button" className="btn-primary" onClick={() => setAgendaDate(null)}>
              Fermer
            </button>
          }
        >
          <div className="space-y-2">
            {agendaDate.items.map((l) => (
              <div key={l.id} className="rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="font-mono text-xs text-slate-700">{l.numCmdNav || "—"}</div>
                  <span
                    className={cn(
                      "badge text-[10px]",
                      l.etat === "livre" ? "badge-success" : l.conformite === "retard" || l.loi10h ? "badge-danger" : "badge-neutral",
                    )}
                  >
                    {l.etat}
                  </span>
                </div>
                <div className="text-sm font-medium text-slate-900">{l.nomClient || "—"}</div>
                <div className="text-xs text-slate-500">
                  📍 {l.zone} {l.chauffeurNom && `· 🚛 ${l.chauffeurNom}`} {l.chauffeurPlaque && `· ${l.chauffeurPlaque}`}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </FlotteLayout>
  );
}
