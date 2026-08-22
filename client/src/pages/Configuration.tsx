import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { api } from "@/api/appsScript";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { EditMotifModal } from "@/components/modals/EditMotifModal";
import type { MotifRetard } from "@/types/domain";
import { cn } from "@/lib/cn";

const CATEGORIES_MAGASIN = [
  "organisation",
  "stock",
  "transport",
  "client",
  "systeme",
  "autre",
];

/**
 * Page Configuration — admin gère les motifs de retard magasin.
 * Note : les motifs flotte ont leur propre interface dans Référentiels Flotte.
 */
export default function ConfigurationPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<MotifRetard | null>(null);
  const [adding, setAdding] = useState(false);

  if (user && user.role !== "admin") {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Accès réservé aux admins</h2>
        </div>
      </div>
    );
  }

  const { data: motifs = [], isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ["motifs-retard"],
    queryFn: () => api.referentiels.motifs(),
  });

  const supprimer = useMutation({
    mutationFn: (id: string) => api.referentiels.supprimerMotif(id),
    onSuccess: () => {
      toast.success("Motif supprimé");
      qc.invalidateQueries({ queryKey: ["motifs-retard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand-900 text-white flex items-center justify-center">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Configuration</h1>
              <p className="text-xs text-slate-500">
                Motifs de retard magasin · {motifs.length} actif{motifs.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} disabled={isFetching} className="btn-outline gap-1.5">
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              <span className="hidden sm:inline">Rafraîchir</span>
            </button>
            <button onClick={() => setAdding(true)} className="btn-primary gap-1.5">
              <Plus className="h-4 w-4" />
              Nouveau motif
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900 mb-4">
          Les motifs définis ici sont proposés au <strong>responsable magasin</strong> lors de la
          justification d'un retard. Pour les motifs de la <strong>flotte interne</strong>, va
          dans Flotte interne → Référentiels.
        </div>

        {isLoading ? (
          <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>
        ) : error ? (
          <div className="card p-6 border-red-200 bg-red-50 text-sm text-red-700">
            {error instanceof Error ? error.message : "Erreur"}
          </div>
        ) : motifs.length === 0 ? (
          <div className="card p-10 text-center text-sm text-slate-500">
            Aucun motif. Ajoute le premier avec le bouton « Nouveau motif ».
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left">Libellé</th>
                  <th className="px-4 py-3 text-left">Catégorie</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {motifs.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-900">{m.libelle}</td>
                    <td className="px-4 py-3">
                      <span className="badge-neutral">{m.categorie}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(m)}
                        className="btn-ghost py-1 px-2 text-xs"
                        title="Modifier"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Supprimer le motif « ${m.libelle} » ?`)) {
                            supprimer.mutate(m.id);
                          }
                        }}
                        className="btn-ghost py-1 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(adding || editing) && (
        <EditMotifModal
          open
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          id={editing?.id}
          initialLibelle={editing?.libelle}
          initialCategorie={editing?.categorie}
          domain="magasin"
          addFn={api.referentiels.ajouterMotif}
          updateFn={api.referentiels.modifierMotif}
          categories={CATEGORIES_MAGASIN}
          queryKey="motifs-retard"
        />
      )}
    </div>
  );
}
