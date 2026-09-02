import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wrench, RefreshCw, KeyRound } from "lucide-react";
import { api } from "@/api/appsScript";
import { useAuth } from "@/lib/auth";
import { cacheSet, persistedCache } from "@/lib/persistentCache";
import type { Expedition } from "@/types/domain";
import { StatutBadge } from "@/components/StatutBadge";
import { JalonTimeline } from "@/components/JalonTimeline";
import { SaisieCodeModal } from "@/components/modals/SaisieCodeModal";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Catégorise une zone (libellé complet type "Parc Diamniadio" ou catégorie
 * abstraite type "Parc Acier") en l'une des 4 catégories magasin. Permet de
 * comparer la zone d'une expédition (toujours le libellé complet avec site,
 * ex: "Parc Diamniadio") à la zone du compte responsable (catégorie abstraite
 * seule, ex: "Parc Acier") — ces deux chaînes ne se recoupent jamais en tant
 * que sous-chaînes littérales, d'où le bug historique : seul Showroom
 * fonctionnait, car "Showroom" apparaît mot pour mot dans les deux.
 */
function zoneCategorie(zone: string): "parc" | "depot" | "showroom" | "sav" | "autre" {
  const z = zone.toLowerCase();
  if (z.includes("parc")) return "parc";
  if (z.includes("dépôt") || z.includes("depot")) return "depot";
  if (z.includes("showroom")) return "showroom";
  if (z.includes("sav")) return "sav";
  return "autre";
}

/** Site déduit du libellé de zone (ex: "Parc Diamniadio" → "Diamniadio") */
function zoneToSite(zone: string): "Dakar" | "Diamniadio" {
  return zone.toLowerCase().includes("diamniadio") ? "Diamniadio" : "Dakar";
}

/**
 * Page Responsable Magasin — flux v3.
 * Action UNIQUE : saisir le code PIN remis par le client → chargement enclenché.
 *
 * Filtrage : les expéditions affichées sont celles avec un statut "entree_site"
 * (camion sur site, en attente du code), filtrées par catégorie de magasin
 * ET par site du responsable (voir zoneCategorie / zoneToSite ci-dessus).
 */
export default function ResponsablePage() {
  const { user } = useAuth();
  const myZone = user?.zone || "";
  const myCategorie = myZone ? zoneCategorie(myZone) : null;
  const [activeExp, setActiveExp] = useState<Expedition | null>(null);

  const { data: exps = [], isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ["expeditions"],
    queryFn: async () => {
      const res = await api.expeditions.list();
      cacheSet("expeditions", res);
      return res;
    },
    refetchInterval: 30_000,
    ...persistedCache<Expedition[]>("expeditions"),
  });

  // Camions sur site, en attente que le client présente son code
  const aTraiter = useMemo(() => {
    let list = exps.filter((e) => e.statut === "entree_site");
    if (myCategorie) {
      list = list.filter((e) => zoneCategorie(e.zone) === myCategorie);
    }
    if (user?.site) {
      list = list.filter((e) => zoneToSite(e.zone) === user.site);
    }
    return list;
  }, [exps, myCategorie, user?.site]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand-900 text-white flex items-center justify-center">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Saisie code livraison</h1>
              <p className="text-xs text-slate-500">
                {user?.nom}
                {myZone && ` — Zone ${myZone}`}
              </p>
            </div>
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
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 mb-4 text-sm text-blue-900">
          Saisis le code PIN que le client t'a remis pour <strong>enclencher le chargement</strong>.
          Le chargement s'arrêtera automatiquement à la sortie du site.
        </div>

        {isLoading ? (
          <div className="card p-6 text-center text-slate-500 text-sm">Chargement…</div>
        ) : error ? (
          <div className="card p-6 border-red-200 bg-red-50">
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : "Erreur inconnue"}
            </p>
          </div>
        ) : aTraiter.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-slate-500">Aucun camion en attente de saisie de code.</p>
            {myZone && (
              <p className="text-xs text-slate-400 mt-1">Filtre actif : zone « {myZone} ».</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {aTraiter.map((exp) => (
              <ResponsableCard
                key={exp.id}
                exp={exp}
                onAction={() => setActiveExp(exp)}
              />
            ))}
          </div>
        )}
      </div>

      {activeExp && (
        <SaisieCodeModal exp={activeExp} open onClose={() => setActiveExp(null)} />
      )}
    </div>
  );
}

function ResponsableCard({
  exp,
  onAction,
}: {
  exp: Expedition;
  onAction: () => void;
}) {
  return (
    <div className="card card-hover p-4 animate-in">
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
            <span>Entré {formatRelative(exp.tEntreeSite)}</span>
          </div>
        </div>
        <StatutBadge statut={exp.statut} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <JalonTimeline exp={exp} compact />
        <button onClick={onAction} className="btn-primary shrink-0 gap-2">
          <KeyRound className="h-4 w-4" />
          Saisir code
        </button>
      </div>
    </div>
  );
}
