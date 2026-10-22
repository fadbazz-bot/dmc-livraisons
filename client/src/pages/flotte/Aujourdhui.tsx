import { useMemo, useState } from "react";
import { BarreFiltres } from "@/components/FiltresPortee";
import { useFiltres } from "@/lib/useFiltres";
import { periodeDepuisPreset } from "@/lib/periode";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/api/appsScript";
import { FlotteLayout } from "@/components/FlotteLayout";
import { Legende, TableauSite, siteDe } from "@/components/flotte/TableauLivraisons";
import { plaquesConnues } from "@/components/flotte/attribution";
import { correspond } from "@/lib/similarite";

/**
 * Vue du jour du responsable des chauffeurs.
 *  - Livraisons internes dont la date prévue est AUJOURD'HUI
 *  - + les retards (date prévue dépassée, toujours "en attente"), en rouge
 * Deux tableaux : Dakar et Diamniadio.
 * Le responsable : choisit le type de mouvement, indique si c'était préparé la veille,
 * affecte chauffeur ET véhicule (deux choix distincts) puis VALIDE l'attribution (sinon "A ATTRIBUER"),
 * et renseigne la date de livraison réelle + l'état.
 */

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

  const plaques = useMemo(() => plaquesConnues(chauffeurs, livraisons), [chauffeurs, livraisons]);

  const lignes = useMemo(() => {
    const out = livraisons.filter((l) => {
      const prevue = l.dateLivraisonPrevue;
      if (!prevue) return false;
      if (prevue === today) return true;
      return prevue < today && l.etat === "en_attente"; // retard non soldé
    });
    const filtered = search.trim()
      ? out.filter((l) => correspond(`${l.numCmdNav} ${l.nomClient} ${l.zone} ${l.chauffeurNom} ${l.chauffeurPlaque} ${l.commercialNom}`, search))
      : out;
    // Urgences d'abord, puis retards (les plus anciens en tête), puis heure d'inscription
    return filtered.sort((a, b) => {
      if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
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
            <TableauSite key={site} site={site} lignes={parSite[site]} chauffeurs={chauffeurs} plaques={plaques} today={today} />
          ))
        )}
      </div>
    </FlotteLayout>
  );
}
