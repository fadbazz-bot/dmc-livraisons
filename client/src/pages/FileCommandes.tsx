import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, RefreshCw, KeyRound, FileText } from "lucide-react";
import { api } from "@/api/appsScript";
import type { Expedition, StatutExpedition } from "@/types/domain";
import { StatutBadge } from "@/components/StatutBadge";
import { JalonTimeline } from "@/components/JalonTimeline";
import { CodeRetraitModal } from "@/components/modals/CodeRetraitModal";
import { BonLivraisonModal } from "@/components/modals/BonLivraisonModal";
import { useAuth } from "@/lib/auth";
import { formatRelative, formatDuree } from "@/lib/format";
import { cn, includesLower } from "@/lib/cn";
import { cacheSet, persistedCache } from "@/lib/persistentCache";

const STATUTS_FILTRES: { value: StatutExpedition | "all"; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "en_attente", label: "En attente" },
  { value: "entree_site", label: "Entrée site" },
  { value: "en_chargement", label: "En chargement" },
  { value: "sortie", label: "Sortie" },
  { value: "retard_a_justifier", label: "Retard" },
];

export default function FileCommandesPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState<StatutExpedition | "all">("all");
  const [codeExp, setCodeExp] = useState<Expedition | null>(null);
  const [bonExp, setBonExp] = useState<Expedition | null>(null);

  /**
   * Le bouton « Voir code » est visible pour tout commercial actif (peu importe
   * le site ou qui a créé la commande) et pour l'admin — un client peut se
   * présenter dans un autre site que celui du commercial qui a pris la commande,
   * et n'importe quel commercial sur place doit pouvoir lui donner le code.
   * Le backend re-vérifie l'autorisation, le check côté frontend
   * est juste pour cacher le bouton aux personnes qui ne peuvent pas l'utiliser.
   */
  function canViewCode(_exp: Expedition): boolean {
    if (!user) return false;
    return user.role === "admin" || user.role === "commercial";
  }

  /**
   * Le bon de livraison n'a de sens qu'après l'entrée site (sinon pas de photo permis,
   * pas de plaque, etc.). Accessible aux mêmes personnes que le code.
   */
  function canPrintBon(exp: Expedition): boolean {
    return canViewCode(exp) && !!exp.tEntreeSite;
  }

  const { data: exps = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["expeditions"],
    queryFn: async () => {
      const res = await api.expeditions.list();
      cacheSet("expeditions", res);   // persiste pour la prochaine visite
      return res;
    },
    ...persistedCache<Expedition[]>("expeditions"),
  });

  const filtered = useMemo(() => {
    const term = search.trim();
    return exps.filter((e) => {
      if (statutFilter !== "all" && e.statut !== statutFilter) return false;
      if (!term) return true;
      // includesLower convertit en string en interne — sûr même si Sheets renvoie un nombre
      return (
        includesLower(e.numCmdNav, term) ||
        includesLower(e.nomClient, term) ||
        includesLower(e.zone, term) ||
        includesLower(e.plaque, term) ||
        includesLower(e.chauffeur, term) ||
        includesLower(e.numeroBL, term) ||
        includesLower(e.numExpedition, term)
      );
    });
  }, [exps, search, statutFilter]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">File des expéditions</h1>
            <p className="text-sm text-slate-500">{filtered.length} expéditions visibles · mise à jour {formatRelative(new Date().toISOString())}</p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-outline gap-1.5"
            aria-label="Rafraîchir"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            <span className="hidden sm:inline">Rafraîchir</span>
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher commande, client, plaque…"
              className="input pl-9"
            />
          </div>
          {/* Statut filter */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1">
            <Filter className="h-4 w-4 text-slate-400 mr-1 shrink-0" />
            {STATUTS_FILTRES.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatutFilter(s.value)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                  statutFilter === s.value
                    ? "bg-brand-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-4 animate-pulse">
                <div className="h-4 bg-slate-100 rounded w-1/3 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card p-6 border-red-200 bg-red-50">
            <h3 className="font-semibold text-red-900 mb-1">Erreur de chargement</h3>
            <p className="text-sm text-red-700">{error instanceof Error ? error.message : "Erreur inconnue"}</p>
            <button onClick={() => refetch()} className="btn-outline mt-3">Réessayer</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-slate-500">Aucune expédition ne correspond à ces filtres.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((e) => (
              <ExpeditionRow
                key={e.id}
                exp={e}
                showCodeButton={canViewCode(e)}
                showBonButton={canPrintBon(e)}
                onShowCode={() => setCodeExp(e)}
                onShowBon={() => setBonExp(e)}
              />
            ))}
          </div>
        )}
      </div>

      {codeExp && (
        <CodeRetraitModal exp={codeExp} open onClose={() => setCodeExp(null)} />
      )}
      {bonExp && (
        <BonLivraisonModal exp={bonExp} open onClose={() => setBonExp(null)} />
      )}
    </div>
  );
}

function ExpeditionRow({
  exp,
  showCodeButton,
  showBonButton,
  onShowCode,
  onShowBon,
}: {
  exp: Expedition;
  showCodeButton: boolean;
  showBonButton: boolean;
  onShowCode: () => void;
  onShowBon: () => void;
}) {
  return (
    <div className="card card-hover p-4 animate-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-slate-900">{exp.numCmdNav || "—"}</span>
            <span className="text-slate-300">·</span>
            <span className="font-medium text-slate-800 truncate">{exp.nomClient || "Client inconnu"}</span>
            <span className="text-slate-300">·</span>
            <span className="text-sm text-slate-600">{exp.zone}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 flex items-center gap-3 flex-wrap">
            {exp.plaque && <span>🚗 {exp.plaque}</span>}
            {exp.chauffeur && <span>👤 {exp.chauffeur}</span>}
            {exp.numeroBL && <span>📄 {exp.numeroBL}</span>}
            {exp.dureeService !== null && <span>⏱ {formatDuree(exp.dureeService)}</span>}
            <span>Créée {formatRelative(exp.t0)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {showBonButton && (
            <button
              type="button"
              onClick={onShowBon}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-50 text-accent-600 hover:bg-accent-100 text-xs font-medium border border-accent-100 transition-colors"
              title="Imprimer le bon de livraison à remettre au chauffeur"
            >
              <FileText className="h-3 w-3" />
              Bon
            </button>
          )}
          {showCodeButton && (
            <button
              type="button"
              onClick={onShowCode}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 text-brand-900 hover:bg-brand-100 text-xs font-medium border border-brand-200 transition-colors"
              title="Voir le code de retrait (consultation tracée)"
            >
              <KeyRound className="h-3 w-3" />
              Code
            </button>
          )}
          <StatutBadge statut={exp.statut} />
        </div>
      </div>
      <div className="mt-3">
        <JalonTimeline exp={exp} compact />
      </div>
    </div>
  );
}
