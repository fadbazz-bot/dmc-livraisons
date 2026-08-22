import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Truck,
  Users2,
  AlertTriangle,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Eraser,
} from "lucide-react";
import { api } from "@/api/appsScript";
import type {
  ChauffeurFlotte,
  ClientLivraisonInterne,
  MotifRetardFlotte,
} from "@/types/domain";
import { FlotteLayout } from "@/components/FlotteLayout";
import { EditChauffeurModal } from "@/components/modals/EditChauffeurModal";
import { EditClientInterneModal } from "@/components/modals/EditClientInterneModal";
import { EditMotifModal } from "@/components/modals/EditMotifModal";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { cn, includesLower } from "@/lib/cn";

type Tab = "chauffeurs" | "clients" | "motifs";

const CATEGORIES_FLOTTE = [
  "preparation",
  "planning",
  "logistique",
  "depart",
  "administratif",
  "client",
  "chauffeur",
  "systeme",
  "transport",
  "autre",
];

export default function ReferentielsFlottePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("clients");

  return (
    <FlotteLayout subtitle="Chauffeurs, clients autorisés, motifs de retard">
      <div className="space-y-4">
        {user?.role === "admin" && <DemoBanner />}

        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
          <SubTab active={tab === "clients"}    onClick={() => setTab("clients")}    icon={<Users2 className="h-4 w-4" />}        label="Clients" />
          <SubTab active={tab === "chauffeurs"} onClick={() => setTab("chauffeurs")} icon={<Truck className="h-4 w-4" />}         label="Chauffeurs" />
          <SubTab active={tab === "motifs"}     onClick={() => setTab("motifs")}     icon={<AlertTriangle className="h-4 w-4" />} label="Motifs" />
        </div>

        {tab === "clients" && <ClientsTab />}
        {tab === "chauffeurs" && <ChauffeursTab />}
        {tab === "motifs" && <MotifsTab />}
      </div>
    </FlotteLayout>
  );
}

// ── Bannière démo (admin uniquement) ──────────────────────────────────────────

