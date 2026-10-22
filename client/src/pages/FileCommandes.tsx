import { useEffect, useMemo, useState } from "react";
import { PeriodeSelect, Verrou } from "@/components/FiltresPortee";
import { dansPeriode, periodeDepuisPreset, periodeDepuisSauvegarde, type Periode } from "@/lib/periode";
import { memeMagasin, porteeDe } from "@/lib/portee";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Search, RefreshCw, KeyRound, FileText, X, Plus, SlidersHorizontal, Clock, User, Truck, Hash, Camera } from "lucide-react";
import { api } from "@/api/appsScript";
import type { Expedition, StatutExpedition } from "@/types/domain";
import { StatutBadge, STATUT_BAR } from "@/components/StatutBadge";
import { JalonTimeline } from "@/components/JalonTimeline";
import { PageHeader } from "@/components/PageHeader";
import { CodeRetraitModal } from "@/components/modals/CodeRetraitModal";
import { BonLivraisonModal } from "@/components/modals/BonLivraisonModal";
import { useAuth } from "@/lib/auth";
import { formatDuree, formatJourLong, formatTime, jourISO } from "@/lib/format";
import { cn, includesLower } from "@/lib/cn";
import { cacheSet, persistedCache } from "@/lib/persistentCache";

// ─── Filtres ────────────────────────────────────────────────────────────────

type Tri = "recent" | "ancien";

const STATUTS: { value: StatutExpedition | "all"; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "en_attente", label: "En attente" },
  { value: "entree_site", label: "Entrée site" },
  { value: "en_chargement", label: "En chargement" },
  { value: "sortie", label: "Sorties" },
  { value: "retard_a_justifier", label: "Retards" },
];

const PAGE = 40;
const PREFS_KEY = "dmc_file_prefs_v1";

interface Prefs {
  periode: Periode;
  tri: Tri;
  mes: boolean;
}

function lirePrefs(): Prefs {
  const defaut: Prefs = { periode: periodeDepuisPreset("7"), tri: "recent", mes: false };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaut;
    const p = JSON.parse(raw);
    return { ...defaut, ...p, periode: periodeDepuisSauvegarde(p.periode, "7") };
  } catch {
    return defaut;
  }
}

