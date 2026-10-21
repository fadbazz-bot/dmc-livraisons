import { Calendar, Lock } from "lucide-react";
import { PRESETS_PERIODE, periodeDepuisPreset, type Periode, type PresetPeriode } from "@/lib/periode";
import { SITES, ZONES_MAGASIN, type Portee } from "@/lib/portee";
import type { Filtres } from "@/lib/useFiltres";
import { cn } from "@/lib/cn";

/** Sélecteur de période : raccourcis (aujourd'hui, 7 j, ce mois…) + dates précises. */
export function PeriodeSelect({
  value,
  onChange,
  className,
}: {
  value: Periode;
  onChange: (p: Periode) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
      <select
        aria-label="Période"
        className="input w-auto py-1.5 pr-8 text-sm"
        value={value.preset}
        onChange={(e) => {
          const preset = e.target.value as PresetPeriode;
          onChange(preset === "perso" ? { ...periodeDepuisPreset("perso"), debut: value.debut, fin: value.fin } : periodeDepuisPreset(preset));
        }}
      >
        {PRESETS_PERIODE.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      {value.preset === "perso" && (
        <>
          <input
            type="date"
            aria-label="Du"
            className="input w-36 py-1.5 px-2 text-sm"
            value={value.debut}
            max={value.fin || undefined}
            onChange={(e) => onChange({ ...value, debut: e.target.value })}
          />
          <span className="text-slate-400">→</span>
          <input
            type="date"
            aria-label="Au"
            className="input w-36 py-1.5 px-2 text-sm"
            value={value.fin}
            min={value.debut || undefined}
            onChange={(e) => onChange({ ...value, fin: e.target.value })}
          />
        </>
      )}
    </div>
  );
}

export function Verrou({ texte }: { texte: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-ctl border border-line bg-slate-50 px-2.5 py-1.5 text-sm text-slate-600"
      title="Selon ton rôle, tu vois uniquement ce périmètre"
    >
      <Lock className="h-3.5 w-3.5 text-slate-400" />
      {texte}
    </span>
  );
}

/**
 * Filtres site + magasin, limités par les droits : un contrôleur ou un responsable
 * voit son site (verrouillé) ; un responsable voit en plus son type de magasin.
 */
export function SiteMagasinSelect({
  portee,
  site,
  zone,
  onSite,
  onZone,
}: {
  portee: Portee;
  site: string;
  zone: string;
  onSite: (v: string) => void;
  onZone: (v: string) => void;
}) {
  const cls = (v: string) => cn("input w-auto py-1.5 pr-8 text-sm", v && "border-brand-400 bg-brand-50 text-brand-900");
  return (
    <>
      {portee.siteFixe ? (
        <Verrou texte={portee.siteFixe} />
      ) : (
        <select aria-label="Site" className={cls(site)} value={site} onChange={(e) => onSite(e.target.value)}>
          <option value="">Tous les sites</option>
          {SITES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {portee.zoneFixe ? (
        <Verrou texte={portee.zoneFixe} />
      ) : (
        <select aria-label="Magasin" className={cls(zone)} value={zone} onChange={(e) => onZone(e.target.value)}>
          <option value="">Tous les magasins</option>
          {ZONES_MAGASIN.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      )}
    </>
  );
}

/** Barre complète : site + magasin + période (la période est facultative). */
export function BarreFiltres({ f, periode = true, className }: { f: Filtres; periode?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <SiteMagasinSelect portee={f.portee} site={f.site} zone={f.zone} onSite={f.setSite} onZone={f.setZone} />
      {periode && <PeriodeSelect value={f.periode} onChange={f.setPeriode} />}
    </div>
  );
}
