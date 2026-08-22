import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Concatène et déduplique les classes Tailwind.
 * Usage : cn("p-4", isActive && "bg-brand-600", className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Convertit n'importe quelle valeur en string lowercase de manière sûre.
 * Pourquoi : Google Sheets retourne parfois des nombres au lieu de strings
 * (ex: numéro BL "12345" devient le nombre 12345). Un appel direct à
 * .toLowerCase() sur un nombre crashe → page blanche.
 */
export function lower(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).toLowerCase();
}

/**
 * Recherche "contient" insensible à la casse, sûre pour tout type.
 * Utilisée pour les barres de recherche qui filtrent des données venant de Sheets.
 */
export function includesLower(haystack: unknown, needle: string): boolean {
  if (!needle) return true;
  return lower(haystack).includes(needle.toLowerCase());
}