function siteDe(zone: string): "Dakar" | "Diamniadio" {
  return String(zone || "").toLowerCase().includes("diamniadio") ? "Diamniadio" : "Dakar";
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function FileCommandesPage() {
  const { user } = useAuth();
  const initial = useMemo(lirePrefs, []);

  const [search, setSearch] = useState("");
  const [statut, setStatut] = useState<StatutExpedition | "all">("all");
  const [periode, setPeriode] = useState<Periode>(initial.periode);
  const portee = useMemo(() => porteeDe(user), [user]);
  const [tri, setTri] = useState<Tri>(initial.tri);
  const [mes, setMes] = useState(initial.mes);
  const [siteChoisi, setSite] = useState("");
  const [zoneChoisie, setZone] = useState("");
  // Les droits priment toujours sur le choix affiché
  const site = portee.siteFixe ?? siteChoisi;
  const zone = portee.zoneFixe ?? zoneChoisie;
  const [commercial, setCommercial] = useState("");
  const [mode, setMode] = useState("");
  const [reliquats, setReliquats] = useState(false);
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const [limite, setLimite] = useState(PAGE);

  const [codeExp, setCodeExp] = useState<Expedition | null>(null);
  const [bonExp, setBonExp] = useState<Expedition | null>(null);

  // Mémorise la période, le tri et « mes commandes » d'une visite à l'autre
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ periode, tri, mes }));
    } catch {
      /* stockage indisponible : sans effet */
    }
  }, [periode, tri, mes]);

  // Toute modification de filtre ramène à la première page de résultats
  useEffect(() => {
    setLimite(PAGE);
  }, [search, statut, periode, tri, mes, site, zone, commercial, mode, reliquats]);

  /**
   * Code de retrait : tout commercial (quel que soit le site ou l'auteur de la
   * commande) et l'admin — le client peut se présenter sur un autre site.
   * Le backend re-vérifie l'autorisation.
   */
  const peutVoirCode = !!user && (user.role === "admin" || user.role === "commercial");
  const estCommercial = user?.role === "commercial";

  const cloisonne = user?.role === "coordinateur" || user?.role === "responsable";
  const cleCache = cloisonne ? `expeditions-file-${user?.email}` : "expeditions";

  const {
    data: exps = [],
    isLoading,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    // Coordinateur / responsable : le serveur cloisonne selon le compte (site, magasin)
    queryKey: ["expeditions", "file", cloisonne ? user?.email : "tous"],
    queryFn: async () => {
      const res = await api.expeditions.list(cloisonne ? { acteurEmail: user?.email } : undefined);
      cacheSet(cleCache, res);
      return res;
    },
    ...persistedCache<Expedition[]>(cleCache),
  });

  // Filtre « tout sauf le statut » : sert aussi à calculer les compteurs des pastilles
  const base = useMemo(() => {
    const term = search.trim();
    const monEmail = (user?.email || "").toLowerCase();
    return exps.filter((e) => {
      if (!dansPeriode(e.t0, periode)) return false;
      if (mes && String(e.commercialEmail || "").toLowerCase() !== monEmail) return false;
      if (site && siteDe(e.zone) !== site) return false;
      if (zone && e.zone !== zone && !(portee.zoneFixe && memeMagasin(e.zone, zone))) return false;
      if (commercial && e.commercialEmail !== commercial) return false;
      if (mode && (e.modeLivraison || "externe") !== mode) return false;
      if (reliquats && !e.expParentId) return false;
      if (!term) return true;
      return (
        includesLower(e.numCmdNav, term) ||
        includesLower(e.nomClient, term) ||
        includesLower(e.zone, term) ||
        includesLower(e.plaque, term) ||
        includesLower(e.chauffeur, term) ||
        includesLower(e.numeroBL, term) ||
        includesLower(e.numExpedition, term) ||
        includesLower(e.nomActeurCommercial, term)
      );
    });
  }, [exps, periode, search, mes, site, zone, commercial, mode, reliquats, user?.email, portee.zoneFixe]);

  const compteurs = useMemo(() => {
    const c: Record<string, number> = { all: base.length };
    base.forEach((e) => {
      c[e.statut] = (c[e.statut] || 0) + 1;
    });
    return c;
  }, [base]);

  const liste = useMemo(() => {
    const l = statut === "all" ? base.slice() : base.filter((e) => e.statut === statut);
    l.sort((a, b) => {
      const cmp = String(b.t0 || "").localeCompare(String(a.t0 || ""));
      return tri === "recent" ? cmp : -cmp;
    });
    return l;
  }, [base, statut, tri]);

  const visibles = liste.slice(0, limite);
  const groupes = useMemo(() => {
    const m = new Map<string, Expedition[]>();
    visibles.forEach((e) => {
      const j = jourISO(e.t0);
      if (!m.has(j)) m.set(j, []);
      m.get(j)!.push(e);
    });
    return Array.from(m.entries());
  }, [visibles]);

  // Choix proposés dans les listes déroulantes (selon les données chargées)
  const zones = useMemo(() => Array.from(new Set(exps.map((e) => e.zone).filter(Boolean))).sort(), [exps]);
  const commerciaux = useMemo(() => {
    const m = new Map<string, string>();
    exps.forEach((e) => {
      if (e.commercialEmail) m.set(e.commercialEmail, e.nomActeurCommercial || e.commercialEmail);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [exps]);

  const nbFiltresActifs = [siteChoisi, zoneChoisie, commercial, mode].filter(Boolean).length + (reliquats ? 1 : 0);
  const filtreModifie =
    nbFiltresActifs > 0 || !!search || statut !== "all" || mes || periode.preset !== "7";

  function reinitialiser() {
    setSearch("");
    setStatut("all");
    setPeriode(periodeDepuisPreset("7"));
    setMes(false);
    setSite("");
    setZone("");
    setCommercial("");
    setMode("");
    setReliquats(false);
  }

  const nbRetards = compteurs["retard_a_justifier"] || 0;

  return (
    <div className="h-full overflow-y-auto md:flex md:flex-col md:overflow-hidden">
      <PageHeader
        title="File des expéditions"
        subtitle={
          <>
            {liste.length} {liste.length > 1 ? "expéditions" : "expédition"}
            {nbRetards > 0 && <span className="text-bad font-medium">, dont {nbRetards} en retard</span>}
            {dataUpdatedAt > 0 && (
              <span className="hidden text-slate-400 sm:inline"> · mis à jour à {formatTime(new Date(dataUpdatedAt).toISOString())}</span>
            )}
          </>
        }
        actions={
          <>
            <button onClick={() => refetch()} disabled={isFetching} className="btn-outline" aria-label="Actualiser la liste">
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
            {(estCommercial || user?.role === "admin") && (
              <Link href="/nouvelle-demande" className="btn-primary">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Nouvelle demande</span>
                <span className="sm:hidden">Nouvelle</span>
              </Link>
            )}
          </>
        }
      >
        {/* Recherche + filtres */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une commande, un client, une plaque…"
              className="input pl-9 pr-9"
              aria-label="Rechercher une expédition"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                aria-label="Effacer la recherche"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <button
            onClick={() => setFiltresOuverts((v) => !v)}
            className={cn("btn-outline md:hidden", nbFiltresActifs > 0 && "border-brand-300 text-brand-800")}
            aria-expanded={filtresOuverts}
            aria-label="Filtres"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {nbFiltresActifs > 0 && <span className="num">{nbFiltresActifs}</span>}
          </button>

          <PeriodeSelect value={periode} onChange={setPeriode} />
        </div>

        <div className={cn("flex-wrap items-center gap-2", filtresOuverts ? "flex" : "hidden md:flex")}>
          {portee.siteFixe ? (
            <Verrou texte={portee.siteFixe} />
          ) : (
            <Select value={siteChoisi} onChange={setSite} placeholder="Tous sites" options={["Dakar", "Diamniadio"].map((s) => [s, s])} />
          )}
          {portee.zoneFixe ? (
            <Verrou texte={portee.zoneFixe} />
          ) : (
            <Select
              value={zoneChoisie}
              onChange={setZone}
              placeholder="Tous magasins"
              options={zones.filter((z) => !site || siteDe(z) === site).map((z) => [z, z])}
            />
          )}
          <Select value={commercial} onChange={setCommercial} placeholder="Tous commerciaux" options={commerciaux} />
          <Select
            value={mode}
            onChange={setMode}
            placeholder="Tous modes"
            options={[
              ["interne", "Livraison interne"],
              ["externe", "Retrait / externe"],
            ]}
          />
          <Toggle checked={reliquats} onChange={setReliquats} label="Reliquats" />
          {estCommercial && <Toggle checked={mes} onChange={setMes} label="Mes commandes" />}
        </div>

        {/* Statuts avec compteurs */}
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="Filtrer par statut">
          {STATUTS.map((s) => {
            const n = compteurs[s.value] || 0;
            const actif = statut === s.value;
            return (
              <button
                key={s.value}
                role="tab"
                aria-selected={actif}
                onClick={() => setStatut(s.value)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  actif
                    ? "border-brand-700 bg-brand-700 text-white"
                    : "border-line bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                  !actif && s.value === "retard_a_justifier" && n > 0 && "border-red-200 text-red-700",
                )}
              >
                {s.label}
                <span
                  className={cn(
                    "num rounded-full px-1.5 text-xs",
                    actif ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {n}
                </span>
              </button>
            );
          })}
          {filtreModifie && (
            <button onClick={reinitialiser} className="ml-1 shrink-0 text-sm font-medium text-brand-700 hover:underline">
              Réinitialiser
            </button>
          )}
          <div className="ml-auto shrink-0 pl-2">
            <select
              value={tri}
              onChange={(e) => setTri(e.target.value as Tri)}
              className="rounded-ctl border-0 bg-transparent py-1 pr-7 text-sm text-slate-600 focus:ring-2 focus:ring-brand-200"
              aria-label="Trier"
            >
              <option value="recent">Plus récentes d'abord</option>
              <option value="ancien">Plus anciennes d'abord</option>
            </select>
          </div>
        </div>
      </PageHeader>

      {/* Liste */}
      <div className="px-4 py-4 sm:px-6 md:flex-1 md:overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card animate-pulse p-4">
                <div className="mb-2 h-4 w-1/3 rounded bg-slate-100" />
                <div className="h-3 w-2/3 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card border-red-200 bg-red-50 p-6">
            <h3 className="mb-1 font-semibold text-red-900">Impossible de charger les expéditions</h3>
            <p className="text-sm text-red-700">{error instanceof Error ? error.message : "Erreur inconnue"}</p>
            <button onClick={() => refetch()} className="btn-outline mt-3">
              Réessayer
            </button>
          </div>
        ) : liste.length === 0 ? (
          <div className="card mx-auto max-w-md p-10 text-center">
            <p className="font-medium text-slate-800">Aucune expédition ne correspond.</p>
            <p className="mt-1 text-sm text-slate-500">
              {periode.preset !== "all" ? "Essaie d'élargir la période ou de retirer un filtre." : "Retire un filtre pour voir plus de résultats."}
            </p>
            {filtreModifie && (
              <button onClick={reinitialiser} className="btn-outline mt-4">
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-6">
            {groupes.map(([jour, items]) => (
              <section key={jour || "inconnu"}>
                <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold capitalize text-slate-700">
                  {formatJourLong(jour)}
                  <span className="num text-xs font-normal text-slate-400">{items.length}</span>
                </h2>
                <div className="space-y-2">
                  {items.map((e) => (
                    <ExpeditionRow
                      key={e.id}
                      exp={e}
                      showCode={peutVoirCode}
                      showBon={peutVoirCode && !!e.tEntreeSite}
                      onShowCode={() => setCodeExp(e)}
                      onShowBon={() => setBonExp(e)}
                    />
                  ))}
                </div>
              </section>
            ))}

            {liste.length > visibles.length && (
              <div className="flex flex-col items-center gap-1 pb-4">
                <button onClick={() => setLimite((l) => l + PAGE)} className="btn-outline">
                  Afficher {Math.min(PAGE, liste.length - visibles.length)} de plus
                </button>
                <span className="text-xs text-slate-400">
                  {visibles.length} sur {liste.length}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {codeExp && <CodeRetraitModal exp={codeExp} open onClose={() => setCodeExp(null)} />}
      {bonExp && <BonLivraisonModal exp={bonExp} open onClose={() => setBonExp(null)} />}
    </div>
  );
}

// ─── Composants de page ─────────────────────────────────────────────────────

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={placeholder}
      className={cn("input w-auto max-w-[200px] py-1.5 pr-8", value && "border-brand-400 bg-brand-50 text-brand-900")}
    >
      <option value="">{placeholder}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex items-center gap-2 rounded-ctl border px-2.5 py-1.5 text-sm transition-colors",
        checked ? "border-brand-400 bg-brand-50 text-brand-900" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
      )}
    >
      <span className={cn("relative h-4 w-7 rounded-full transition-colors", checked ? "bg-brand-600" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", checked ? "left-3.5" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}

function ExpeditionRow({
  exp,
  showCode,
  showBon,
  onShowCode,
  onShowBon,
}: {
  exp: Expedition;
  showCode: boolean;
  showBon: boolean;
  onShowCode: () => void;
  onShowBon: () => void;
}) {
  return (
    <article className="card card-hover relative overflow-hidden py-3 pl-5 pr-4">
      <span className={cn("absolute inset-y-0 left-0 w-1", STATUT_BAR[exp.statut] ?? "bg-slate-200")} aria-hidden />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
        {/* Identité de l'expédition */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <span className="num font-medium text-slate-900">{exp.numCmdNav || "Sans n° de commande"}</span>
            <span className="truncate font-semibold text-slate-900">{exp.nomClient || "Client inconnu"}</span>
            {exp.expParentId && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">Reliquat</span>
            )}
            {exp.modeLivraison === "interne" && (
              <span className="rounded bg-brand-100 px-1.5 py-0.5 text-xs font-medium text-brand-800">Livraison interne</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500">
            <span className="text-slate-600">{exp.zone}</span>
            {exp.plaque && (
              <span className="inline-flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" />
                <span className="num">{exp.plaque}</span>
              </span>
            )}
            {exp.chauffeur && (
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {exp.chauffeur}
              </span>
            )}
            {exp.numeroBL && (
              <span className="inline-flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" />
                BL <span className="num">{exp.numeroBL}</span>
              </span>
            )}
            {exp.dureeService !== null && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {formatDuree(exp.dureeService)}
              </span>
            )}
            <span>
              Créée à <span className="num">{formatTime(exp.t0)}</span>
              {exp.nomActeurCommercial ? ` par ${exp.nomActeurCommercial}` : ""}
            </span>
          </div>
        </div>

        {/* Progression */}
        <div className="w-full max-w-[260px] lg:w-[230px] lg:shrink-0">
          <JalonTimeline exp={exp} compact />
        </div>

        {/* Statut + actions */}
        <div className="flex flex-wrap items-center gap-2 lg:w-[290px] lg:shrink-0 lg:flex-col lg:items-end lg:gap-2">
          <StatutBadge statut={exp.statut} />
          {exp.dossierPhotosUrl && (
            <a
              href={exp.dossierPhotosUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-outline px-2.5 py-1.5 text-[13px]"
              title="Ouvrir le dossier Drive des photos de chargement"
            >
              <Camera className="h-3.5 w-3.5 text-slate-500" />
              Photos ({exp.nbPhotosChargement ?? 0})
            </a>
          )}
          {(showBon || showCode) && (
            <div className="flex items-center gap-2 max-sm:ml-auto">
              {showBon && (
                <button
                  type="button"
                  onClick={onShowBon}
                  className="btn-outline px-2.5 py-1.5 text-[13px]"
                  title="Imprimer le bon de livraison à remettre au chauffeur"
                >
                  <FileText className="h-3.5 w-3.5 text-slate-500" />
                  Bon
                </button>
              )}
              {showCode && (
                <button
                  type="button"
                  onClick={onShowCode}
                  className="btn-outline border-brand-200 bg-brand-50 px-2.5 py-1.5 text-[13px] text-brand-800 hover:bg-brand-100"
                  title="Voir le code de retrait (consultation tracée)"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Code de retrait
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
