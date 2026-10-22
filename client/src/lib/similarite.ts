import type { Expedition } from "@/types/domain";

/**
 * Aide à ne pas confondre deux clients aux noms voisins (« Sow & Fils » / « Sow et Fils »,
 * « Diallo » / « Diallot »…). Les comparaisons ignorent majuscules, accents, ponctuation et espaces.
 */

export function normaliser(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(s: string): string {
  return s.replace(/ /g, "");
}

/** Distance de Levenshtein (nombre de lettres à changer pour passer d'un mot à l'autre). */
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Deux noms différents mais assez proches pour être confondus ? */
export function nomsProches(a: string, b: string): boolean {
  const brut = (x: string) => String(x ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (brut(a) === brut(b)) return false; // même client
  const na = normaliser(a);
  const nb = normaliser(b);
  if (!na || !nb) return false;
  if (na === nb) return true; // « Sow & Fils » / « Sow et Fils », accents oubliés…
  const ca = compact(na);
  const cb = compact(nb);
  if (ca === cb) return true; // seule la ponctuation / les espaces changent
  const court = Math.min(ca.length, cb.length);
  if (court < 3) return false;
  const seuil = court >= 12 ? 3 : court >= 6 ? 2 : 1;
  if (distance(ca, cb) <= seuil) return true;
  // mêmes mots dans un autre ordre
  const ta = na.split(" ").sort().join("");
  const tb = nb.split(" ").sort().join("");
  if (ta === tb) return true;
  // l'un est contenu dans l'autre (« Sow » / « Sow Matériaux »)
  if (court >= 5 && (ca.includes(cb) || cb.includes(ca))) return true;
  return false;
}

/** Recherche tolérante : accents/majuscules ignorés, mots dans n'importe quel ordre, 1 faute admise. */
export function correspond(nom: unknown, terme: string): boolean {
  const t = normaliser(terme);
  if (!t) return true;
  const n = normaliser(nom);
  if (n.includes(t) || compact(n).includes(compact(t))) return true;
  const mots = n.split(" ");
  return t.split(" ").every((m) =>
    n.includes(m) || (m.length >= 4 && mots.some((x) => distance(x, m) <= 1)),
  );
}

/** Autres clients en attente dont le nom ressemble à celui de `exp` (hors même client). */
export function clientsProches(exp: Expedition, autres: Expedition[]): string[] {
  const vus = new Set<string>();
  for (const o of autres) {
    if (o.id === exp.id) continue;
    const nom = String(o.nomClient || "").trim();
    if (!nom || vus.has(nom)) continue;
    if (nomsProches(exp.nomClient, nom)) vus.add(nom);
  }
  return Array.from(vus);
}
