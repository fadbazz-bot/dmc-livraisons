import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Flag, Hourglass, UserRound } from "lucide-react";
import type { FriseLivraison as Frise, FriseSegment } from "@/api/appsScript";
import { cn } from "@/lib/cn";
import { formatDuree, formatTime } from "@/lib/format";

/** Libellés courts des causes possibles d'un retard (le serveur envoie les libellés complets). */
export const IMPUTATION_COURT: Record<string, string> = {
  magasin: "Le magasin",
  garde: "Poste de garde",
  showroom: "Agent showroom",
  commercial: "Commercial",
  client: "Client / chauffeur",
  autre: "Autre cause",
};

const ROLE_LABEL: Record<string, string> = {
  chef_poste: "Poste de garde",
  agent_showroom: "Agent showroom",
  responsable: "Responsable du magasin",
};

/** Une teinte par étape : on reconnaît l'étape d'un coup d'œil, la plus longue est cerclée de rouge. */
const TEINTE: Record<FriseSegment["code"], { barre: string; point: string; texte: string }> = {
  entree: { barre: "bg-sky-500", point: "bg-sky-500", texte: "text-sky-700" },
  magasin: { barre: "bg-violet-500", point: "bg-violet-500", texte: "text-violet-700" },
  photos: { barre: "bg-teal-500", point: "bg-teal-500", texte: "text-teal-700" },
  sortie: { barre: "bg-indigo-500", point: "bg-indigo-500", texte: "text-indigo-700" },
};

/** Recalcule les durées « en direct » : l'étape en cours grandit toute seule. */
function useDirect(f: Frise) {
  const [, setTick] = useState(0);
  const enCours = !f.termine && f.segments.some((s) => s.enCours);
  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, [enCours]);
  const segments = f.segments.map((s) =>
    s.enCours ? { ...s, dureeMin: Math.max(0, Math.round((Date.now() - new Date(s.debut).getTime()) / 60000)) } : s,
  );
  const debut = f.jalons[0] ? new Date(f.jalons[0].at).getTime() : null;
  const finMs = f.termine && f.jalons.length ? new Date(f.jalons[f.jalons.length - 1].at).getTime() : Date.now();
  const total = debut === null ? null : Math.max(0, Math.round((finMs - debut) / 60000));
  return { segments, total, enCours };
}

interface Calcul {
  segments: (FriseSegment & { grow: number; avant: number; croise: boolean; plusLongue: boolean })[];
  growTotal: number;
  marqueur: number | null; // position du seuil sur la barre (0–100 %)
}

function calculer(segments: FriseSegment[], seuil: number, total: number | null): Calcul {
  const somme = segments.reduce((a, s) => a + s.dureeMin, 0) || 1;
  const plancher = somme * 0.07; // une étape très courte reste visible
  let cum = 0;
  let growCum = 0;
  let marqueurGrow: number | null = null;
  const maxMin = Math.max(0, ...segments.map((s) => s.dureeMin));
  const out = segments.map((s) => {
    const grow = Math.max(s.dureeMin, plancher);
    const croise = cum < seuil && cum + s.dureeMin >= seuil && (total ?? 0) > seuil;
    if (croise && s.dureeMin > 0) marqueurGrow = growCum + ((seuil - cum) / s.dureeMin) * grow;
    const r = { ...s, grow, avant: cum, croise, plusLongue: segments.length > 1 && s.dureeMin === maxMin && maxMin > 0 };
    cum += s.dureeMin;
    growCum += grow;
    return r;
  });
  return { segments: out, growTotal: growCum, marqueur: marqueurGrow === null ? null : (marqueurGrow / growCum) * 100 };
}

