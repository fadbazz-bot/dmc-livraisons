import {
  LayoutList,
  PackagePlus,
  ShieldCheck,
  DoorOpen,
  Wrench,
  FileWarning,
  ClipboardCheck,
  BarChart3,
  Truck,
  Users,
  Settings,
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
  { to: "/file",              label: "File des expéditions", short: "File",       icon: LayoutList,     group: "commandes" },
  { to: "/nouvelle-demande",  label: "Nouvelle demande",     short: "Nouveau",    icon: PackagePlus,    group: "commandes", roles: ["commercial", "admin"] },
  { to: "/poste-garde",       label: "Poste de garde",       short: "Garde",      icon: ShieldCheck,    group: "terrain",   roles: ["chef_poste", "admin"] },
  { to: "/agent-showroom",    label: "Agent showroom",       short: "Showroom",   icon: DoorOpen,       group: "terrain",   roles: ["agent_showroom", "admin"] },
  { to: "/responsable",       label: "Préparation",          short: "Prépa",      icon: Wrench,         group: "terrain",   roles: ["responsable", "admin"] },
  { to: "/justificatifs",     label: "Justificatifs",        short: "Retards",    icon: FileWarning,    group: "terrain",   roles: ["responsable", "admin"] },
  { to: "/controleur",        label: "Contrôle",             short: "Contrôle",   icon: ClipboardCheck, group: "terrain",   roles: ["controleur", "admin"] },
  { to: "/dashboard",         label: "Tableau de bord",      short: "KPI",        icon: BarChart3,      group: "pilotage" },
  { to: "/flotte/aujourdhui", label: "Flotte interne",       short: "Flotte",     icon: Truck,          group: "pilotage",  flagSuperviseur: true, prefix: "/flotte" },
  { to: "/utilisateurs",      label: "Utilisateurs",         short: "Équipe",     icon: Users,          group: "admin",     roles: ["admin"] },
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
