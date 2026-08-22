/**
 * Helpers métier flotte interne.
 * La logique de calcul de date prévue est réécrite ici en JS pour donner un
 * preview instantané au commercial. La vérité finale reste calculée par le
 * backend dans createCommande (basé sur l'heure serveur Dakar).
 */

/**
 * Calcule la date prévue de livraison interne selon les règles DMC :
 *   - Lundi-vendredi avant 16h → J+1 ouvrable
 *   - Lundi-vendredi après 16h → J+2 ouvrable
 *   - Samedi avant 12h         → samedi (matinée OK)
 *   - Samedi après 12h         → lundi
 *   - Dimanche                  → mardi
 */
export function calculerDatePrevueLocale(date: Date = new Date()): string {
  const day = date.getDay(); // 0=dim, 1=lun, …, 6=sam
  const hour = date.getHours();

  const addDays = (d: Date, n: number) => {
    const out = new Date(d);
    out.setDate(out.getDate() + n);
    return out;
  };
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Dimanche → mardi
  if (day === 0) return fmt(addDays(date, 2));

  // Samedi
  if (day === 6) {
    if (hour < 12) return fmt(date); // samedi matin → livraison samedi
    return fmt(addDays(date, 2));     // samedi après-midi → lundi
  }

  // Lundi-vendredi
  let target = addDays(date, hour < 16 ? 1 : 2);
  if (target.getDay() === 0) target = addDays(target, 1); // si tombe dimanche → lundi
  return fmt(target);
}

/**
 * Format lisible d'une date ISO : "Mardi 13/05/2026"
 */
export function formatDateLisible(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
