import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/api/appsScript";
import type { ChauffeurFlotte, EtatLivraison, LivraisonFlotte, PrepareVeille, TypeMouvement } from "@/types/domain";
import { useToast } from "@/components/Toast";
import { UrgentBadge } from "@/components/UrgentBadge";
import { BoutonValider, ChampVehicule, SelectChauffeur, useAttribution } from "@/components/flotte/attribution";
import { cn } from "@/lib/cn";

export const ETATS: { value: EtatLivraison; label: string }[] = [
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

export function siteDe(zone: string): "Dakar" | "Diamniadio" {
  return zone.toLowerCase().includes("diamniadio") ? "Diamniadio" : "Dakar";
}

export function joursEntre(dateIso: string, aujourdhui: string): number {
  const a = new Date(dateIso + "T00:00:00Z").getTime();
  const b = new Date(aujourdhui + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

/** « demain », « dans 3 j », « aujourd'hui », « hier »… */
export function libelleJour(dateIso: string | null, today: string): string {
  if (!dateIso) return "Sans date";
  const d = joursEntre(today, dateIso); // jours à venir
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return "Demain";
  if (d === -1) return "Hier";
  if (d > 1) return `Dans ${d} j`;
  return `Retard ${-d} j`;
}

export function Legende() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm border border-slate-200 bg-white" /> Prévue
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-red-100 border border-red-300" /> En retard (date prévue dépassée)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-amber-100 border border-amber-300" /> A ATTRIBUER
      </span>
      <span className="inline-flex items-center gap-1.5">
        <UrgentBadge /> jour même
      </span>
    </div>
  );
}

export function TableauSite({
  site, lignes, chauffeurs, plaques, today, montrerDatePrevue,
}: {
  site: string;
  lignes: LivraisonFlotte[];
  chauffeurs: ChauffeurFlotte[];
  plaques: string[];
  today: string;
  montrerDatePrevue?: boolean;
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
                  <th className="px-3 py-2.5 text-left">Mouvement / préparé</th>
                  <th className="px-3 py-2.5 text-left">Chauffeur et véhicule</th>
                  <th className="px-3 py-2.5 text-left">Date réelle</th>
                  <th className="px-3 py-2.5 text-left">État et sortie du site</th>
                  <th className="px-3 py-2.5 text-right md:sticky md:right-0 bg-slate-50 md:shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.18)]">Attribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 max-md:block">
                {lignes.map((l) => (
                  <Ligne key={l.id} l={l} chauffeurs={chauffeurs} plaques={plaques} today={today} montrerDatePrevue={montrerDatePrevue} />
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
  l, chauffeurs, plaques, today, montrerDatePrevue,
}: {
  l: LivraisonFlotte;
  chauffeurs: ChauffeurFlotte[];
  plaques: string[];
  today: string;
  montrerDatePrevue?: boolean;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const att = useAttribution(l, chauffeurs);

  // État local pour que les listes ne "reviennent" pas en arrière pendant l'appel Apps Script
  const [mouvement, setMouvement] = useState<TypeMouvement>(l.typeMouvement || "livraison");
  const [prepare, setPrepare] = useState<PrepareVeille>(l.prepareVeille || "");
  const [dateReelle, setDateReelle] = useState(l.dateReelleSaisie || l.dateLivraisonReelle || "");
  const [etat, setEtat] = useState<EtatLivraison>(l.etat);

  const retardJours = l.dateLivraisonPrevue ? joursEntre(l.dateLivraisonPrevue, today) : 0;
  const enRetard = retardJours > 0;
  const aAttribuer = !att.validee && etat === "en_attente";

  const refresh = () => qc.invalidateQueries({ queryKey: ["flotte-livraisons"] });
  const suivi = useMutation({
    mutationFn: (fields: Parameters<typeof api.flotteLivraisons.updateSuivi>[0]) => api.flotteLivraisons.updateSuivi(fields),
    onSuccess: refresh,
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erreur d'enregistrement");
      refresh();
    },
  });

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
  const cellMobile = "max-md:grid max-md:grid-cols-[104px_1fr] max-md:items-center max-md:gap-2 max-md:px-4 max-md:py-1.5";

  return (
    <tr
      className={cn(
        "align-top max-md:block max-md:pb-3 transition-colors",
        l.urgent ? "bg-red-50 border-l-4 border-red-600" : enRetard ? "bg-red-50 border-l-4 border-red-400" : "bg-white hover:bg-slate-50",
      )}
    >
      <td className="px-3 py-2 min-w-[210px] max-md:block max-md:px-4 max-md:pt-3 max-md:pb-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="num whitespace-nowrap font-medium text-slate-800">{l.numCmdNav || "—"}</span>
          {l.urgent && <UrgentBadge />}
        </div>
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
        {montrerDatePrevue && l.dateLivraisonPrevue && (
          <span
            className={cn(
              "inline-block mt-1 rounded text-[10px] font-semibold px-1.5 py-0.5",
              enRetard ? "bg-red-100 text-red-700" : l.dateLivraisonPrevue === today ? "bg-brand-50 text-brand-800" : "bg-slate-100 text-slate-700",
            )}
          >
            {libelleJour(l.dateLivraisonPrevue, today)} · {l.dateLivraisonPrevue.split("-").reverse().join("/")}
          </span>
        )}
        {!montrerDatePrevue && enRetard && (
          <span className="inline-block mt-1 rounded bg-red-100 text-red-700 text-[10px] font-semibold px-1.5 py-0.5">
            Retard {retardJours} j (prévue {l.dateLivraisonPrevue})
          </span>
        )}
      </td>

      {/* Mouvement + préparé la veille : une seule colonne pour laisser de la place à l'attribution */}
      <td className="px-3 py-2 max-md:block max-md:p-0">
        <div className="space-y-1.5 max-md:space-y-0">
          <div className={cn(cellMobile)}>
            <span className="text-xs text-slate-500 md:hidden">Mouvement</span>
            <select
              aria-label="Mouvement"
              value={mouvement}
              onChange={(e) => {
                const v = e.target.value as TypeMouvement;
                setMouvement(v);
                suivi.mutate({ expId: l.id, typeMouvement: v });
              }}
              className="input py-1 px-2 text-xs w-32"
            >
              {MOUVEMENTS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className={cn(cellMobile)}>
            <span className="text-xs text-slate-500 md:hidden">Préparé la veille</span>
            <select
              aria-label="Préparé la veille"
              value={prepare}
              onChange={(e) => {
                const v = e.target.value as PrepareVeille;
                setPrepare(v);
                suivi.mutate({ expId: l.id, prepareVeille: v });
              }}
              className={cn(
                "input py-1 px-2 text-xs w-32",
                prepare === "PREPARER" && "border-emerald-400 bg-emerald-50",
                prepare === "NON PREPARER" && "border-red-300 bg-red-50",
              )}
            >
              <option value="">Préparé ? —</option>
              <option value="PREPARER">Préparé</option>
              <option value="NON PREPARER">Non préparé</option>
            </select>
          </div>
        </div>
      </td>

      <td className={cn("px-3 py-2 min-w-[210px]", cellMobile)}>
        <span className="text-xs text-slate-500 md:hidden">Chauffeur et véhicule</span>
        <div className="space-y-1.5">
          <SelectChauffeur value={att.chauffeurId} chauffeurs={chauffeurs} disabled={att.validee} aAttribuer={aAttribuer} onChange={att.changeChauffeur} />
          <ChampVehicule
            id={l.id}
            value={att.plaque}
            plaques={plaques}
            disabled={att.validee}
            onChange={att.setPlaque}
            onCommit={att.changePlaque}
          />
          {aAttribuer && att.chauffeurId && <div className="text-[10px] text-amber-700">Choisi mais non validé</div>}
        </div>
      </td>

      <td className={cn("px-3 py-2", cellMobile)}>
        <span className="text-xs text-slate-500 md:hidden">Date réelle</span>
        <div>
          <input type="date" value={dateReelle} onChange={(e) => changeDate(e.target.value)} className="input py-1 px-2 text-xs w-32" />
        </div>
      </td>

      <td className={cn("px-3 py-2", cellMobile)}>
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
              <option key={e.value} value={e.value}>{e.label}</option>
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
                  <span className="block mt-0.5 rounded bg-red-100 text-red-700 text-[10px] font-semibold px-1.5 py-0.5 w-fit">LOI 10h</span>
                )}
              </div>
            ) : (
              <span className="text-slate-500">{STATUT_SITE[l.statut] ?? l.statut}</span>
            )}
          </div>
        </div>
      </td>

      {/* Valider : toujours à droite de la ligne */}
      <td className="px-3 py-2 text-right md:sticky md:right-0 md:bg-inherit md:shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.18)] max-md:block max-md:px-4 max-md:pt-1 max-md:text-left">
        <BoutonValider validee={att.validee} pending={att.pending} onClick={att.basculer} />
      </td>
    </tr>
  );
}
