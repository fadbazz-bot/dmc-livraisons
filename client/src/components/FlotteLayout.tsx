import { type ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  Truck,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Database,
  RefreshCw,
  FileUp,
} from "lucide-react";
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
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-brand-900 text-white flex items-center justify-center shrink-0">
              <Truck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900">Flotte interne</h1>
              <p className="text-xs text-slate-500 truncate">{subtitle ?? "Suivi des livraisons internes DMC"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {rightSlot}
            <button
              type="button"
              onClick={handleSync}
              className="btn-outline gap-1.5"
              title="Recharge les données depuis Google Sheets"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Synchroniser</span>
            </button>
          </div>
        </div>

        {/* Section nav */}
        <nav className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1 -mb-1">
          {SECTIONS.map((s) => {
            const active = location === s.to || (s.to === "/flotte/planifiees" && location === "/flotte");
            const Icon = s.icon;
            return (
              <Link
                key={s.to}
                href={s.to}
                className={cn(
                  "shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
    </div>
  );
}
