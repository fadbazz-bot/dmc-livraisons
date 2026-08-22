import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck, LogOut, RefreshCw, ShieldCheck, Users, ChevronDown, ChevronRight, Search } from "lucide-react";
import { api } from "@/api/appsScript";
import { useAuth } from "@/lib/auth";
import { cacheSet, persistedCache } from "@/lib/persistentCache";
import type { Expedition } from "@/types/domain";
import { StatutBadge } from "@/components/StatutBadge";
import { JalonTimeline } from "@/components/JalonTimeline";
import { EntreeSiteModal } from "@/components/modals/EntreeSiteModal";
import { SortieSiteModal } from "@/components/modals/SortieSiteModal";
import { formatRelative } from "@/lib/format";
import { cn, includesLower } from "@/lib/cn";

type Section = "clients" | "entrer" | "sortir";

export default function PosteGardePage() {
  const { user } = useAuth();
  const [section, setSection] = useState<Section>("clients");
  const [entreeExp, setEntreeExp] = useState<Expedition | null>(null);
  const [sortieExp, setSortieExp] = useState<Expedition | null>(null);

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

  const mySite = user?.site || "";

  const { aEntrer, aSortir } = useMemo(() => {
    const aEntrer = exps.filter((e) => e.statut === "en_attente");
    const aSortir = exps.filter(
      (e) => e.statut === "en_chargement" || e.statut === "pret_sortie",
    );
    return { aEntrer, aSortir };
  }, [exps]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand-900 text-white flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Poste de garde</h1>
              <p className="text-xs text-slate-500">
                {user?.nom} {mySite && `— Site ${mySite}`}
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
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
          <Tab
            active={section === "clients"}
            onClick={() => setSection("clients")}
            icon={<Users className="h-4 w-4" />}
            label="Par client"
            count={aEntrer.length}
            countColor="bg-brand-900"
          />
          <Tab
            active={section === "entrer"}
            onClick={() => setSection("entrer")}
            icon={<Truck className="h-4 w-4" />}
            label="Toutes entrées"
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
        ) : section === "clients" ? (
          <ClientsView exps={aEntrer} onPick={(e) => setEntreeExp(e)} />
        ) : section === "entrer" ? (
          <ExpList
            list={aEntrer}
            actionLabel="Entrée site"
            onAction={(e) => setEntreeExp(e)}
            empty="Aucun camion en attente d'entrée."
          />
        ) : (
          <ExpList
            list={aSortir}
            actionLabel="Valider sortie"
            onAction={(e) => setSortieExp(e)}
            empty="Aucun camion prêt à sortir."
          />
        )}
      </div>

      {/* Modals */}
      {entreeExp && (
        <EntreeSiteModal exp={entreeExp} open onClose={() => setEntreeExp(null)} />
      )}
      {sortieExp && (
        <SortieSiteModal exp={sortieExp} open onClose={() => setSortieExp(null)} />
      )}
    </div>
  );
}

// ─── Tab boutton ─────────────────────────────────────────────────────────────

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
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden text-[10px]">{label.split(" ")[0]}</span>
      {count > 0 && (
        <span className={cn("px-1.5 py-0.5 rounded-full text-white text-[10px] font-bold", countColor)}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Vue "Par client" ────────────────────────────────────────────────────────

interface ClientGroup {
  nom: string;
  expeditions: Expedition[];
}

function ClientsView({ exps, onPick }: { exps: Expedition[]; onPick: (e: Expedition) => void }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Grouper par nom de client
  const groups = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, Expedition[]>();
    for (const e of exps) {
      const key = String(e.nomClient || "(sans nom)").trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries())
      .map(([nom, expeditions]) => ({ nom, expeditions }))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [exps]);

  // Filtrer par recherche
  const filtered = useMemo(() => {
    const term = search.trim();
    if (!term) return groups;
    return groups.filter((g) => includesLower(g.nom, term));
  }, [groups, search]);

  function toggle(nom: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nom)) next.delete(nom);
      else next.add(nom);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
        Demande au chauffeur <strong>pour quel client</strong> il vient. Cherche le nom ci-dessous,
        clique sur le client pour voir ses livraisons en attente, et autorise l'entrée pour la bonne.
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tape le nom du client…"
          className="input pl-9"
          autoFocus
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-slate-500">
            {search ? `Aucun client trouvé pour « ${search} ».` : "Aucun client en attente."}
          </p>
          {search && (
            <p className="text-xs text-slate-400 mt-2">
              Si le client n'apparaît pas, c'est qu'aucune commande n'a été préparée pour lui aujourd'hui.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((g) => (
            <ClientCard
              key={g.nom}
              group={g}
              expanded={expanded.has(g.nom)}
              onToggle={() => toggle(g.nom)}
              onPick={onPick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClientCard({
  group,
  expanded,
  onToggle,
  onPick,
}: {
  group: ClientGroup;
  expanded: boolean;
  onToggle: () => void;
  onPick: (e: Expedition) => void;
}) {
  return (
    <div className="card animate-in">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-slate-50 rounded-xl"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
          )}
          <div className="min-w-0 flex-1 text-left">
            <div className="font-semibold text-slate-900 truncate">{group.nom}</div>
            <div className="text-xs text-slate-500">
              {group.expeditions.length} livraison{group.expeditions.length > 1 ? "s" : ""} en attente
            </div>
          </div>
        </div>
        <div className="text-2xl font-bold text-brand-900">{group.expeditions.length}</div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-3 space-y-2 bg-slate-50/40">
          <p className="text-xs text-slate-500 px-1">
            Choisis la livraison à autoriser. Le n° de commande est volontairement masqué — le
            chauffeur n'a pas à le connaître.
          </p>
          {group.expeditions.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onPick(e)}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:border-brand-900 hover:shadow-card transition-all text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900">📍 {e.zone}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Préparée {formatRelative(e.t0)}
                </div>
              </div>
              <span className="btn-primary py-1.5 px-3 text-xs gap-1.5">
                <Truck className="h-3.5 w-3.5" />
                Autoriser
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Vue "Toutes entrées / sorties" ──────────────────────────────────────────

function ExpList({
  list,
  actionLabel,
  onAction,
  empty,
}: {
  list: Expedition[];
  actionLabel: string;
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
        <ExpActionCard key={exp.id} exp={exp} action={actionLabel} onAction={() => onAction(exp)} />
      ))}
    </div>
  );
}

function ExpActionCard({
  exp,
  action,
  onAction,
}: {
  exp: Expedition;
  action: string;
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
            {exp.numeroBL && <span>📄 {exp.numeroBL}</span>}
            <span>{formatRelative(exp.t0)}</span>
          </div>
        </div>
        <StatutBadge statut={exp.statut} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <JalonTimeline exp={exp} compact />
        <button onClick={onAction} className="btn-primary shrink-0">
          {action}
        </button>
      </div>
    </div>
  );
}
