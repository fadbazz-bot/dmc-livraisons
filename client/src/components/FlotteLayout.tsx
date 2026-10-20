import { type ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarCheck,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Database,
  RefreshCw,
  FileUp,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

interface FlotteSection {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

const SECTIONS: FlotteSection[] = [
  { to: "/flotte/aujourdhui",        label: "Aujourd'hui",   icon: CalendarCheck,  description: "Livraisons du jour" },
  { to: "/flotte/planifiees",        label: "Planifiées",     icon: CalendarClock,  description: "Livraisons à venir" },
  { to: "/flotte/effectuees",        label: "Effectuées",     icon: CheckCircle2,   description: "Livraisons terminées" },
  { to: "/flotte/non-conformites",   label: "Non-conformités",icon: AlertTriangle,  description: "Retards & LOI 10h" },
  { to: "/flotte/kpi",               label: "KPI",            icon: BarChart3,      description: "Tableau de bord" },
  { to: "/flotte/import-nav",        label: "Import NAV",     icon: FileUp,         description: "Confirmation livraisons" },
  { to: "/flotte/referentiels",      label: "Référentiels",   icon: Database,       description: "Chauffeurs, clients, motifs" },
];

interface Props {
  children: ReactNode;
  /** Sous-titre affiché à côté du titre principal */
  subtitle?: string;
  /** Slot pour ajouter des actions à droite (filtres de date par ex.) */
  rightSlot?: ReactNode;
}

/**
 * Layout commun pour toutes les pages /flotte/*.
 * Affiche un en-tête avec bouton "Synchroniser" qui invalide les queries flotte,
 * puis une barre horizontale des 5 sections, puis le contenu de la page.
 *
 * Le bouton "Synchroniser" force un refetch de toutes les données flotte
 * depuis Google Sheets (via Apps Script). Utile si l'utilisateur a modifié
 * les feuilles à la main et veut voir les changements dans la webapp.
 */
export function FlotteLayout({ children, subtitle, rightSlot }: Props) {
  const { user } = useAuth();
  const [location] = useLocation();
  const qc = useQueryClient();
  const toast = useToast();

  const canAccess =
    user &&
    (user.role === "admin" ||
      user.role === "chef_flotte" ||
      user.superviseurFlotte ||
      user.role === "commercial");
  if (!canAccess) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Accès réservé</h2>
          <p className="text-sm text-slate-500">
            Cette section est accessible aux admins, aux chefs flotte et aux commerciaux superviseurs flotte.
          </p>
        </div>
      </div>
    );
  }

  function handleSync() {
    qc.invalidateQueries({ queryKey: ["flotte-livraisons"] });
    qc.invalidateQueries({ queryKey: ["flotte-chauffeurs"] });
    qc.invalidateQueries({ queryKey: ["flotte-clients"] });
    qc.invalidateQueries({ queryKey: ["flotte-motifs"] });
    qc.invalidateQueries({ queryKey: ["flotte-kpi"] });
    toast.success("Synchronisation en cours…");
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Flotte interne"
        subtitle={subtitle ?? "Suivi des livraisons internes DMC"}
        actions={
          <>
            {rightSlot}
            <button
              type="button"
              onClick={handleSync}
              className="btn-outline"
              title="Recharge les données depuis Google Sheets"
              aria-label="Synchroniser"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Synchroniser</span>
            </button>
          </>
        }
      >
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Sections flotte">
          {SECTIONS.map((s) => {
            const active = location === s.to || (s.to === "/flotte/aujourdhui" && location === "/flotte");
            const Icon = s.icon;
            return (
              <Link
                key={s.to}
                href={s.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-ctl px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </Link>
            );
          })}
        </nav>
      </PageHeader>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
    </div>
  );
}
