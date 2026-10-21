import { useMemo, useState } from "react";
import { BarreFiltres } from "@/components/FiltresPortee";
import { useFiltres } from "@/lib/useFiltres";
import { periodeDepuisPreset } from "@/lib/periode";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Lock, Unlock, Search } from "lucide-react";
import { api } from "@/api/appsScript";
import type {
  ChauffeurFlotte,
  EtatLivraison,
  LivraisonFlotte,
  PrepareVeille,
  TypeMouvement,
} from "@/types/domain";
import { FlotteLayout } from "@/components/FlotteLayout";
import { useToast } from "@/components/Toast";
import { cn, includesLower } from "@/lib/cn";

/**
 * Vue du jour du responsable des chauffeurs.
 *  - Livraisons internes dont la date prévue est AUJOURD'HUI
 *  - + les retards (date prévue dépassée, toujours "en attente"), en rouge
 * Deux tableaux : Dakar et Diamniadio.
 * Le responsable : choisit le type de mouvement, indique si c'était préparé la veille,
 * affecte chauffeur + véhicule puis VALIDE l'attribution (sinon "A ATTRIBUER"),
 * et renseigne la date de livraison réelle + l'état.
 */

const ETATS: { value: EtatLivraison; label: string }[] = [
  { value: "en_attente", label: "En attente" },
  { value: "livre", label: "Livré" },
  { value: "partiel", label: "Partiel" },
  { value: "non_livre", label: "Non livré" },
  { value: "recupere", label: "Récupéré" },
];

const MOUVEMENTS: { value: TypeMouvement; label: string }[] = [
  { value: "livraison", label: "Livraison" },
  { value: "transfert", label: "Transfert" },
  { value: "retour", label: "Retour" },
];

const STATUT_SITE: Record<string, string> = {
  en_attente: "Pas encore arrivé",
  entree_site: "Sur site",
  en_chargement: "En chargement",
  retard_a_justifier: "Sorti (retard)",
  sortie: "Sorti",
};

function siteDe(zone: string): "Dakar" | "Diamniadio" {
  return zone.toLowerCase().includes("diamniadio") ? "Diamniadio" : "Dakar";
}

function joursEntre(dateIso: string, aujourdhui: string): number {
  const a = new Date(dateIso + "T00:00:00Z").getTime();
  const b = new Date(aujourdhui + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

export default function AujourdhuiPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [search, setSearch] = useState("");
  const f = useFiltres(periodeDepuisPreset("today"));

  // Fenêtre de 45 jours (sur T0) pour retrouver les retards non soldés
  const dateDebut = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);

  const { data: livraisons = [], isLoading, error } = useQuery({
    queryKey: ["flotte-livraisons", "aujourdhui", dateDebut, today, f.site, f.zone],
    queryFn: () => api.flotteLivraisons.list({ dateDebut, dateFin: today, site: f.site || undefined, magasin: f.zone || undefined }),
  });

  const { data: chauffeurs = [] } = useQuery({
    queryKey: ["flotte-chauffeurs", "actifs"],
    queryFn: () => api.flotteChauffeurs.list(true),
  });

  const lignes = useMemo(() => {
    const out = livraisons.filter((l) => {
      const prevue = l.dateLivraisonPrevue;
      if (!prevue) return false;
      if (prevue === today) return true;
      return prevue < today && l.etat === "en_attente"; // retard non soldé
    });
    const filtered = search.trim()
      ? out.filter(
          (l) =>
            includesLower(l.numCmdNav, search) ||
            includesLower(l.nomClient, search) ||
            includesLower(l.zone, search) ||
            includesLower(l.chauffeurNom, search) ||
            includesLower(l.commercialNom, search),
        )
      : out;
    // Retards d'abord (les plus anciens en tête), puis heure d'inscription
    return filtered.sort((a, b) => {
      const ra = (a.dateLivraisonPrevue ?? today) < today ? 0 : 1;
      const rb = (b.dateLivraisonPrevue ?? today) < today ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return String(a.t0).localeCompare(String(b.t0));
    });
  }, [livraisons, today, search]);

  const parSite = {
    Dakar: lignes.filter((l) => siteDe(l.zone) === "Dakar"),
    Diamniadio: lignes.filter((l) => siteDe(l.zone) === "Diamniadio"),
  };

  const nbRetards = lignes.filter((l) => (l.dateLivraisonPrevue ?? today) < today).length;
  const nbAAttribuer = lignes.filter((l) => !l.attributionValidee && l.etat === "en_attente").length;

  return (
    <FlotteLayout
      subtitle={`Aujourd'hui · ${lignes.length - nbRetards} du jour · ${nbRetards} en retard · ${nbAAttribuer} à attribuer`}
    >
      <div className="space-y-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher commande, client, chauffeur, commercial…"
            className="input pl-9"
          />
        </div>

        <BarreFiltres f={f} periode={false} />

        <Legende />

        {isLoading ? (
          <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>
        ) : error ? (
          <div className="card p-6 border-red-200 bg-red-50 text-sm text-red-700">
            {error instanceof Error ? error.message : "Erreur"}
          </div>
        ) : (
          (["Dakar", "Diamniadio"] as const).filter((s) => !f.site || s === f.site).map((site) => (
            <TableauSite key={site} site={site} lignes={parSite[site]} chauffeurs={chauffeurs} today={today} />
          ))
        )}
      </div>
    </FlotteLayout>
  );
}

