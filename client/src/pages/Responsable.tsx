import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wrench, RefreshCw, KeyRound, Camera, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "@/api/appsScript";
import { useAuth } from "@/lib/auth";
import { cacheSet, persistedCache } from "@/lib/persistentCache";
import type { Expedition } from "@/types/domain";
import { StatutBadge } from "@/components/StatutBadge";
import { JalonTimeline } from "@/components/JalonTimeline";
import { SaisieCodeModal } from "@/components/modals/SaisieCodeModal";
import { PhotosChargementModal } from "@/components/modals/PhotosChargementModal";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import { UrgentBadge } from "@/components/UrgentBadge";
import { BarreOutilsTerrain, pastillesStandard } from "@/components/BarreOutilsTerrain";
import { appliquer, compter, minutesDepuis, FILTRES_VIDES, type FiltresTerrain } from "@/lib/listeTerrain";

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
 * Action UNIQUE : confirmer l'arrivée du client (photo plaque / à pied) → chargement enclenché.
 *
 * Filtrage : les expéditions affichées sont celles avec un statut "entree_site"
 * (camion sur site, en attente du code), filtrées par catégorie de magasin
 * ET par site du responsable (voir zoneCategorie / zoneToSite ci-dessus).
 */
const PHOTOS_MIN = 3;