function DemoBanner() {
  const toast = useToast();
  const qc = useQueryClient();

  const seed = useMutation({
    mutationFn: (force: boolean) => api.flotteLivraisons.seedDemo(force),
    onSuccess: (res) => {
      if (!res.ok) {
        if (res.error && res.error.indexOf("déjà présentes") !== -1) {
          if (confirm(res.error + "\n\nVeux-tu écraser les anciennes données démo et réinjecter ?")) {
            seed.mutate(true);
          }
        } else {
          toast.error(res.error || "Erreur");
        }
        return;
      }
      toast.success(`${res.created} commandes démo injectées ✨`);
      invalidateAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const clearDemo = useMutation({
    mutationFn: () => api.flotteLivraisons.clearDemo(),
    onSuccess: (res) => {
      toast.success(`${res.commandesSupprimees} commandes démo supprimées`);
      invalidateAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["flotte-livraisons"] });
    qc.invalidateQueries({ queryKey: ["flotte-kpi"] });
    qc.invalidateQueries({ queryKey: ["expeditions"] });
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 flex items-start gap-3">
      <Sparkles className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-violet-900">Données de démonstration</div>
        <p className="text-xs text-violet-700 mt-0.5">
          Injecte 12 livraisons réalistes (conformes, retards date, LOI 10h, non-conformités à
          justifier, planifiées, en cours) pour faire une démo complète. Toutes ont un préfixe
          <code className="ml-1 px-1 bg-violet-100 rounded">DEMO-</code> et sont supprimables à tout moment.
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={() => clearDemo.mutate()}
          disabled={clearDemo.isPending || seed.isPending}
          className="btn-outline gap-1.5 text-xs"
          title="Supprime toutes les données démo"
        >
          <Eraser className="h-3.5 w-3.5" />
          Nettoyer
        </button>
        <button
          type="button"
          onClick={() => seed.mutate(false)}
          disabled={seed.isPending || clearDemo.isPending}
          className="btn-primary gap-1.5 text-xs"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {seed.isPending ? "Injection…" : "Charger données démo"}
        </button>
      </div>
    </div>
  );
}

function SubTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "py-2.5 px-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5",
        active ? "bg-white text-brand-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Clients ───────────────────────────────────────────────────────────────────

function ClientsTab() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ClientLivraisonInterne | null>(null);
  const [adding, setAdding] = useState(false);

  const isAdmin = user?.role === "admin";

  const { data: clients = [], isLoading, error } = useQuery({
    queryKey: ["flotte-clients"],
    queryFn: () => api.flotteClients.list(),
  });

  const supprimer = useMutation({
    mutationFn: (id: string) => api.flotteClients.delete(id),
    onSuccess: () => {
      toast.success("Client supprimé");
      qc.invalidateQueries({ queryKey: ["flotte-clients"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    return clients.filter(
      (c) =>
        includesLower(c.nomClient, search) ||
        includesLower(c.codeClient, search) ||
        includesLower(c.codeCommercial, search) ||
        includesLower(c.lieuLivraison, search) ||
        includesLower(c.contact, search),
    );
  }, [clients, search]);

  const stats = useMemo(
    () => ({
      total: clients.length,
      autorises: clients.filter((c) => c.autorise).length,
      exception: clients.filter((c) => c.autoriseException).length,
      avecContact: clients.filter((c) => c.email || c.telephone).length,
    }),
    [clients],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Autorisés" value={stats.autorises} accent="ok" />
        <StatCard label="Exception" value={stats.exception} accent="warn" />
        <StatCard label="Avec contact" value={stats.avecContact} accent="info" />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, code, commercial, lieu, contact…"
            className="input pl-9"
          />
        </div>
        {isAdmin && (
          <button onClick={() => setAdding(true)} className="btn-primary gap-1.5 shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nouveau client</span>
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>
      ) : error ? (
        <div className="card p-6 border-red-200 bg-red-50 flex gap-2 items-start">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error instanceof Error ? error.message : "Erreur"}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-slate-500 text-sm">
          {search ? "Aucun client trouvé." : "Aucun client enregistré."}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-left">Code</th>
                  <th className="px-3 py-2.5 text-left">Nom client</th>
                  <th className="px-3 py-2.5 text-left">Comm.</th>
                  <th className="px-3 py-2.5 text-center">Aut.</th>
                  <th className="px-3 py-2.5 text-center">Excep.</th>
                  <th className="px-3 py-2.5 text-left">Lieu</th>
                  <th className="px-3 py-2.5 text-left">Contact</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{c.codeClient || "—"}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{c.nomClient}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{c.codeCommercial || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      {c.autorise ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" />
                      ) : (
                        <XCircle className="h-4 w-4 text-slate-300 inline" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {c.autoriseException ? (
                        <CheckCircle2 className="h-4 w-4 text-amber-600 inline" />
                      ) : (
                        <XCircle className="h-4 w-4 text-slate-300 inline" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600 text-xs">{c.lieuLivraison || "—"}</td>
                    <td className="px-3 py-2 text-slate-700 text-xs">{c.contact || "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {isAdmin && (
                        <>
                          <button onClick={() => setEditing(c)} className="btn-ghost py-1 px-2 text-xs" title="Modifier">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Supprimer ${c.nomClient} ?`)) supprimer.mutate(c.id);
                            }}
                            className="btn-ghost py-1 px-2 text-xs text-red-500 hover:bg-red-50"
                            title="Supprimer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(adding || editing) && (
        <EditClientInterneModal
          existing={editing ?? undefined}
          open
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ── Chauffeurs ────────────────────────────────────────────────────────────────

function ChauffeursTab() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ChauffeurFlotte | null>(null);
  const [adding, setAdding] = useState(false);

  const isAdmin = user?.role === "admin";

  const { data: chauffeurs = [], isLoading, error } = useQuery({
    queryKey: ["flotte-chauffeurs"],
    queryFn: () => api.flotteChauffeurs.list(),
  });

  const supprimer = useMutation({
    mutationFn: (id: string) => api.flotteChauffeurs.delete(id),
    onSuccess: () => {
      toast.success("Chauffeur supprimé");
      qc.invalidateQueries({ queryKey: ["flotte-chauffeurs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  if (isLoading) return <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>;
  if (error)
    return (
      <div className="card p-6 border-red-200 bg-red-50 text-sm text-red-700">
        {error instanceof Error ? error.message : "Erreur"}
      </div>
    );

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex justify-end">
          <button onClick={() => setAdding(true)} className="btn-primary gap-1.5">
            <Plus className="h-4 w-4" />
            Nouveau chauffeur
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left">Nom</th>
              <th className="px-4 py-3 text-left">Plaque</th>
              <th className="px-4 py-3 text-left">Site</th>
              <th className="px-4 py-3 text-left">Téléphone</th>
              <th className="px-4 py-3 text-center">Actif</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {chauffeurs.map((c: ChauffeurFlotte) => (
              <tr key={c.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3 font-medium text-slate-900">{c.nom}</td>
                <td className="px-4 py-3 font-mono text-slate-700">{c.plaque}</td>
                <td className="px-4 py-3 text-slate-600">{c.site || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.telephone || "—"}</td>
                <td className="px-4 py-3 text-center">
                  {c.actif ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" />
                  ) : (
                    <XCircle className="h-4 w-4 text-slate-300 inline" />
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {isAdmin && (
                    <>
                      <button onClick={() => setEditing(c)} className="btn-ghost py-1 px-2 text-xs">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Supprimer ${c.nom} ?`)) supprimer.mutate(c.id);
                        }}
                        className="btn-ghost py-1 px-2 text-xs text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(adding || editing) && (
        <EditChauffeurModal
          existing={editing ?? undefined}
          open
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ── Motifs ────────────────────────────────────────────────────────────────────

function MotifsTab() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<MotifRetardFlotte | null>(null);
  const [adding, setAdding] = useState(false);

  const isAdmin = user?.role === "admin";

  const { data: motifs = [], isLoading, error } = useQuery({
    queryKey: ["flotte-motifs"],
    queryFn: () => api.flotteMotifs.list(),
  });

  const supprimer = useMutation({
    mutationFn: (id: string) => api.flotteMotifs.delete(id),
    onSuccess: () => {
      toast.success("Motif supprimé");
      qc.invalidateQueries({ queryKey: ["flotte-motifs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  if (isLoading) return <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>;
  if (error)
    return (
      <div className="card p-6 border-red-200 bg-red-50 text-sm text-red-700">
        {error instanceof Error ? error.message : "Erreur"}
      </div>
    );

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex justify-end">
          <button onClick={() => setAdding(true)} className="btn-primary gap-1.5">
            <Plus className="h-4 w-4" />
            Nouveau motif
          </button>
        </div>
      )}

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
            {motifs.map((m: MotifRetardFlotte) => (
              <tr key={m.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3 font-medium text-slate-900">{m.libelle}</td>
                <td className="px-4 py-3">
                  <span className="badge-neutral">{m.categorie}</span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {isAdmin && (
                    <>
                      <button onClick={() => setEditing(m)} className="btn-ghost py-1 px-2 text-xs">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Supprimer le motif « ${m.libelle} » ?`)) supprimer.mutate(m.id);
                        }}
                        className="btn-ghost py-1 px-2 text-xs text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          domain="flotte"
          addFn={(libelle, categorie) => api.flotteMotifs.add(libelle, categorie)}
          updateFn={(input) => api.flotteMotifs.update(input)}
          categories={CATEGORIES_FLOTTE}
          queryKey="flotte-motifs"
        />
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "ok" | "warn" | "info";
}) {
  const accentClass =
    accent === "ok" ? "text-emerald-600" : accent === "warn" ? "text-amber-600" : accent === "info" ? "text-blue-600" : "text-slate-900";
  return (
    <div className="card p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("text-2xl font-bold mt-1", accentClass)}>{value}</div>
    </div>
  );
}