function Barre({ c, hauteur = "h-7" }: { c: Calcul; hauteur?: string }) {
  return (
    <div className="relative">
      <div className={cn("flex w-full overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200", hauteur)}>
        {c.segments.map((s) => (
          <div
            key={s.code}
            style={{ flexGrow: s.grow, flexBasis: 0 }}
            title={`${s.label} — ${formatDuree(s.dureeMin)}`}
            className={cn(
              "relative min-w-0 flex items-center justify-center text-[11px] font-semibold text-white border-r border-white/70 last:border-r-0",
              TEINTE[s.code].barre,
              s.enCours && "animate-pulse opacity-80",
              s.plusLongue && "ring-2 ring-inset ring-red-600",
            )}
          >
            <span className="px-1 truncate num">{formatDuree(s.dureeMin)}</span>
          </div>
        ))}
      </div>
      {c.marqueur !== null && (
        <div className="pointer-events-none absolute -top-1 bottom-[-4px] w-0.5 bg-red-600" style={{ left: `${c.marqueur}%` }} title="Seuil dépassé ici">
          <Flag className="absolute -top-2 -left-[5px] h-3 w-3 text-red-600 fill-red-600" />
        </div>
      )}
    </div>
  );
}

/** Version compacte pour les listes : durée totale + barre. */
export function FriseMini({ f }: { f: Frise }) {
  const { segments, total } = useDirect(f);
  const c = calculer(segments, f.delaiMaxMin, total);
  const depasse = (total ?? 0) > f.delaiMaxMin;
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className={cn("num font-semibold", depasse ? "text-red-700" : "text-emerald-700")}>{formatDuree(total)}</span>
        <span className="text-slate-400">{f.termine ? "terminée" : "en cours"}</span>
      </div>
      {segments.length ? <Barre c={c} hauteur="h-4" /> : <div className="h-4 rounded bg-slate-100" />}
    </div>
  );
}

/**
 * Frise complète d'une livraison : où le temps est passé, étape par étape, et chez qui.
 * `onImputer` (coordinateur) : propose d'attribuer le retard à une autre cause, étape par étape.
 */
export function FriseLivraison({
  f,
  onImputer,
  imputationActive,
}: {
  f: Frise;
  onImputer?: (code: string) => void;
  imputationActive?: string;
}) {
  const { segments, total, enCours } = useDirect(f);
  const c = calculer(segments, f.delaiMaxMin, total);
  const depasse = (total ?? 0) > f.delaiMaxMin;
  const plusLongue = c.segments.find((s) => s.plusLongue);
  const premier = f.jalons[0];

  if (!premier) {
    return <div className="rounded-lg border border-line bg-slate-50 p-3 text-sm text-slate-500">Aucune étape enregistrée pour cette livraison pour l'instant.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-1.5">
          <Clock className="h-4 w-4 self-center text-slate-400" />
          <span className={cn("num text-2xl font-bold", depasse ? "text-red-700" : "text-emerald-700")}>{formatDuree(total)}</span>
          <span className="text-xs text-slate-500">de l'inscription {f.termine ? "à la sortie" : "à maintenant"}</span>
        </div>
        {depasse ? (
          <span className="badge-danger">+{formatDuree((total ?? 0) - f.delaiMaxMin)} au-delà des {f.delaiMaxMin} min</span>
        ) : (
          <span className="badge-success">Dans les {f.delaiMaxMin} min</span>
        )}
        {enCours && (
          <span className="inline-flex items-center gap-1 text-xs text-brand-700">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" /></span>
            En cours — se met à jour toute seule
          </span>
        )}
      </div>

      {segments.length > 0 ? (
        <>
          <Barre c={c} />
          {depasse && c.marqueur !== null && (
            <div className="text-[11px] text-red-700 flex items-center gap-1"><Flag className="h-3 w-3 fill-red-600" />Le seuil de {f.delaiMaxMin} min a été franchi pendant « {c.segments.find((s) => s.croise)?.label} ».</div>
          )}
        </>
      ) : (
        <div className="text-xs text-slate-500">La livraison n'a franchi qu'une seule étape pour l'instant.</div>
      )}

      {plusLongue && depasse && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-900 flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Étape la plus longue : {plusLongue.label}</span> — {formatDuree(plusLongue.dureeMin)}
            {total ? ` (${Math.round((plusLongue.dureeMin / Math.max(total, 1)) * 100)} % du temps)` : ""}.
            {plusLongue.acteurNom && <> Validée par {plusLongue.acteurNom}.</>}
          </div>
        </div>
      )}

      {/* Déroulé : repères (qui / quand) et durée de chaque étape entre deux repères */}
      <ol className="relative ml-1.5 border-l-2 border-slate-200 pl-5 space-y-3">
        {f.jalons.map((j, i) => {
          const seg = c.segments.find((s) => s.code === f.jalons[i + 1]?.code) ?? (i === f.jalons.length - 1 ? c.segments.find((s) => s.enCours) : undefined);
          return (
            <li key={j.code + j.at} className="space-y-2">
              <div className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-white ring-2 ring-slate-500" />
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="num font-semibold text-slate-900">{formatTime(j.at)}</span>
                  <span className="font-medium text-slate-800">{j.label}</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <UserRound className="h-3 w-3" />{j.acteurNom || "—"}
                  {j.detail && <span className="truncate"> · {j.detail}</span>}
                </div>
              </div>
              {seg && <Etape s={seg} total={total ?? 0} seuil={f.delaiMaxMin} onImputer={onImputer} imputationActive={imputationActive} />}
            </li>
          );
        })}
        {f.termine && (
          <li className="relative text-xs font-medium text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="absolute -left-[30px] h-4 w-4 bg-white text-emerald-600" />Livraison terminée
          </li>
        )}
      </ol>
    </div>
  );
}