export default function ResponsablePage() {
  const { user } = useAuth();
  const myZone = user?.zone || "";
  const myCategorie = myZone ? zoneCategorie(myZone) : null;
  const [activeExp, setActiveExp] = useState<Expedition | null>(null);
  const [photoExp, setPhotoExp] = useState<Expedition | null>(null);
  const [section, setSection] = useState<"code" | "chargement">("code");
  const [fCode, setFCode] = useState<FiltresTerrain>({ ...FILTRES_VIDES });
  const [fCharg, setFCharg] = useState<FiltresTerrain>({ ...FILTRES_VIDES });

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

  // Filtre commun : ma catégorie de magasin et mon site
  const dansMonPerimetre = (e: Expedition) =>
    (!myCategorie || zoneCategorie(e.zone) === myCategorie) && (!user?.site || zoneToSite(e.zone) === user.site);

  // Camions sur site, en attente que le client présente son code
  const aTraiter = useMemo(
    () => exps.filter((e) => e.statut === "entree_site" && dansMonPerimetre(e)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exps, myCategorie, user?.site],
  );
  // Chargement en cours : photos du chargement à prendre avant le poste de garde
  const enChargement = useMemo(
    () =>
      exps.filter(
        (e) => (e.statut === "en_chargement" || e.statut === "pret_sortie") && dansMonPerimetre(e),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exps, myCategorie, user?.site],
  );
  const photosManquantes = enChargement.filter((e) => (e.nbPhotosChargement ?? 0) < PHOTOS_MIN).length;

  // Filtres : le site et le magasin ne sont proposés que si le compte n'y est pas déjà limité
  const afficherSite = !user?.site;
  const magasinsPropose = myCategorie ? [] : ["parc", "depot", "showroom", "sav"];
  const codeFiltres = useMemo(
    () => appliquer(aTraiter, fCode, "entree").filter((e) => fCode.extra !== "attente" || minutesDepuis(e.tEntreeSite) > 30),
    [aTraiter, fCode],
  );
  const chargFiltres = useMemo(
    () =>
      appliquer(enChargement, fCharg, "chargement").filter((e) => {
        const n = e.nbPhotosChargement ?? 0;
        if (fCharg.extra === "photos_manquantes") return n < PHOTOS_MIN;
        if (fCharg.extra === "pret") return n >= PHOTOS_MIN;
        return true;
      }),
    [enChargement, fCharg],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Préparation et chargement</h1>
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
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-ctl bg-slate-100 p-1">
          <button
            onClick={() => setSection("code")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-sm font-medium transition-colors",
              section === "code" ? "bg-white text-brand-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
            )}
          >
            <KeyRound className="h-4 w-4" />
            Arrivées
            {aTraiter.length > 0 && (
              <span className="rounded-full bg-brand-900 px-1.5 py-0.5 text-[10px] font-bold text-white">{aTraiter.length}</span>
            )}
          </button>
          <button
            onClick={() => setSection("chargement")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-sm font-medium transition-colors",
              section === "chargement" ? "bg-white text-brand-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
            )}
          >
            <Camera className="h-4 w-4" />
            Chargement
            {enChargement.length > 0 && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white", photosManquantes > 0 ? "bg-accent" : "bg-brand-900")}>
                {enChargement.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {section === "code" ? (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 mb-4 text-sm text-blue-900">
            Quand le véhicule du client arrive chez toi, <strong>photographie sa plaque</strong> (ou indique
            « client à pied ») pour <strong>enclencher le chargement</strong>. Plus besoin de code.
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4 text-sm text-amber-900">
            Une fois le véhicule chargé, <strong>photographie tous les articles</strong> avant que le véhicule
            passe au poste de garde. Sans photos, le garde ne peut pas valider la sortie.
          </div>
        )}

        {isLoading ? (
          <div className="card p-6 text-center text-slate-500 text-sm">Chargement…</div>
        ) : error ? (
          <div className="card p-6 border-red-200 bg-red-50">
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : "Erreur inconnue"}
            </p>
          </div>
        ) : section === "code" ? (
          <div className="space-y-3">
            <BarreOutilsTerrain
              f={fCode}
              onChange={setFCode}
              placeholder="Client, plaque, chauffeur, n° commande…"
              tris={["ancien", "recent", "client", "plaque", "magasin"]}
              groupes={pastillesStandard({
                f: fCode, onChange: setFCode, comptes: compter(aTraiter), afficherSite, magasins: magasinsPropose,
                extra: { options: [{ value: "", label: "Toutes" }, { value: "attente", label: "Sur site > 30 min", n: aTraiter.filter((e) => minutesDepuis(e.tEntreeSite) > 30).length }] },
              })}
              resultats={codeFiltres.length}
              total={aTraiter.length}
            />
            {codeFiltres.length === 0 ? (
              <div className="card p-10 text-center">
                <p className="text-slate-500">
                  {aTraiter.length ? "Aucun client ne correspond à ces filtres." : "Aucun client en route vers ton magasin."}
                </p>
                {!aTraiter.length && myZone && <p className="text-xs text-slate-400 mt-1">Filtre actif : zone « {myZone} ».</p>}
              </div>
            ) : (
              <div className="space-y-3">
                {codeFiltres.map((exp) => (
                  <ResponsableCard key={exp.id} exp={exp} onAction={() => setActiveExp(exp)} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <BarreOutilsTerrain
              f={fCharg}
              onChange={setFCharg}
              placeholder="Client, plaque, chauffeur, n° commande…"
              tris={["ancien", "recent", "client", "plaque", "magasin"]}
              groupes={pastillesStandard({
                f: fCharg, onChange: setFCharg, comptes: compter(enChargement), afficherSite, magasins: magasinsPropose,
                extra: {
                  options: [
                    { value: "", label: "Tous" },
                    { value: "photos_manquantes", label: "Photos manquantes", n: photosManquantes },
                    { value: "pret", label: "Photos OK", n: enChargement.length - photosManquantes },
                  ],
                },
              })}
              resultats={chargFiltres.length}
              total={enChargement.length}
            />
            {chargFiltres.length === 0 ? (
              <div className="card p-10 text-center">
                <p className="text-slate-500">
                  {enChargement.length ? "Aucun chargement ne correspond à ces filtres." : "Aucun chargement en cours."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {chargFiltres.map((exp) => (
                  <ChargementCard key={exp.id} exp={exp} onAction={() => setPhotoExp(exp)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {activeExp && (
        <SaisieCodeModal exp={activeExp} open onClose={() => setActiveExp(null)} />
      )}
      {photoExp && (
        <PhotosChargementModal exp={photoExp} open onClose={() => setPhotoExp(null)} />
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
            {exp.urgent && <UrgentBadge />}
            {exp.expParentId && (
              <span className="text-xs font-medium bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                Reliquat
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500 flex items-center gap-3 flex-wrap">
            <span>{exp.zone}</span>
            {exp.plaque && <span className="num">{exp.plaque}</span>}
            {exp.chauffeur && <span>{exp.chauffeur}</span>}
            <span>Entré {formatRelative(exp.tEntreeSite)}</span>
          </div>
        </div>
        <StatutBadge statut={exp.statut} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <JalonTimeline exp={exp} compact />
        <button onClick={onAction} className="btn-primary shrink-0 gap-2">
          <Camera className="h-4 w-4" />
          Client arrivé
        </button>
      </div>
    </div>
  );
}

function ChargementCard({ exp, onAction }: { exp: Expedition; onAction: () => void }) {
  const n = exp.nbPhotosChargement ?? 0;
  const ok = n >= PHOTOS_MIN;
  return (
    <div className="card card-hover p-4 animate-in">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-slate-900">{exp.numCmdNav || "—"}</span>
            <span className="text-slate-300">·</span>
            <span className="font-medium text-slate-800 truncate">{exp.nomClient || "Client inconnu"}</span>
            {exp.urgent && <UrgentBadge />}
            {exp.expParentId && (
              <span className="text-xs font-medium bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">Reliquat</span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500 flex items-center gap-3 flex-wrap">
            <span>{exp.zone}</span>
            {exp.plaque && <span className="num">{exp.plaque}</span>}
            {exp.chauffeur && <span>{exp.chauffeur}</span>}
          </div>
        </div>
        <span className={ok ? "badge-success" : "badge-warn"}>
          {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {n} photo{n > 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {ok ? "Photos faites : le véhicule peut passer au poste de garde." : `Minimum ${PHOTOS_MIN} photos avant le poste de garde.`}
        </p>
        <button onClick={onAction} className={cn("shrink-0 gap-2", ok ? "btn-outline" : "btn-primary")}>
          <Camera className="h-4 w-4" />
          {ok ? "Compléter" : "Photographier"}
        </button>
      </div>
    </div>
  );
}
