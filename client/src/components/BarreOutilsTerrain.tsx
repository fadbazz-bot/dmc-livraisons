import { Search, ArrowUpDown, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { TRI_LABELS, type FiltresTerrain, type Tri } from "@/lib/listeTerrain";

export interface GroupePuces {
  id: string;
  options: { value: string; label: string; n?: number }[];
  value: string;
  onChange: (v: string) => void;
}

interface Props {
  f: FiltresTerrain;
  onChange: (f: FiltresTerrain) => void;
  placeholder?: string;
  tris?: Tri[];
  groupes?: GroupePuces[];
  /** nombre de résultats après filtre, pour « 3 sur 12 » */
  resultats?: number;
  total?: number;
}

/**
 * Barre de recherche, de tri et de filtres (pastilles) commune aux écrans terrain.
 * Les pastilles sont à choix unique ; recliquer sur la pastille active la désactive.
 */
export function BarreOutilsTerrain({ f, onChange, placeholder, tris = ["ancien", "recent", "client", "magasin"], groupes = [], resultats, total }: Props) {
  const actif =
    !!f.q || !!f.mag || !!f.site || !!f.extra || groupes.some((g) => g.value && g.value !== "");
  return (
    <div className="space-y-2" data-testid="barre-outils">
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={f.q}
            onChange={(e) => onChange({ ...f, q: e.target.value })}
            placeholder={placeholder ?? "Rechercher client, n° commande, plaque…"}
            className="input pl-9"
          />
        </div>
        <label className="relative shrink-0">
          <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <select
            aria-label="Trier par"
            value={f.tri}
            onChange={(e) => onChange({ ...f, tri: e.target.value as Tri })}
            className="input pl-8 pr-2 w-[9.5rem] sm:w-auto"
          >
            {tris.map((t) => (
              <option key={t} value={t}>{TRI_LABELS[t]}</option>
            ))}
          </select>
        </label>
      </div>

      {groupes.map((g) => (
        <div key={g.id} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {g.options.map((o) => {
            const on = g.value === o.value;
            return (
              <button
                key={o.value || "tous"}
                type="button"
                aria-pressed={on}
                onClick={() => g.onChange(on && o.value !== "" ? "" : o.value)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  on ? "border-brand-900 bg-brand-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                {o.label}
                {o.n !== undefined && <span className={cn("ml-1.5", on ? "text-white/80" : "text-slate-400")}>{o.n}</span>}
              </button>
            );
          })}
        </div>
      ))}

      {(actif || (resultats !== undefined && total !== undefined && resultats !== total)) && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {resultats !== undefined && total !== undefined ? `${resultats} sur ${total}` : ""}
          </span>
          {actif && (
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
              onClick={() => onChange({ ...f, q: "", mag: "", site: "", extra: "" })}
            >
              <X className="h-3 w-3" /> Effacer les filtres
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export const LABELS_MAGASIN: Record<string, string> = { parc: "Parc Acier", depot: "Dépôt", showroom: "Showroom", sav: "SAV" };

/** Pastilles standard : site (si le compte n'en a pas), magasin (si plusieurs), + un filtre libre. */
export function pastillesStandard(opts: {
  f: FiltresTerrain;
  onChange: (f: FiltresTerrain) => void;
  comptes: { mag: Record<string, number>; site: Record<string, number> };
  afficherSite?: boolean;
  magasins?: string[];
  extra?: { options: { value: string; label: string; n?: number }[] };
}): GroupePuces[] {
  const { f, onChange, comptes, afficherSite, magasins = [], extra } = opts;
  const out: GroupePuces[] = [];
  if (afficherSite) {
    out.push({
      id: "site",
      value: f.site,
      onChange: (v) => onChange({ ...f, site: v as FiltresTerrain["site"] }),
      options: [
        { value: "", label: "Les 2 sites" },
        { value: "Dakar", label: "Dakar", n: comptes.site["Dakar"] ?? 0 },
        { value: "Diamniadio", label: "Diamniadio", n: comptes.site["Diamniadio"] ?? 0 },
      ],
    });
  }
  if (magasins.length > 1) {
    out.push({
      id: "mag",
      value: f.mag,
      onChange: (v) => onChange({ ...f, mag: v as FiltresTerrain["mag"] }),
      options: [{ value: "", label: "Tous magasins" }, ...magasins.map((m) => ({ value: m, label: LABELS_MAGASIN[m], n: comptes.mag[m] ?? 0 }))],
    });
  }
  if (extra) {
    out.push({
      id: "extra",
      value: f.extra,
      onChange: (v) => onChange({ ...f, extra: v }),
      options: extra.options,
    });
  }
  return out;
}
