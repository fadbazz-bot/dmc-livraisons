import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GanttChartSquare } from "lucide-react";
import { api } from "@/api/appsScript";
import { useAuth } from "@/lib/auth";
import { Modal } from "@/components/Modal";
import { FriseLivraison } from "@/components/FriseLivraison";
import { cn } from "@/lib/cn";

/** Frise d'une livraison dans une fenêtre : visible par tous les comptes. */
export function FriseModal({ expId, titre, onClose }: { expId: string; titre?: string; onClose: () => void }) {
  const { user } = useAuth();
  const email = user?.email ?? "";
  const q = useQuery({
    queryKey: ["frise", expId, email],
    queryFn: () => api.nonConformites.frise(email, expId),
    enabled: !!email,
    refetchInterval: 60_000,
    retry: false,
  });
  const f = q.data;
  return (
    <Modal
      open
      onClose={onClose}
      title={titre || (f ? `Livraison ${f.numCmd || f.numExpedition}` : "Frise de la livraison")}
      description={f ? [f.client, f.zone, f.site].filter(Boolean).join(" · ") : undefined}
      size="lg"
    >
      {q.isLoading ? (
        <div className="p-6 text-center text-sm text-slate-500">Chargement…</div>
      ) : q.error || !f ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {q.error instanceof Error ? q.error.message : "Frise indisponible"}
        </div>
      ) : (
        <FriseLivraison f={f} />
      )}
    </Modal>
  );
}

/** Petit bouton à poser à côté des étapes d'une livraison : ouvre la frise (durée de chaque étape). */
export function BoutonFrise({ expId, className }: { expId: string; className?: string }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOuvert(true); }}
        title="Voir la frise : durée de chaque étape"
        aria-label="Voir la frise : durée de chaque étape"
        className={cn("shrink-0 inline-flex items-center gap-1 rounded-md border border-line bg-white px-1.5 py-1 text-[11px] font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900", className)}
      >
        <GanttChartSquare className="h-3.5 w-3.5" />
        Frise
      </button>
      {ouvert && <FriseModal expId={expId} onClose={() => setOuvert(false)} />}
    </>
  );
}
