import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DoorOpen, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "@/api/appsScript";
import { useAuth } from "@/lib/auth";
import { cacheSet, persistedCache } from "@/lib/persistentCache";
import type { Expedition } from "@/types/domain";
import { StatutBadge } from "@/components/StatutBadge";
import { JalonTimeline } from "@/components/JalonTimeline";
import { EntreeShowroomModal } from "@/components/modals/EntreeShowroomModal";
import { SortieShowroomModal } from "@/components/modals/SortieShowroomModal";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import { UrgentBadge } from "@/components/UrgentBadge";
import { ConfirmerClientModal } from "@/components/modals/ConfirmerClientModal";
import { BarreOutilsTerrain, pastillesStandard } from "@/components/BarreOutilsTerrain";
import { appliquer, compter, minutesDepuis, FILTRES_VIDES, type FiltresTerrain } from "@/lib/listeTerrain";

type Section = "entrer" | "sortir";

/**
 * Écran de l'agent de sécurité showroom.
 *
 * Sécurité (double filtrage) :
 *   - Serveur : getExpeditions(acteurEmail=...) applique le cloisonnement
 *     site + zone Showroom côté Apps Script (voir Code.gs).
 *   - Client : on refiltre quand même ici, pour ne jamais afficher de données
 *     obsolètes venant du cache local (dispositif partagé au poste showroom).
 */
function zoneEstShowroom(zone: string): boolean {
  return zone.toLowerCase().includes("showroom");
}

function zoneToSite(zone: string): "Dakar" | "Diamniadio" {
  return zone.toLowerCase().includes("diamniadio") ? "Diamniadio" : "Dakar";
}

export default function AgentShowroomPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<Section>("entrer");
  const [fEntrer, setFEntrer] = useState<FiltresTerrain>({ ...FILTRES_VIDES });
  const [fSortir, setFSortir] = useState<FiltresTerrain>({ ...FILTRES_VIDES });
  const [entreeExp, setEntreeExp] = useState<Expedition | null>(null);
  const [aConfirmer, setAConfirmer] = useState<Expedition | null>(null);
  const [sortieExp, setSortieExp] = useState<Expedition | null>(null);

  const { data: exps = [], isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ["expeditions", "showroom", user?.id],
    queryFn: async () => {
      const res = await api.expeditions.list({ acteurEmail: user?.email });
      cacheSet("expeditions:showroom", res);
      return res;
    },
    refetchInterval: 30_000,
    ...persistedCache<Expedition[]>("expeditions:showroom"),
  });

  const mine = exps.filter(
    (e) => zoneEstShowroom(e.zone) && (!user?.site || zoneToSite(e.zone) === user.site),
  );
  const aEntrer = mine.filter((e) => e.statut === "en_attente");
  const aSortir = mine.filter((e) => e.statut === "en_chargement" || e.statut === "pret_sortie");
  const afficherSite = !user?.site;
  const entrerFiltres = useMemo(
    () => appliquer(aEntrer, fEntrer).filter((e) => fEntrer.extra !== "attente" || minutesDepuis(e.t0) > 30),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exps, fEntrer, user?.site],
  );
  const sortirFiltres = useMemo(
    () => appliquer(aSortir, fSortir, "entree").filter((e) => fSortir.extra !== "attente" || minutesDepuis(e.tEntreeSite) > 30),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exps, fSortir, user?.site],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Agent showroom</h1>
              <p className="text-xs text-slate-500">
                {user?.nom} {user?.site && `— Showroom ${user.site}`}
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

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
          <Tab
            active={section === "entrer"}
            onClick={() => setSection("entrer")}
            icon={<DoorOpen className="h-4 w-4" />}
            label="Entrées"
            count={aEntrer.length}
            countColor="bg-brand-900"
          />
          <Tab
            active={section === "sortir"}
            onClick={() => setSection("sortir")}
            icon={<LogOut className="h-4 w-4" />}
            label="Sorties"
            count={aSortir.length}
            countColor="bg-accent"
          />
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="card p-6 text-center text-slate-500 text-sm">Chargement…</div>
        ) : error ? (
          <div className="card p-6 border-red-200 bg-red-50">
            <h3 className="font-semibold text-red-900 mb-1">Erreur de chargement</h3>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : "Erreur inconnue"}
            </p>
          </div>
        ) : section === "entrer" ? (
          <div className="space-y-3">
            <BarreOutilsTerrain
              f={fEntrer}
              onChange={setFEntrer}
              placeholder="Tape le nom du client, le n° de commande…"
              tris={["client", "ancien", "recent"]}
              groupes={pastillesStandard({
                f: fEntrer, onChange: setFEntrer, comptes: compter(aEntrer), afficherSite,
                extra: { options: [{ value: "", label: "Tous" }, { value: "attente", label: "Préparés depuis > 30 min", n: aEntrer.filter((e) => minutesDepuis(e.t0) > 30).length }] },
              })}
              resultats={entrerFiltres.length}
              total={aEntrer.length}
            />
            <ExpList
              list={entrerFiltres}
              actionLabel="Autoriser"
              actionIcon={<DoorOpen className="h-4 w-4" />}
              onAction={(e) => setAConfirmer(e)}
              empty={aEntrer.length ? "Aucun client ne correspond à ces filtres." : "Aucun client en attente d'entrée."}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <BarreOutilsTerrain
              f={fSortir}
              onChange={setFSortir}
              placeholder="Client, plaque, n° commande…"
              tris={["ancien", "recent", "client", "plaque"]}
              groupes={pastillesStandard({
                f: fSortir, onChange: setFSortir, comptes: compter(aSortir), afficherSite,
                extra: { options: [{ value: "", label: "Tous" }, { value: "attente", label: "Sur place > 30 min", n: aSortir.filter((e) => minutesDepuis(e.tEntreeSite) > 30).length }] },
              })}
              resultats={sortirFiltres.length}
              total={aSortir.length}
            />
            <ExpList
              list={sortirFiltres}
              actionLabel="Valider sortie"
              actionIcon={<LogOut className="h-4 w-4" />}
              onAction={(e) => setSortieExp(e)}
              empty={aSortir.length ? "Aucun client ne correspond à ces filtres." : "Aucun client prêt à sortir."}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      {aConfirmer && (
        <ConfirmerClientModal
          exp={aConfirmer}
          voisins={aEntrer}
          onClose={() => setAConfirmer(null)}
          onConfirm={() => { setEntreeExp(aConfirmer); setAConfirmer(null); }}
        />
      )}
      {entreeExp && (
        <EntreeShowroomModal exp={entreeExp} open onClose={() => setEntreeExp(null)} />
      )}
      {sortieExp && (
        <SortieShowroomModal exp={sortieExp} open onClose={() => setSortieExp(null)} />
      )}
    </div>
  );
}

