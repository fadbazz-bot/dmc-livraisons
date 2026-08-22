import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, RefreshCw, Search } from "lucide-react";
import { api } from "@/api/appsScript";
import { useAuth } from "@/lib/auth";
import { cacheSet, persistedCache } from "@/lib/persistentCache";
import type { Expedition } from "@/types/domain";
import { StatutBadge } from "@/components/StatutBadge";
import { ValiderJustifModal } from "@/components/modals/ValiderJustifModal";
import { formatRelative, formatDuree } from "@/lib/format";
import { cn, includesLower } from "@/lib/cn";

/**
 * Page Contrôleur — validation/contestation des justificatifs.
 * Filtré par le site du contrôleur connecté.
 */
export default function ControleurPage() {
  const { user } = useAuth();
  const mySite = user?.site || "";
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Expedition | null>(null);

  // Refus si pas controleur ou admin
  if (user && user.role !== "controleur" && user.role !== "admin") {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Accès réservé</h2>
          <p className="text-sm text-slate-500">
            Cette page est accessible aux contrôleurs et aux admins.
          </p>
        </div>
      </div>
    );
  }

  const { data: aValider = [], isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ["retards-a-valider", mySite],
    queryFn: async () => {
      const res = await api.retards.aValider(mySite || undefined);
      cacheSet(`retards-valider-${mySite}`, res);
      return res;
    },
    refetchInterval: 60_000,
    ...persistedCache<Expedition[]>(`retards-valider-${mySite}`),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return aValider;
    return aValider.filter(
      (e) =>
        includesLower(e.numCmdNav, search) ||
        includesLower(e.nomClient, search) ||
        includesLower(e.zone, search) ||
        includesLower(e.motifRetard, search),
    );
  }, [aValider, search]);

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand-900 text-white flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Contrôle des justificatifs</h1>
              <p className="text-xs text-slate-500">
                {user?.nom}
                {mySite && ` — Site ${mySite}`} · {aValider.length} en attente
              </p>
            </div>
          </div>
          <button onClick={() => refetch()} disabled={isFetching} className="btn-outline gap-1.5">
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
            placeholder="Rechercher commande, client, motif…"
            className="input pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>
        ) : error ? (
          <div className="card p-6 border-red-200 bg-red-50 text-sm text-red-700">
            {error instanceof Error ? error.message : "Erreur"}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center text-sm text-slate-500">
            🎉 Aucun justificatif en attente. Tout est validé.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((exp) => (
              <ValidationRow key={exp.id} exp={exp} onClick={() => setEditing(exp)} />
            ))}
          </div>
        )}
      </div>

      {editing && <ValiderJustifModal exp={editing} open onClose={() => setEditing(null)} />}
    </div>
  );
}

function ValidationRow({ exp, onClick }: { exp: Expedition; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left card card-hover p-4 animate-in border-amber-200"
    >
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
            {exp.numeroBL && <span>📄 {exp.numeroBL}</span>}
            {exp.dureeService !== null && (
              <span className="text-red-600 font-medium">⏱ {formatDuree(exp.dureeService)}</span>
            )}
            <span>{formatRelative(exp.tSortieSite)}</span>
          </div>
        </div>
        <StatutBadge statut={exp.statut} />
      </div>
      <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 p-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Motifs déclarés</div>
        <div className="text-sm text-slate-900 font-medium">
          {exp.motifRetard || <span className="italic text-slate-400">—</span>}
        </div>
        {exp.commentaireRetard && (
          <div className="mt-1 text-xs text-slate-600 italic">« {exp.commentaireRetard} »</div>
        )}
      </div>
    </button>
  );
}
