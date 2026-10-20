import { Link, useLocation } from "wouter";
import { LogOut, Truck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { GROUP_LABELS, ROLE_LABELS, estActif, initiales, navPourUtilisateur, type NavItem } from "@/lib/nav";

export function Sidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  if (!user) return null;

  const items = navPourUtilisateur(user);
  const groups = (Object.keys(GROUP_LABELS) as NavItem["group"][])
    .map((g) => ({ key: g, items: items.filter((i) => i.group === g) }))
    .filter((g) => g.items.length > 0);
  // Les intitulés de groupe n'aident que s'il y a plusieurs groupes à distinguer
  const showGroupLabels = groups.length > 1 && items.length > 4;

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-line bg-white">
      {/* Marque */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-line">
        <div className="h-9 w-9 rounded-ctl bg-brand-800 flex items-center justify-center">
          <Truck className="h-[18px] w-[18px] text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold text-slate-900">DMC Livraisons</div>
          <div className="text-xs text-slate-500">DMC Sénégal</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Navigation principale">
        {groups.map((g) => (
          <div key={g.key} className="space-y-0.5">
            {showGroupLabels && (
              <div className="px-3 pb-1 text-xs font-medium text-slate-400">{GROUP_LABELS[g.key]}</div>
            )}
            {g.items.map((item) => {
              const active = estActif(item, location);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-ctl px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-50 text-brand-800"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent" aria-hidden />
                  )}
                  <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-brand-700" : "text-slate-400 group-hover:text-slate-600")} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Profil */}
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-ctl px-2 py-2">
          <div className="h-9 w-9 shrink-0 rounded-full bg-brand-100 text-brand-800 text-xs font-semibold flex items-center justify-center">
            {initiales(user.nom || user.email)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium text-slate-900">{user.nom || user.email}</div>
            <div className="truncate text-xs text-slate-500">
              {ROLE_LABELS[user.role] ?? user.role}
              {user.site ? `, ${user.site}` : ""}
            </div>
          </div>
          <button
            onClick={logout}
            className="btn-ghost p-2"
            title="Se déconnecter"
            aria-label="Se déconnecter"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