function Etape({
  s, total, seuil, onImputer, imputationActive,
}: {
  s: Calcul["segments"][number];
  total: number;
  seuil: number;
  onImputer?: (code: string) => void;
  imputationActive?: string;
}) {
  const part = total > 0 ? Math.round((s.dureeMin / total) * 100) : 0;
  const lente = s.plusLongue && total > seuil;
  return (
    <div className={cn("rounded-lg border p-2.5 text-sm", lente ? "border-red-300 bg-red-50/60" : "border-line bg-white")}>
      <div className="flex items-start gap-2">
        <span className={cn("mt-1 h-2.5 w-2.5 rounded-full shrink-0", TEINTE[s.code].point, s.enCours && "animate-pulse")} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className={cn("font-medium", TEINTE[s.code].texte)}>{s.label}</span>
            <span className="num font-semibold text-slate-900">
              {s.enCours && <Hourglass className="inline h-3 w-3 mr-1 -mt-0.5 text-brand-600" />}
              {formatDuree(s.dureeMin)}
              <span className="text-xs font-normal text-slate-400"> · {part} %</span>
            </span>
          </div>
          <div className="text-xs text-slate-500">
            {s.enCours
              ? <>En cours depuis {formatTime(s.debut)} — en attente de : {ROLE_LABEL[s.acteurRole] ?? "—"}</>
              : <>{formatTime(s.debut)} → {formatTime(s.fin)}{s.acteurNom && <> · validé par {s.acteurNom} ({ROLE_LABEL[s.acteurRole] ?? s.acteurRole})</>}</>}
          </div>
          {(lente || s.croise) && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {lente && <span className="badge-danger">Étape la plus longue</span>}
              {s.croise && <span className="badge-warn">Seuil de {seuil} min franchi ici</span>}
            </div>
          )}
          {onImputer && s.suggestions.length > 0 && s.dureeMin >= 5 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500">Le temps perdu ici vient de :</span>
              {s.suggestions.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => onImputer(code)}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
                    imputationActive === code ? "bg-brand-900 text-white border-brand-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-400",
                  )}
                >
                  {IMPUTATION_COURT[code] ?? code}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
