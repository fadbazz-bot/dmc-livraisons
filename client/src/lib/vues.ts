import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Sous-vues d'un écran (ex. Entrées / Sorties du poste de garde).
 * Sur ordinateur, elles s'affichent comme sous-menu dans la barre de gauche ;
 * sur mobile, l'écran garde ses onglets habituels. L'écran publie ses vues
 * (avec compteurs) ici, la barre de gauche les lit.
 */
export interface Vue {
  key: string;
  label: string;
  /** Compteur affiché à droite */
  n?: number;
  /** Compteur en alerte (rouge/orange) */
  alerte?: boolean;
}

interface Etat {
  vues: Record<string, Vue[]>;
  courante: Record<string, string>;
}

let etat: Etat = { vues: {}, courante: {} };
const ecouteurs = new Set<() => void>();
const subscribe = (l: () => void) => {
  ecouteurs.add(l);
  return () => ecouteurs.delete(l);
};
const lire = () => etat;
function maj(next: Etat) {
  etat = next;
  ecouteurs.forEach((l) => l());
}

export function useEtatVues(): Etat {
  return useSyncExternalStore(subscribe, lire);
}

export function choisirVue(page: string, key: string) {
  if (etat.courante[page] === key) return;
  maj({ ...etat, courante: { ...etat.courante, [page]: key } });
}

/** Déclare les vues d'un écran et renvoie la vue courante + son setter. */
export function useVues<K extends string>(page: string, vues: (Vue & { key: K })[], defaut: K): [K, (k: K) => void] {
  const e = useEtatVues();
  const sig = JSON.stringify(vues);
  useEffect(() => {
    const prev = etat.vues[page];
    if (JSON.stringify(prev) === sig) return;
    maj({ ...etat, vues: { ...etat.vues, [page]: JSON.parse(sig) as Vue[] } });
  }, [page, sig]);
  useEffect(
    () => () => {
      const { [page]: _, ...reste } = etat.vues;
      maj({ ...etat, vues: reste });
    },
    [page],
  );
  const demandee = e.courante[page];
  const courante = (vues.some((v) => v.key === demandee) ? demandee : defaut) as K;
  const set = useCallback((k: K) => choisirVue(page, k), [page]);
  return [courante, set];
}
