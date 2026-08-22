import { Link, useLocation } from "wouter";
import {
  LayoutGrid,
  PackagePlus,
  ShieldCheck,
  DoorOpen,
  Wrench,
  AlertTriangle,
  BarChart3,
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

const MOBILE_NAV: NavItem[] = [
  { to: "/file",             label: "File",     icon: LayoutGrid },
  { to: "/nouvelle-demande", label: "Nouveau",  icon: PackagePlus,  roles: ["commercial", "admin"] },
  { to: "/poste-garde",      label: "Garde",    icon: ShieldCheck,  roles: ["chef_poste", "admin"] },
  { to: "/agent-showroom",   label: "Showroom", icon: DoorOpen,     roles: ["agent_showroom", "admin"] },
  { to: "/responsable",      label: "Prépa",    icon: Wrench,       roles: ["responsable", "admin"] },
  { to: "/justificatifs",    label: "Retards",  icon: AlertTriangle },
  { to: "/dashboard",        label: "KPI",      icon: BarChart3 },
];

export function MobileNav() {
  const { user } = useAuth();
  const [location] = useLocation();
  if (!user) return null;
  const role = user.role as Role;

  const items = MOBILE_NAV.filter((n) => !n.roles || n.roles.includes(role)).slice(0, 5);

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 shadow-[0_-1px_3px_rgba(0,0,0,0.04)]">
      <div className="grid grid-cols-5 h-14">
        {items.map((item) => {
          const active = location === item.to || (item.to === "/file" && location === "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              href={item.to}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                active ? "text-brand-900" : "text-slate-500",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "text-brand-900")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
