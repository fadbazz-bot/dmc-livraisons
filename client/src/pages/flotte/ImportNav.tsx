import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileUp, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { api } from "@/api/appsScript";
import { FlotteLayout } from "@/components/FlotteLayout";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

interface LigneNav {
  numCmdNav: string;
  depot?: string;
  dateLivraison?: string;
}

/**
 * Page Import NAV : upload CSV/TSV, parsing, preview, validation.
 * Format attendu : numCmdNav, depot (optionnel), dateLivraison (optionnel YYYY-MM-DD)
 * Séparateurs acceptés : virgule, point-virgule, tabulation.
 */
export default function ImportNavPage() {
  const toast = useToast();
  const [filename, setFilename] = useState<string | null>(null);
  const [lignes, setLignes] = useState<LigneNav[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const importer = useMutation({
    mutationFn: () => api.flotteLivraisons.importNav(lignes),
    onSuccess: (res) => {
      toast.success(
        `Import terminé : ${res.matchs} confirmées, ${res.dejaConfirmes} déjà OK, ${res.nonTrouves} non trouvées`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setParseError(null);
    setLignes([]);
    importer.reset();

    const reader = new FileReader();
    reader.onerror = () => setParseError("Lecture du fichier impossible");
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const parsed = parseCsv(text);
        if (parsed.length === 0) {
          setParseError("Le fichier ne contient aucune ligne exploitable");
          return;
        }
        setLignes(parsed);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Erreur de parsing");
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }

  return (
    <FlotteLayout subtitle="Import NAV — confirmation des livraisons facturées">
      <div className="space-y-4">
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
          <strong>Format attendu</strong> : un fichier CSV ou TSV exporté de NAV (séparateur virgule, point-virgule ou tabulation),
          avec en première ligne les en-têtes <code className="bg-blue-100 px-1 rounded">numCmdNav,depot,dateLivraison</code>.
          Le dépôt et la date de livraison sont optionnels.
        </div>

        <div className="card p-6">
          <label
            htmlFor="file-nav"
            className="flex flex-col items-center justify-center gap-2 h-40 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-colors"
          >
            <FileUp className="h-8 w-8 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              {filename ? `📄 ${filename}` : "Cliquer pour choisir un fichier CSV/TSV"}
            </span>
            <span className="text-xs text-slate-500">Ou glisser-déposer ici</span>
            <input
              id="file-nav"
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              onChange={handleFile}
              className="sr-only"
            />
          </label>
        </div>

        {parseError && (
          <div className="card p-3 border-red-200 bg-red-50 flex gap-2 items-start text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        {lignes.length > 0 && (
          <>
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Aperçu — {lignes.length} ligne{lignes.length > 1 ? "s" : ""} détectée
                    {lignes.length > 1 ? "s" : ""}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Vérifie l'extrait ci-dessous avant de lancer l'import.
                  </p>
                </div>
                <button
                  onClick={() => importer.mutate()}
                  disabled={importer.isPending}
                  className="btn-primary gap-2"
                >
                  <FileText className="h-4 w-4" />
                  {importer.isPending ? "Import en cours…" : `Confirmer l'import (${lignes.length})`}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left">N° Commande NAV</th>
                      <th className="px-3 py-2 text-left">Dépôt</th>
                      <th className="px-3 py-2 text-left">Date livraison</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lignes.slice(0, 20).map((l, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-mono text-xs">{l.numCmdNav}</td>
                        <td className="px-3 py-2 text-slate-700 text-xs">{l.depot || "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-600">
                          {l.dateLivraison || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lignes.length > 20 && (
                <p className="text-xs text-slate-500 mt-2">
                  + {lignes.length - 20} autres lignes non affichées
                </p>
              )}
            </div>
          </>
        )}

        {importer.data && (
          <div className="card p-4 border-emerald-300 bg-emerald-50/60">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <h3 className="text-sm font-semibold text-emerald-900">Résultat de l'import</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ResultStat label="Total" value={importer.data.totalLignes} />
              <ResultStat label="Confirmées" value={importer.data.matchs} accent="text-emerald-700" />
              <ResultStat label="Déjà OK" value={importer.data.dejaConfirmes} accent="text-slate-600" />
              <ResultStat label="Non trouvées" value={importer.data.nonTrouves} accent="text-red-600" />
            </div>
            {importer.data.nonTrouvesDetails.length > 0 && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-slate-700 font-medium">
                  Voir les lignes non trouvées
                </summary>
                <ul className="mt-2 space-y-1 text-slate-600">
                  {importer.data.nonTrouvesDetails.map((nt, i) => (
                    <li key={i} className="font-mono">
                      • {JSON.stringify(nt.ligne)} → {nt.raison}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </FlotteLayout>
  );
}

function ResultStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("text-xl font-bold mt-0.5", accent || "text-slate-900")}>{value}</div>
    </div>
  );
}

// ─── Parsing CSV/TSV ────────────────────────────────────────────────────────

/**
 * Parser CSV/TSV minimaliste mais robuste pour notre cas d'usage.
 * - Détecte automatiquement le séparateur (virgule, point-virgule, tab)
 * - Supporte les guillemets
 * - Lit les en-têtes pour mapper aux champs numCmdNav, depot, dateLivraison
 */
function parseCsv(text: string): LigneNav[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Détection séparateur
  const firstLine = trimmed.split(/\r?\n/)[0];
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) > 0
      ? ";"
      : (firstLine.match(/\t/g)?.length ?? 0) > 0
      ? "\t"
      : ",";

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === sep && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += c;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const idxNum = headers.findIndex((h) => h.includes("cmd") || h.includes("commande") || h.includes("nav"));
  const idxDep = headers.findIndex((h) => h.includes("depot") || h.includes("dépôt") || h.includes("zone"));
  const idxDate = headers.findIndex((h) => h.includes("date") || h.includes("livraison"));

  if (idxNum < 0) {
    throw new Error(
      "En-tête introuvable : il faut au moins une colonne 'numCmdNav' (ou 'NumCmd', 'Commande NAV', etc.)",
    );
  }

  const out: LigneNav[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const num = (cols[idxNum] || "").trim();
    if (!num) continue;
    const ligne: LigneNav = { numCmdNav: num };
    if (idxDep >= 0 && cols[idxDep]) ligne.depot = cols[idxDep].trim();
    if (idxDate >= 0 && cols[idxDate]) ligne.dateLivraison = cols[idxDate].trim();
    out.push(ligne);
  }
  return out;
}
