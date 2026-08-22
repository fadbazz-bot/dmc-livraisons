import { Link, useLocation } from "wouter";
import {
  LayoutGrid,
  PackagePlus,
  ShieldCheck,
  DoorOpen,
  Wrench,
  AlertTriangle,
  BarChart3,
  Users,
  Settings,
  LogOut,
  Truck,
  TruckIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import type { Role } from "@/types/domain";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
}

interface NavItem2 extends NavItem {
  /** Si présent, l'item n'apparaît que si user.superviseurFlotte === true */
  flagSuperviseur?: boolean;
}

const NAV: NavItem2[] = [
  { to: "/file",                label: "File commandes",   icon: LayoutGrid },
  { to: "/nouvelle-demande",    label: "Nouvelle demande", icon: PackagePlus, roles: ["commercial", "admin"] },
  { to: "/poste-garde",         label: "Poste de garde",   icon: ShieldCheck, roles: ["chef_poste", "admin"] },
  { to: "/agent-showroom",      label: "Agent showroom",   icon: DoorOpen,    roles: ["agent_showroom", "admin"] },
  { to: "/responsable",         label: "Préparation",      icon: Wrench,      roles: ["responsable", "admin"] },
  { to: "/justificatifs",       label: "Justificatifs",    icon: AlertTriangle, roles: ["responsable", "admin"] },
  { to: "/controleur",          label: "Contrôleur",       icon: ShieldCheck, roles: ["controleur", "admin"] },
  { to: "/dashboard",           label: "Dashboard KPI",    icon: BarChart3 },
  { to: "/flotte/planifiees",   label: "Flotte interne",   icon: TruckIcon,   flagSuperviseur: true },
  { to: "/utilisateurs",        label: "Utilisateurs",     icon: Users,       roles: ["admin"] },
  { to: "/configuration",       label: "Configuration",    icon: Settings,    roles: ["admin"] },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  if (!user) return null;
  const role = user.role as Role;

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-brand-900 text-brand-100">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-brand-800/60 flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center shadow-sm">
          <Truck className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-white text-sm font-semibold">DMC Livraisons</div>
          <div className="text-[11px] text-brand-300">DMC Sénégal</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV.filter((n) => {
          // Chef flotte voit UNIQUEMENT "Flotte interne" (et rien d'autre)
          if (role === "chef_flotte") {
            return n.to === "/flotte/planifiees";
          }
          // Agent showroom voit UNIQUEMENT son écran dédié (et rien d'autre)
          if (role === "agent_showroom") {
            return n.to === "/agent-showroom";
          }
          // Filtre rôle classique
          if (n.roles && !n.roles.includes(role)) return false;
          // Filtre flag superviseur flotte (admin y a toujours droit)
          if (n.flagSuperviseur && role !== "admin" && !user.superviseurFlotte) return false;
          return true;
        }).map((item) => {
          const active =
            location === item.to ||
            (item.to === "/file" && location === "/") ||
            // Sidebar reste active sur toutes les sous-pages /flotte/*
            (item.to === "/flotte/planifiees" && location.startsWith("/flotte"));
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              href={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-700 text-white"
                  : "text-brand-200 hover:bg-brand-800 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer / profil */}
      <div className="border-t border-brand-800/60 p-3">
        <div className="px-2 py-2 text-xs text-brand-200">
          <div className="text-white font-medium truncate">{user.nom || user.email}</div>
          <div className="capitalize text-brand-300">{user.role}{user.site ? ` · ${user.site}` : ""}</div>
        </div>
        <button
          onClick={logout}
          className="mt-1 w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-200 hover:bg-brand-800 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