// ─── Tab bouton ──────────────────────────────────────────────────────────────

function Tab({
  active,
  onClick,
  icon,
  label,
  count,
  countColor,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  countColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "py-2.5 px-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5",
        active ? "bg-white text-brand-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
      )}
    >
      {icon}
      <span>{label}</span>
      {count > 0 && (
        <span className={cn("px-1.5 py-0.5 rounded-full text-white text-[10px] font-bold", countColor)}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Liste d'expéditions ──────────────────────────────────────────────────────

function ExpList({
  list,
  actionLabel,
  actionIcon,
  onAction,
  empty,
}: {
  list: Expedition[];
  actionLabel: string;
  actionIcon: React.ReactNode;
  onAction: (e: Expedition) => void;
  empty: string;
}) {
  if (list.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-slate-500">{empty}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {list.map((exp) => (
        <ExpActionCard
          key={exp.id}
          exp={exp}
          action={actionLabel}
          actionIcon={actionIcon}
          onAction={() => onAction(exp)}
        />
      ))}
    </div>
  );
}

function ExpActionCard({
  exp,
  action,
  actionIcon,
  onAction,
}: {
  exp: Expedition;
  action: string;
  actionIcon: React.ReactNode;
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
            {exp.urgent && <UrgentBadge />}
          </div>
          <div className="mt-1 text-xs text-slate-500 flex items-center gap-3 flex-wrap">
            <span>{exp.zone}</span>
            {exp.plaque && <span className="num">{exp.plaque}</span>}
            <span>{formatRelative(exp.t0)}</span>
          </div>
        </div>
        <StatutBadge statut={exp.statut} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <JalonTimeline exp={exp} compact />
        <button onClick={onAction} className="btn-primary shrink-0 gap-1.5">
          {actionIcon}
          {action}
        </button>
      </div>
    </div>
  );
}