function Legende() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-slate-200 bg-white" /> Prévue aujourd'hui
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-red-100 border border-red-300" /> En retard (date prévue dépassée)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-amber-100 border border-amber-300" /> A ATTRIBUER
      </span>
    </div>
  );
}

function TableauSite({
  site,
  lignes,
  chauffeurs,
  today,
}: {
  site: string;
  lignes: LivraisonFlotte[];
  chauffeurs: ChauffeurFlotte[];
  today: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
        {site}
        <span className="text-xs font-medium text-slate-500">({lignes.length})</span>
      </h2>
      {lignes.length === 0 ? (
        <div className="card p-6 text-center text-sm text-slate-500">Aucune livraison pour {site}.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm max-md:block">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-200 max-md:hidden">
                <tr>
                  <th className="px-3 py-2.5 text-left">Commande / client</th>
                  <th className="px-3 py-2.5 text-left">Mouvement</th>
                  <th className="px-3 py-2.5 text-left">Préparé la veille</th>
                  <th className="px-3 py-2.5 text-left">Chauffeur / véhicule</th>
                  <th className="px-3 py-2.5 text-left">Date réelle</th>
                  <th className="px-3 py-2.5 text-left">État et sortie du site</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 max-md:block">
                {lignes.map((l) => (
                  <Ligne key={l.id} l={l} chauffeurs={chauffeurs} today={today} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Ligne({
  l,
  chauffeurs,
  today,
}: {
  l: LivraisonFlotte;
  chauffeurs: ChauffeurFlotte[];
  today: string;
}) {
  const toast = useToast();
  const qc = useQueryClient();

  // État local pour que les listes ne "reviennent" pas en arrière pendant l'appel Apps Script
  const [mouvement, setMouvement] = useState<TypeMouvement>(l.typeMouvement || "livraison");
  const [prepare, setPrepare] = useState<PrepareVeille>(l.prepareVeille || "");
  const [chauffeurId, setChauffeurId] = useState(l.chauffeurId || "");
  const [validee, setValidee] = useState(l.attributionValidee);
  const [dateReelle, setDateReelle] = useState(l.dateReelleSaisie || l.dateLivraisonReelle || "");
  const [etat, setEtat] = useState<EtatLivraison>(l.etat);

  const retardJours = l.dateLivraisonPrevue ? joursEntre(l.dateLivraisonPrevue, today) : 0;
  const enRetard = retardJours > 0;
  const aAttribuer = !validee && etat === "en_attente";

  const refresh = () => qc.invalidateQueries({ queryKey: ["flotte-livraisons"] });

  const suivi = useMutation({
    mutationFn: (fields: Parameters<typeof api.flotteLivraisons.updateSuivi>[0]) =>
      api.flotteLivraisons.updateSuivi(fields),
    onSuccess: refresh,
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erreur d'enregistrement");
      refresh();
    },
  });

  const attribution = useMutation({
    mutationFn: (input: { chauffeurId?: string; valider?: boolean }) =>
      api.flotteLivraisons.assignChauffeur({ expId: l.id, ...input }),
    onSuccess: refresh,
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erreur d'attribution");
      refresh();
    },
  });

  function changeChauffeur(id: string) {
    setChauffeurId(id);
    setValidee(false); // tout changement annule la validation
    attribution.mutate({ chauffeurId: id });
  }

  function basculerValidation() {
    if (!validee && !chauffeurId) {
      toast.error("Choisis d'abord un chauffeur / véhicule.");
      return;
    }
    const v = !validee;
    setValidee(v);
    attribution.mutate({ valider: v });
  }

  function changeEtat(e: EtatLivraison) {
    setEtat(e);
    const fields: Parameters<typeof api.flotteLivraisons.updateSuivi>[0] = { expId: l.id, etat: e };
    // Livré / partiel / récupéré : la date réelle est mise à aujourd'hui si elle est vide
    if (e !== "en_attente" && e !== "non_livre" && !dateReelle) {
      setDateReelle(today);
      fields.dateReelle = today;
    }
    suivi.mutate(fields);
  }

  function changeDate(v: string) {
    setDateReelle(v);
    suivi.mutate({ expId: l.id, dateReelle: v });
  }

  const sorti = !!l.tSortieSite;

  return (
    <tr
      className={cn(
        "align-top max-md:block max-md:pb-3",
        enRetard ? "bg-red-50/70 border-l-4 border-red-400" : "hover:bg-slate-50/60",
      )}
    >
      <td className="px-3 py-2 min-w-[230px] max-md:block max-md:px-4 max-md:pt-3 max-md:pb-1">
        <div className="num whitespace-nowrap font-medium text-slate-800">{l.numCmdNav || "—"}</div>
        <div className="font-medium text-slate-900 truncate max-w-[220px]" title={l.nomClient}>
          {l.nomClient || "—"}
        </div>
        <div className="text-[11px] text-slate-500 truncate max-w-[220px]">{l.zone} · {l.commercialNom}</div>
        <div className="text-[11px] text-slate-500">
          Inscrite à <span className="num">{l.heureInscription || "—"}</span>
          {l.inscriptionAvant16h !== null && (
            <span className={l.inscriptionAvant16h ? "text-emerald-700" : "text-orange-700"}>
              {l.inscriptionAvant16h ? " (avant 16h)" : " (après 16h)"}
            </span>
          )}
        </div>
        {enRetard && (
          <span className="inline-block mt-1 rounded bg-red-100 text-red-700 text-[10px] font-semibold px-1.5 py-0.5">
            Retard {retardJours} j (prévue {l.dateLivraisonPrevue})
          </span>
        )}
      </td>

      <td className="px-3 py-2 max-md:grid max-md:grid-cols-[104px_1fr] max-md:items-center max-md:gap-2 max-md:px-4 max-md:py-1.5">
        <span className="text-xs text-slate-500 md:hidden">Mouvement</span>
        <div>
        <select
          value={mouvement}
          onChange={(e) => {
            const v = e.target.value as TypeMouvement;
            setMouvement(v);
            suivi.mutate({ expId: l.id, typeMouvement: v });
          }}
          className="input py-1 px-2 text-xs w-32"
        >
          {MOUVEMENTS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        </div>
      </td>

      <td className="px-3 py-2 max-md:grid max-md:grid-cols-[104px_1fr] max-md:items-center max-md:gap-2 max-md:px-4 max-md:py-1.5">
        <span className="text-xs text-slate-500 md:hidden">Préparé la veille</span>
        <div>
        <select
          value={prepare}
          onChange={(e) => {
            const v = e.target.value as PrepareVeille;
            setPrepare(v);
            suivi.mutate({ expId: l.id, prepareVeille: v });
          }}
          className={cn(
            "input py-1 px-2 text-xs w-28",
            prepare === "PREPARER" && "border-emerald-400 bg-emerald-50",
            prepare === "NON PREPARER" && "border-red-300 bg-red-50",
          )}
        >
          <option value="">—</option>
          <option value="PREPARER">Préparé</option>
          <option value="NON PREPARER">Non préparé</option>
        </select>
        </div>
      </td>

      <td className="px-3 py-2 min-w-[250px] max-md:grid max-md:grid-cols-[104px_1fr] max-md:items-center max-md:gap-2 max-md:px-4 max-md:py-1.5">
        <span className="text-xs text-slate-500 md:hidden">Chauffeur / véhicule</span>
        <div>
        <div className="flex items-center gap-1.5">
          <select
            value={chauffeurId}
            disabled={validee}
            onChange={(e) => changeChauffeur(e.target.value)}
            className={cn(
              "input py-1 px-2 text-xs flex-1",
              aAttribuer && !chauffeurId && "border-amber-400 bg-amber-50 text-amber-800 font-semibold",
              validee && "bg-slate-50",
            )}
          >
            <option value="">A ATTRIBUER</option>
            {chauffeurs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} — {c.plaque}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={basculerValidation}
            disabled={attribution.isPending}
            title={validee ? "Attribution validée — cliquer pour déverrouiller" : "Valider l'attribution"}
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
              validee
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {validee ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {validee ? "Validé" : "Valider"}
          </button>
        </div>
        {aAttribuer && chauffeurId && (
          <div className="text-[10px] text-amber-700 mt-1">Choisi mais non validé</div>
        )}
        </div>
      </td>

      <td className="px-3 py-2 max-md:grid max-md:grid-cols-[104px_1fr] max-md:items-center max-md:gap-2 max-md:px-4 max-md:py-1.5">
        <span className="text-xs text-slate-500 md:hidden">Date réelle</span>
        <div>
        <input
          type="date"
          value={dateReelle}
          onChange={(e) => changeDate(e.target.value)}
          className="input py-1 px-2 text-xs w-32"
        />
        </div>
      </td>

      <td className="px-3 py-2 max-md:grid max-md:grid-cols-[104px_1fr] max-md:items-center max-md:gap-2 max-md:px-4 max-md:py-1.5">
        <span className="text-xs text-slate-500 md:hidden">État</span>
        <div>
        <select
          value={etat}
          onChange={(e) => changeEtat(e.target.value as EtatLivraison)}
          className={cn(
            "input py-1 px-2 text-xs w-32",
            etat === "livre" && "border-emerald-400 bg-emerald-50",
            etat === "partiel" && "border-amber-400 bg-amber-50",
            etat === "non_livre" && "border-red-300 bg-red-50",
            etat === "recupere" && "border-blue-300 bg-blue-50",
          )}
        >
          {ETATS.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
        <div className="mt-1.5 text-[11px]">
        {sorti ? (
          <div>
            <span className="inline-flex items-center gap-1 text-slate-700">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Sorti {l.heureSortieSite}
            </span>
            {l.loi10h && (
              <span className="block mt-0.5 rounded bg-red-100 text-red-700 text-[10px] font-semibold px-1.5 py-0.5 w-fit">
                LOI 10h
              </span>
            )}
          </div>
        ) : (
          <span className="text-slate-500">{STATUT_SITE[l.statut] ?? l.statut}</span>
        )}
        </div>
        </div>
      </td>
    </tr>
  );
}
