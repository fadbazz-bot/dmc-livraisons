import {
  LayoutList,
  PackagePlus,
  ShieldCheck,
  DoorOpen,
  Wrench,
  ClipboardCheck,
  BarChart3,
  Truck,
  Users,
  Settings,
  Database,
} from "lucide-react";
import type { ComponentType } from "react";
import type { Role } from "@/types/domain";

export interface NavItem {
  to: string;
  label: string;
  /** Libellé court pour la barre mobile */
  short: string;
  icon: ComponentType<{ className?: string }>;
  group: "commandes" | "terrain" | "pilotage" | "admin";
  roles?: Role[];
  /** Visible seulement si user.superviseurFlotte (ou admin) */
  flagSuperviseur?: boolean;
  /** Préfixe d'URL pour considérer l'entrée active (sous-pages) */
  prefix?: string;
}

export const NAV: NavItem[] = [
  { to: "/file",              label: "File des expéditions", short: "File",       icon: LayoutList,     group: "commandes", roles: ["admin", "commercial", "responsable", "controleur"] },
  { to: "/nouvelle-demande",  label: "Nouvelle demande",     short: "Nouveau",    icon: PackagePlus,    group: "commandes", roles: ["commercial", "admin"] },
  { to: "/poste-garde",       label: "Poste de garde",       short: "Garde",      icon: ShieldCheck,    group: "terrain",   roles: ["chef_poste", "admin"] },
  { to: "/agent-showroom",    label: "Agent showroom",       short: "Showroom",   icon: DoorOpen,       group: "terrain",   roles: ["agent_showroom", "admin"] },
  { to: "/responsable",       label: "Préparation",          short: "Prépa",      icon: Wrench,         group: "terrain",   roles: ["responsable", "admin"] },
  { to: "/non-conformites",   label: "Non-conformités",      short: "Qualité",    icon: ClipboardCheck, group: "terrain",   roles: ["responsable", "controleur", "admin"] },
  { to: "/dashboard",         label: "Tableau de bord",      short: "KPI",        icon: BarChart3,      group: "pilotage",  roles: ["admin", "commercial", "responsable", "controleur"] },
  { to: "/flotte/aujourdhui", label: "Flotte interne",       short: "Flotte",     icon: Truck,          group: "pilotage",  flagSuperviseur: true, prefix: "/flotte" },
  { to: "/utilisateurs",      label: "Utilisateurs",         short: "Équipe",     icon: Users,          group: "admin",     roles: ["admin"] },
  { to: "/donnees",           label: "Données",              short: "Données",    icon: Database,       group: "admin",     roles: ["admin"] },
  { to: "/configuration",     label: "Configuration",        short: "Réglages",   icon: Settings,       group: "admin",     roles: ["admin"] },
];

export const GROUP_LABELS: Record<NavItem["group"], string> = {
  commandes: "Commandes",
  terrain: "Sur le terrain",
  pilotage: "Pilotage",
  admin: "Administration",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  commercial: "Commercial",
  responsable: "Responsable magasin",
  chef_poste: "Poste de garde",
  agent_showroom: "Agent showroom",
  controleur: "Contrôleur",
  chef_flotte: "Responsable chauffeurs",
};

/** Entrées de navigation visibles pour un utilisateur (même règles bureau et mobile). */
export function navPourUtilisateur(user: { role: string; superviseurFlotte?: boolean }): NavItem[] {
  const role = user.role as Role;
  return NAV.filter((n) => {
    if (role === "chef_flotte") return n.to === "/flotte/aujourdhui";
    if (role === "agent_showroom") return n.to === "/agent-showroom";
    if (n.roles && !n.roles.includes(role)) return false;
    if (n.flagSuperviseur && role !== "admin" && !user.superviseurFlotte) return false;
    return true;
  });
}

export function estActif(item: NavItem, location: string): boolean {
  if (location === item.to) return true;
  if (item.to === "/file" && location === "/") return true;
  if (item.prefix && location.startsWith(item.prefix)) return true;
  return false;
}

/** Initiales pour l'avatar. */
export function initiales(nom: string): string {
  const parts = nom.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Écran d'accueil de chaque rôle (jamais la vue commerciale pour le terrain). */
export function routeAccueil(role: string): string {
  switch (role) {
    case "chef_flotte":    return "/flotte/aujourdhui";
    case "agent_showroom": return "/agent-showroom";
    case "chef_poste":     return "/poste-garde";
    case "responsable":    return "/responsable";
    case "controleur":     return "/non-conformites";
    default:               return "/file";
  }
}

/**
 * Le rôle a-t-il le droit d'ouvrir cette adresse ? Les menus cachent déjà les pages
 * interdites, mais taper l'adresse à la main (ou un vieux favori) les ouvrait quand même.
 */
export function routeAutorisee(user: { role: string; superviseurFlotte?: boolean }, path: string): boolean {
  const role = user.role as Role;
  if (path === "/" || role === "admin") return true;
  if (role === "chef_flotte") return path.startsWith("/flotte") || path === "/referentiels-flotte";
  if (role === "agent_showroom") return path === "/agent-showroom";
  if (role === "chef_poste") return path === "/poste-garde";
  const item = NAV.find((n) => path === n.to || (n.prefix && path.startsWith(n.prefix)));
  if (!item) return true; // adresse inconnue : page « introuvable »
  if (item.roles && !item.roles.includes(role)) return false;
  if (item.flagSuperviseur && !user.superviseurFlotte) return false;
  return true;
}
