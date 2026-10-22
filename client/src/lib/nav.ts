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
  LifeBuoy,
  CalendarCheck,
  ListTodo,
  Columns3,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  FileUp,
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
  /** Sous-menu (pages distinctes) affiché sous l'entrée dans la barre de gauche */
  children?: NavChild[];
}

export interface NavChild {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Rubrique dans laquelle ranger l'entrée */
  section: string;
}

/** Flotte interne : 8 écrans rangés en 3 rubriques. */
export const FLOTTE_SOUS_MENU: NavChild[] = [
  { to: "/flotte/aujourdhui",      label: "Aujourd'hui",     icon: CalendarCheck, section: "Livraisons" },
  { to: "/flotte/en-attente",      label: "À faire",         icon: ListTodo,      section: "Livraisons" },
  { to: "/flotte/planning",        label: "Planning",        icon: Columns3,      section: "Livraisons" },
  { to: "/flotte/planifiees",      label: "Calendrier",      icon: CalendarDays,  section: "Livraisons" },
  { to: "/flotte/effectuees",      label: "Effectuées",      icon: CheckCircle2,  section: "Suivi" },
  { to: "/flotte/non-conformites", label: "Retards & LOI 10h", icon: AlertTriangle, section: "Suivi" },
  { to: "/flotte/kpi",             label: "KPI",             icon: BarChart3,     section: "Suivi" },
  { to: "/flotte/import-nav",      label: "Import NAV",      icon: FileUp,        section: "Gestion" },
  { to: "/flotte/referentiels",    label: "Référentiels",    icon: Database,      section: "Gestion" },
];

export const NAV: NavItem[] = [
  { to: "/file",              label: "File des expéditions", short: "File",       icon: LayoutList,     group: "commandes", roles: ["admin", "commercial", "responsable", "coordinateur"] },
  { to: "/nouvelle-demande",  label: "Nouvelle demande",     short: "Nouveau",    icon: PackagePlus,    group: "commandes", roles: ["commercial", "admin"] },
  { to: "/poste-garde",       label: "Poste de garde",       short: "Garde",      icon: ShieldCheck,    group: "terrain",   roles: ["chef_poste", "coordinateur", "admin"] },
  { to: "/agent-showroom",    label: "Agent showroom",       short: "Showroom",   icon: DoorOpen,       group: "terrain",   roles: ["agent_showroom", "coordinateur", "admin"] },
  { to: "/responsable",       label: "Préparation",          short: "Prépa",      icon: Wrench,         group: "terrain",   roles: ["responsable", "coordinateur", "admin"] },
  { to: "/coordination",      label: "Coordination",         short: "Coordo",     icon: LifeBuoy,       group: "terrain",   roles: ["coordinateur", "admin"] },
  { to: "/non-conformites",   label: "Non-conformités",      short: "Qualité",    icon: ClipboardCheck, group: "terrain",   roles: ["responsable", "coordinateur", "admin"] },
  { to: "/dashboard",         label: "Tableau de bord",      short: "KPI",        icon: BarChart3,      group: "pilotage",  roles: ["admin", "commercial", "responsable", "coordinateur"] },
  { to: "/flotte/aujourdhui", label: "Flotte interne",       short: "Flotte",     icon: Truck,          group: "pilotage",  flagSuperviseur: true, prefix: "/flotte", children: FLOTTE_SOUS_MENU },
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
  coordinateur: "Coordinateur",
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
    case "coordinateur":   return "/coordination";
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
