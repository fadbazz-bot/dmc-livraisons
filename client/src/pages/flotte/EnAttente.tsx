import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/api/appsScript";
import { FlotteLayout } from "@/components/FlotteLayout";
import { BarreFiltres } from "@/components/FiltresPortee";
import { Legende, TableauSite, joursEntre, siteDe } from "@/components/flotte/TableauLivraisons";
import { plaquesConnues } from "@/components/flotte/attribution";
import { useFiltres } from "@/lib/useFiltres";
import { periodeDepuisPreset } from "@/lib/periode";
import { correspond } from "@/lib/similarite";
import { cn } from "@/lib/cn";

type Echeance = "" | "urgent" | "retard" | "aujourdhui" | "demain" | "plus_tard" | "a_attribuer";

/**
 * Vue d'ensemble de TOUTES les livraisons flotte pas encore soldées, toutes dates confondues :
 * le point de passage entre « Aujourd'hui » et « Planifiées ». C'est ici que le responsable des
 * chauffeurs prépare la veille : il attribue chauffeur et véhicule, puis valide à droite de la ligne.
 */
export default function EnAttentePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [search, setSearch] = useState("");
  const [echeance, setEcheance] = useState<Echeance>("");
  const f = useFiltres(periodeDepuisPreset("today"));

  const { data: livraisons = [], isLoading, error } = useQuery({
    queryKey: ["flotte-livraisons", "en-attente", f.site, f.zone],
    queryFn: () => api.flotteLivraisons.list({ enAttente: true, site: f.site || undefined, magasin: f.zone || undefined }),
  });
  const { data: chauffeurs = [] } = useQuery({
    queryKey: ["flotte-chauffeurs", "actifs"],
    queryFn: () => api.flotteChauffeurs.list(true),
  });
  const plaques = useMemo(() => plaquesConnues(chauffeurs, livraisons), [chauffeurs, livraisons]);

  const jours = (l: { dateLivraisonPrevue: string | null }) => (l.dateLivraisonPrevue ? joursEntre(today, l.dateLivraisonPrevue) : 99);
  const compte = useMemo(
    () => ({
      urgent: livraisons.filter((l) => l.urgent).length,
      retard: livraisons.filter((l) => jours(l) < 0).length,
      aujourdhui: livraisons.filter((l) => jours(l) === 0).length,
      demain: livraisons.filter((l) => jours(l) === 1).length,
      plus_tard: livraisons.filter((l) => jours(l) > 1).length,
      a_attribuer: livraisons.filter((l) => !l.attributionValidee).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [livraisons, today],
  );

  const lignes = useMemo(() => {
    const ok = livraisons.filter((l) => {
      if (search.trim() && !correspond(`${l.numCmdNav} ${l.nomClient} ${l.zone} ${l.chauffeurNom} ${l.chauffeurPlaque} ${l.commercialNom}`, search)) return false;
      switch (echeance) {
        case "urgent": return !!l.urgent;
        case "retard": return jours(l) < 0;
        case "aujourdhui": return jours(l) === 0;
        case "demain": return jours(l) === 1;
        case "plus_tard": return jours(l) > 1;
        case "a_attribuer": return !l.attributionValidee;
        default: return true;
      }
    });
    return ok.sort((a, b) => {
      if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
      return String(a.dateLivraisonPrevue ?? "9999").localeCompare(String(b.dateLivraisonPrevue ?? "9999")) || String(a.t0).localeCompare(String(b.t0));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livraisons, search, echeance, today]);

  const parSite = { Dakar: lignes.filter((l) => siteDe(l.zone) === "Dakar"), Diamniadio: lignes.filter((l) => siteDe(l.zone) === "Diamniadio") };

  const puces: { value: Echeance; label: string; n?: number; rouge?: boolean }[] = [
    { value: "", label: "Toutes", n: livraisons.length },
    { value: "urgent", label: "Urgentes", n: compte.urgent, rouge: true },
    { value: "retard", label: "En retard", n: compte.retard, rouge: true },
    { value: "aujourdhui", label: "Aujourd'hui", n: compte.aujourdhui },
    { value: "demain", label: "Demain", n: compte.demain },
    { value: "plus_tard", label: "Plus tard", n: compte.plus_tard },
    { value: "a_attribuer", label: "À valider", n: compte.a_attribuer },
  ];

  return (
    <FlotteLayout subtitle={`En attente · ${livraisons.length} livraison(s) à faire, toutes dates confondues`}>
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher commande, client, chauffeur, véhicule, commercial…"
            className="input pl-9"
          />
        </div>

        <BarreFiltres f={f} periode={false} />

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {puces.map((p) => (
            <button
              key={p.value || "toutes"}
              type="button"
              aria-pressed={echeance === p.value}
              onClick={() => setEcheance(echeance === p.value ? "" : p.value)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                echeance === p.value
                  ? "border-brand-900 bg-brand-900 text-white"
                  : p.rouge && (p.n ?? 0) > 0
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              )}
            >
              {p.label}
              {p.n !== undefined && <span className="ml-1.5 opacity-70">{p.n}</span>}
            </button>
          ))}
        </div>

        <Legende />

        {isLoading ? (
          <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>
        ) : error ? (
          <div className="card p-6 border-red-200 bg-red-50 text-sm text-red-700">{error instanceof Error ? error.message : "Erreur"}</div>
        ) : (
          (["Dakar", "Diamniadio"] as const)
            .filter((s) => !f.site || s === f.site)
            .map((site) => (
              <TableauSite key={site} site={site} lignes={parSite[site]} chauffeurs={chauffeurs} plaques={plaques} today={today} montrerDatePrevue />
            ))
        )}
      </div>
    </FlotteLayout>
  );
}
