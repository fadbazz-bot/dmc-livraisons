import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, Search, FileText } from "lucide-react";
import { api } from "@/api/appsScript";
import { useAuth } from "@/lib/auth";
import { cacheSet, persistedCache } from "@/lib/persistentCache";
import type { Expedition } from "@/types/domain";
import { StatutBadge } from "@/components/StatutBadge";
import { JustifierRetardModal } from "@/components/modals/JustifierRetardModal";
import { formatRelative, formatDuree } from "@/lib/format";
import { cn, includesLower } from "@/lib/cn";

/**
 * Page Justificatifs — Responsable magasin.
 * Liste des expéditions en statut "retard_a_justifier", filtrée par zone du responsable.
 */
export default function JustificatifsPage() {
  const { user } = useAuth();
  const myZone = user?.zone || "";
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Expedition | null>(null);

  const { data: retards = [], isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ["retards-a-justifier", myZone],
    queryFn: async () => {
      const res = await api.retards.aJustifier(myZone || undefined);
      cacheSet(`retards-justifier-${myZone}`, res);
      return res;
    },
    refetchInterval: 60_000,
    ...persistedCache<Expedition[]>(`retards-justifier-${myZone}`),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return retards;
    return retards.filter(
      (e) =>
        includesLower(e.numCmdNav, search) ||
        includesLower(e.nomClient, search) ||
        includesLower(e.zone, search) ||
        includesLower(e.plaque, search) ||
        includesLower(e.chauffeur, search),
    );
  }, [retards, search]);

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500 text-white flex items-center justify-center">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Justificatifs de retard</h1>
              <p className="text-xs text-slate-500">
                {user?.nom}
                {myZone && ` — Zone ${myZone}`} · {retards.length} à justifier
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-outline gap-1.5"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            <span className="hidden sm:inline">Rafraîchir</span>
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher commande, client, plaque…"
            className="input pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 mb-4">
          <strong>Procédure</strong> : choisis le ou les motifs, ajoute un commentaire si besoin,
          envoie pour validation. Le contrôleur recevra ta justification et pourra la valider ou
          la contester.
        </div>

        {isLoading ? (
          <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>
        ) : error ? (
          <div className="card p-6 border-red-200 bg-red-50 text-sm text-red-700">
            {error instanceof Error ? error.message : "Erreur"}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center text-sm text-slate-500">
            🎉 Aucun retard à justifier sur ta zone. Bon boulot.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((exp) => (
              <RetardRow key={exp.id} exp={exp} onJustifier={() => setEditing(exp)} />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <JustifierRetardModal exp={editing} open onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function RetardRow({
  exp,
  onJustifier,
}: {
  exp: Expedition;
  onJustifier: () => void;
}) {
  return (
    <div className="card card-hover p-4 animate-in border-amber-200">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-slate-900">
              {exp.numCmdNav || "—"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="font-medium text-slate-800 truncate">
              {exp.nomClient || "Client inconnu"}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 flex items-center gap-3 flex-wrap">
            <span>📍 {exp.zone}</span>
            {exp.plaque && <span>🚗 {exp.plaque}</span>}
            {exp.chauffeur && <span>👤 {exp.chauffeur}</span>}
            {exp.dureeService !== null && (
              <span className="text-red-600 font-medium">
                ⏱ {formatDuree(exp.dureeService)} (dépassé)
              </span>
            )}
            <span>Sortie {formatRelative(exp.tSortieSite)}</span>
          </div>
        </div>
        <StatutBadge statut={exp.statut} />
      </div>
      <div className="flex justify-end">
        <button onClick={onJustifier} className="btn-primary gap-2">
          <FileText className="h-4 w-4" />
          Justifier
        </button>
      </div>
    </div>
  );
}
