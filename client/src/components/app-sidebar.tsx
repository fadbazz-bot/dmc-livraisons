import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, PackagePlus, ListChecks, Wrench,
  ShieldCheck, BarChart3, LogOut, ChevronRight, Settings,
} from "lucide-react";
import { useAuth, ROLE_LABELS, ROLE_COLORS } from "@/lib/auth";
import { cn } from "@/lib/utils";

const navItems = [
  {
    group: "Commandes",
    items: [
      { label: "Nouvelle demande", href: "/nouvelle-demande", icon: PackagePlus, roles: ["commercial", "admin"] },
      { label: "File des commandes", href: "/file-commandes", icon: ListChecks, roles: ["commercial", "responsable", "chef_poste", "admin"] },
    ],
  },
  {
    group: "Validation",
    items: [
      { label: "Prépa & Livraison", href: "/responsable", icon: Wrench, roles: ["responsable", "admin"] },
      { label: "Poste de garde", href: "/poste-garde", icon: ShieldCheck, roles: ["chef_poste", "admin"] },
    ],
  },
  {
    group: "Pilotage",
    items: [
      { label: "Dashboard KPI", href: "/dashboard", icon: BarChart3, roles: ["admin", "chef_poste", "commercial"] },
      { label: "Configuration", href: "/configuration", icon: Settings, roles: ["admin"] },
    ],
  },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const userRole = user?.role || "";

  const visibleItems = navItems.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.roles.includes(userRole)),
  })).filter((g) => g.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      {/* Logo */}
      <SidebarHeader className="px-4 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-8 h-8">
            <svg viewBox="0 0 32 32" fill="none" aria-label="DMC Livraisons">
              <rect width="32" height="32" rx="6" fill="hsl(215,72%,28%)" />
              <path d="M6 10h8a6 6 0 0 1 0 12H6V10z" fill="white" opacity="0.9"/>
              <rect x="17" y="14" width="9" height="8" rx="1.5" fill="white" opacity="0.7"/>
              <circle cx="10" cy="25" r="2.5" fill="hsl(28,90%,52%)"/>
              <circle cx="22" cy="25" r="2.5" fill="hsl(28,90%,52%)"/>
            </svg>
          </div>
          {!collapsed && (
            <div>
              <div className="font-semibold text-sidebar-foreground text-sm leading-tight">DMC Livraisons</div>
              <div className="text-xs text-sidebar-foreground/50">Gestion des expéditions</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="py-3">
        {visibleItems.map((group) => (
          <SidebarGroup key={group.group}>
            <SidebarGroupLabel className="text-xs uppercase tracking-widest text-sidebar-foreground/40 px-4 mb-1">
              {group.group}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = location === item.href || location.startsWith(item.href + "/");
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link href={item.href} className={cn(
                          "flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )}>
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                          {active && !collapsed && <ChevronRight className="h-3 w-3 ml-auto opacity-50" />}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* User footer */}
      <SidebarFooter className="border-t border-sidebar-border p-3">
        {user && (
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary font-semibold text-sm">
              {user.nom.charAt(0)}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-sidebar-foreground truncate">{user.nom}</div>
                <div className={cn("text-xs px-1.5 py-0.5 rounded-full inline-block mt-0.5", ROLE_COLORS[user.role])}>
                  {ROLE_LABELS[user.role]}
                </div>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={logout}
                className="text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors p-1"
                title="Déconnexion"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
