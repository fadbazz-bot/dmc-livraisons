/**
 * Cache simple persisté dans localStorage, indexé par clé arbitraire.
 *
 * Pourquoi : Apps Script étant lent (~500 ms - 2 s par requête), on veut
 * afficher *quelque chose* immédiatement au démarrage de la page,
 * puis rafraîchir en arrière-plan. Cela rend l'app perçue "instantanée"
 * dès la deuxième visite, et améliore drastiquement l'UX terrain.
 *
 * Stratégie : à chaque succès de query React, on persiste le résultat ici.
 * Au mount, on l'hydrate via le paramètre `initialData` de useQuery.
 */

const PREFIX = "dmc.cache.v1.";

interface Envelope<T> {
  v: T;
  ts: number;
}

export function cacheGet<T>(key: string, maxAgeMs = 24 * 3600 * 1000): T | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const env = JSON.parse(raw) as Envelope<T>;
    if (Date.now() - env.ts > maxAgeMs) return undefined;
    return env.v;
  } catch {
    return undefined;
  }
}

export function cacheSet<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    const env: Envelope<T> = { v: value, ts: Date.now() };
    localStorage.setItem(PREFIX + key, JSON.stringify(env));
  } catch {
    // Quota plein ou JSON cyclique — on ignore, c'est juste un cache
  }
}

export function cacheClear(key?: string): void {
  if (typeof window === "undefined") return;
  if (key) {
    localStorage.removeItem(PREFIX + key);
    return;
  }
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}

/**
 * Helper pour useQuery : retourne initialData + onSuccess qui persiste.
 *
 * Usage :
 *   const { data } = useQuery({
 *     queryKey: ["expeditions"],
 *     queryFn: () => api.expeditions.list(),
 *     ...persistedCache("expeditions"),
 *   });
 */
export function persistedCache<T>(key: string, maxAgeMs = 24 * 3600 * 1000) {
  const initialData = cacheGet<T>(key, maxAgeMs);
  return {
    initialData,
    // Important : si on a initialData récente, on évite un refetch immédiat
    initialDataUpdatedAt: initialData !== undefined ? cacheTs(key) : undefined,
  };
}

function cacheTs(key: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return 0;
    return (JSON.parse(raw) as Envelope<unknown>).ts;
  } catch {
    return 0;
  }
}
