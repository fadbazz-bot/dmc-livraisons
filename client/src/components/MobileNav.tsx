import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Ellipsis, LogOut, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { ROLE_LABELS, estActif, initiales, navPourUtilisateur } from "@/lib/nav";

/** Barre du haut mobile : marque + menu du compte (déconnexion accessible pour tous les rôles). */
export function MobileTopBar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  return (
    <header className="md:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-ctl bg-brand-800 flex items-center justify-center text-white text-xs font-semibold">
          DMC
        </div>
        <span className="text-[15px] font-semibold text-slate-900">Livraisons</span>
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full pl-1 pr-1 py-1"
        aria-label="Menu du compte"
        aria-expanded={open}
      >
        <span className="h-8 w-8 rounded-full bg-brand-100 text-brand-800 text-xs font-semibold flex items-center justify-center">
          {initiales(user.nom || user.email)}
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-3 top-12 z-50 w-64 rounded-card border border-line bg-white p-2 shadow-pop animate-pop">
            <div className="px-3 py-2">
              <div className="truncate text-sm font-medium text-slate-900">{user.nom || user.email}</div>
              <div className="truncate text-xs text-slate-500">
                {ROLE_LABELS[user.role] ?? user.role}
                {user.site ? `, ${user.site}` : ""}
              </div>
            </div>
            <button
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-ctl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4 text-slate-400" />
              Se déconnecter
            </button>
          </div>
        </>
      )}
    </header>
  );
}

/** Barre d'onglets du bas : tout le menu si ≤ 5 entrées, sinon 4 entrées + « Plus ». */
export function MobileNav() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  if (!user) return null;

  const items = navPourUtilisateur(user);
  if (items.length <= 1) return null; // un seul écran : pas de barre d'onglets
  const needMore = items.length > 5;
  const visible = needMore ? items.slice(0, 4) : items;
  const hidden = needMore ? items.slice(4) : [];
  const hiddenActive = hidden.some((i) => estActif(i, location));

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]"
        aria-label="Navigation principale"
      >
        <div className="flex h-16">
          {visible.map((item) => {
            const active = estActif(item, location);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                href={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-brand-700" : "text-slate-500",
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-brand-100")}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                {item.short}
              </Link>
            );
          })}
          {needMore && (
            <button
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                hiddenActive ? "text-brand-700" : "text-slate-500",
              )}
            >
              <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", hiddenActive && "bg-brand-100")}>
                <Ellipsis className="h-[18px] w-[18px]" />
              </span>
              Plus
            </button>
          )}
        </div>
      </nav>

      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label="Autres écrans">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMoreOpen(false)} aria-hidden />
          <div className="relative w-full rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-pop animate-pop">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Autres écrans</h2>
              <button className="btn-ghost p-2" onClick={() => setMoreOpen(false)} aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {hidden.map((item) => {
                const Icon = item.icon;
                const active = estActif(item, location);
                return (
                  <Link
                    key={item.to}
                    href={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-card border px-3 py-3 text-sm font-medium",
                      active ? "border-brand-300 bg-brand-50 text-brand-800" : "border-line text-slate-700",
                    )}
                  >
                    <Icon className="h-5 w-5 text-slate-400" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
