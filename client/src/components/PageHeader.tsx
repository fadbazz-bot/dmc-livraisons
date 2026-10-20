import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
  title: string;
  subtitle?: ReactNode;
  /** Boutons d'action à droite du titre */
  actions?: ReactNode;
  /** Barre d'outils sous le titre (recherche, filtres…) */
  children?: ReactNode;
  className?: string;
}

/** En-tête de page commun : titre, résumé, actions et barre d'outils. */
export function PageHeader({ title, subtitle, actions, children, className }: Props) {
  return (
    <header className={cn("border-b border-line bg-white px-4 pt-4 pb-3 sm:px-6 sm:pt-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-3 space-y-3">{children}</div>}
    </header>
  );
}
