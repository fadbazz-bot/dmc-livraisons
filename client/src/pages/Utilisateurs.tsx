import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Trash2,
  RefreshCw,
  ShieldCheck,
  Truck,
  Search,
} from "lucide-react";
import { api } from "@/api/appsScript";
import type { Role, Utilisateur } from "@/types/domain";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { cn, includesLower } from "@/lib/cn";

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "admin",        label: "Admin",         description: "Tous les droits, supervision flotte incluse" },
  { value: "commercial",   label: "Commercial",    description: "Crée les demandes. Peut être superviseur flotte." },
  { value: "responsable",  label: "Responsable",   description: "Saisit le code de livraison côté magasin" },
  { value: "chef_poste",   label: "Chef de poste", description: "Poste de garde — connexion par PIN" },
  { value: "agent_showroom", label: "Agent showroom", description: "Autorise l'entrée client au showroom — connexion par PIN" },
  { value: "controleur",   label: "Contrôleur",    description: "Valide les justificatifs de retard" },
  { value: "chef_flotte",  label: "Chef Flotte",   description: "Gère les chauffeurs et la flotte interne (vue Flotte interne uniquement)" },
];

const SITES = ["Dakar", "Diamniadio"] as const;
const ZONES = ["Showroom", "Parc Acier", "Dépôt Quincaillerie", "SAV"] as const;

export default function UtilisateursPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<Utilisateur | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: users = [], isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ["utilisateurs"],
    queryFn: () => api.referentiels.tousUtilisateurs(),
  });

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    return (
      includesLower(u.nom, search) ||
      includesLower(u.email, search) ||
      includesLower(u.role, search) ||
      includesLower(u.site, search) ||
      includesLower(u.zone, search)
    );
  });

  // Refus si l'utilisateur n'est pas admin
  if (currentUser && currentUser.role !== "admin") {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Accès réservé aux admins</h2>
          <p className="text-sm text-slate-500">Cette page est uniquement accessible aux comptes admin.</p>
        </div>
      </div>
    );
  }

  const desactiver = useMutation({
    mutationFn: (id: string) => api.referentiels.desactiverUser(id),
    onSuccess: () => {
      toast.success("Compte désactivé");
      qc.invalidateQueries({ queryKey: ["utilisateurs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const reactiver = useMutation({
    mutationFn: (id: string) => api.referentiels.modifierUser({ id, actif: true }),
    onSuccess: () => {
      toast.success("Compte réactivé");
      qc.invalidateQueries({ queryKey: ["utilisateurs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const supprimer = useMutation({
    mutationFn: (id: string) => api.referentiels.supprimerUser(id),
    onSuccess: () => {
      toast.success("Compte supprimé définitivement");
      qc.invalidateQueries({ queryKey: ["utilisateurs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand-900 text-white flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Gestion des utilisateurs</h1>
              <p className="text-xs text-slate-500">
                Ajouter, modifier, désactiver ou supprimer les comptes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="btn-outline gap-1.5"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              <span className="hidden sm:inline">Rafraîchir</span>
            </button>
            <button onClick={() => setAdding(true)} className="btn-primary gap-1.5">
              <Plus className="h-4 w-4" />
              Nouvel utilisateur
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Chercher un nom, email, rôle…"
            className="input pl-9"
          />
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="card p-6 text-center text-slate-500 text-sm">Chargement…</div>
        ) : error ? (
          <div className="card p-6 border-red-200 bg-red-50">
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : "Erreur"}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center text-slate-500">
            {search ? "Aucun utilisateur trouvé." : "Aucun utilisateur enregistré."}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left">Nom</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Rôle</th>
                    <th className="px-4 py-3 text-left">Site</th>
                    <th className="px-4 py-3 text-left">Zone</th>
                    <th className="px-4 py-3 text-left">PIN</th>
                    <th className="px-4 py-3 text-left">Flags</th>
                    <th className="px-4 py-3 text-left">Statut</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      onEdit={() => setEditingUser(u)}
                      onToggle={() => (u.actif ? desactiver.mutate(u.id) : reactiver.mutate(u.id))}
                      onDelete={() => {
                        if (confirm(`Supprimer définitivement « ${u.nom} » ? Action irréversible.`)) {
                          supprimer.mutate(u.id);
                        }
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modales */}
      {(adding || editingUser) && (
        <UserFormModal
          existing={editingUser}
          onClose={() => {
            setAdding(false);
            setEditingUser(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function UserRow({
  user,
  onEdit,
  onToggle,
  onDelete,
}: {
  user: Utilisateur;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const roleLabel = ROLES.find((r) => r.value === user.role)?.label ?? user.role;
  return (
    <tr className={cn("hover:bg-slate-50/60", !user.actif && "opacity-50")}>
      <td className="px-4 py-3 font-medium text-slate-900">{user.nom}</td>
      <td className="px-4 py-3 font-mono text-xs text-slate-600">{user.email}</td>
      <td className="px-4 py-3">
        <span className="badge-info">{roleLabel}</span>
      </td>
      <td className="px-4 py-3 text-slate-600">{user.site || "—"}</td>
      <td className="px-4 py-3 text-slate-600">{user.zone || "—"}</td>
      <td className="px-4 py-3">
        {(user.role === "chef_poste" || user.role === "agent_showroom") && user.pin ? (
          <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded tracking-[0.2em]">
            {user.pin}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {user.role === "commercial" && user.superviseurFlotte && (
          <span className="badge-info inline-flex items-center gap-1">
            <Truck className="h-3 w-3" />
            Superviseur flotte
          </span>
        )}
        {user.role === "admin" && (
          <span className="badge-success inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            Admin
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {user.actif ? (
          <span className="badge-success">Actif</span>
        ) : (
          <span className="badge-neutral">Inactif</span>
        )}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <button
          onClick={onEdit}
          className="btn-ghost py-1 px-2 text-xs"
          title="Modifier"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onToggle}
          className="btn-ghost py-1 px-2 text-xs"
          title={user.actif ? "Désactiver" : "Réactiver"}
        >
          {user.actif ? (
            <ToggleRight className="h-4 w-4 text-emerald-600" />
          ) : (
            <ToggleLeft className="h-4 w-4 text-slate-400" />
          )}
        </button>
        <button
          onClick={onDelete}
          className="btn-ghost py-1 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
          title="Supprimer définitivement"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ─── Form Modal ──────────────────────────────────────────────────────────────

function UserFormModal({
  existing,
  onClose,
}: {
  existing: Utilisateur | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [email, setEmail] = useState(existing?.email ?? "");
  const [nom, setNom] = useState(existing?.nom ?? "");
  const [role, setRole] = useState<Role>((existing?.role as Role) ?? "commercial");
  const [site, setSite] = useState(existing?.site ?? "");
  const [zone, setZone] = useState(existing?.zone ?? "");
  const [pin, setPin] = useState(existing?.pin ?? "");
  const [superviseurFlotte, setSuperviseurFlotte] = useState(!!existing?.superviseurFlotte);

  const isEdit = !!existing;

  const m = useMutation({
    mutationFn: () => {
      if (isEdit) {
        return api.referentiels.modifierUser({
          id: existing.id,
          nom: nom.trim(),
          role,
          site: site || undefined,
          zone: zone || undefined,
          pin: pin || undefined,
          superviseurFlotte: role === "commercial" ? superviseurFlotte : false,
        });
      } else {
        return api.referentiels.ajouterUser({
          email: email.trim(),
          nom: nom.trim(),
          role,
          site: site || undefined,
          zone: zone || undefined,
          pin: pin || undefined,
          superviseurFlotte: role === "commercial" ? superviseurFlotte : false,
        });
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Utilisateur modifié" : "Utilisateur ajouté");
      qc.invalidateQueries({ queryKey: ["utilisateurs"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isEdit && !email.trim()) {
      toast.error("Email obligatoire");
      return;
    }
    if (!nom.trim()) {
      toast.error("Nom obligatoire");
      return;
    }
    if (!isEdit && !email.toLowerCase().endsWith("@dmcsen.com")) {
      toast.error("L'email doit être en @dmcsen.com");
      return;
    }
    m.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Modifier ${existing.nom}` : "Nouvel utilisateur"}
      description={isEdit ? "L'email ne peut pas être modifié." : "Email @dmcsen.com obligatoire."}
      size="md"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={m.isPending}>
            Annuler
          </button>
          <button
            type="submit"
            form="form-user"
            className="btn-primary"
            disabled={m.isPending}
          >
            {m.isPending ? "Enregistrement…" : isEdit ? "Enregistrer" : "Ajouter"}
          </button>
        </>
      }
    >
      <form id="form-user" onSubmit={onSubmit} className="space-y-4">
        {!isEdit && (
          <div>
            <label htmlFor="email" className="label">Email <span className="text-red-500">*</span></label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom.nom@dmcsen.com"
              autoComplete="off"
              className="input"
            />
          </div>
        )}
        <div>
          <label htmlFor="nom" className="label">Nom complet <span className="text-red-500">*</span></label>
          <input
            id="nom"
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Prénom Nom"
            autoComplete="off"
            className="input"
            autoFocus
          />
        </div>

        <div>
          <label className="label">Rôle <span className="text-red-500">*</span></label>
          <div className="space-y-1.5">
            {ROLES.map((r) => (
              <label
                key={r.value}
                className={cn(
                  "flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all",
                  role === r.value
                    ? "border-brand-900 bg-brand-50 ring-2 ring-brand-200"
                    : "border-slate-200 hover:border-slate-300",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={role === r.value}
                  onChange={() => setRole(r.value)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-sm font-medium",
                      role === r.value ? "text-brand-900" : "text-slate-900",
                    )}
                  >
                    {r.label}
                  </div>
                  <div className="text-xs text-slate-500">{r.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Champs conditionnels selon le rôle */}
        {(role === "responsable" || role === "chef_poste" || role === "agent_showroom" || role === "controleur") && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="site" className="label">Site</label>
              <select
                id="site"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                className="input"
              >
                <option value="">— Aucun —</option>
                {SITES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            {role === "responsable" && (
              <div>
                <label htmlFor="zone" className="label">Zone</label>
                <select
                  id="zone"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  className="input"
                >
                  <option value="">— Aucune —</option>
                  {ZONES.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {(role === "chef_poste" || role === "agent_showroom") && (
          <div>
            <label htmlFor="pin" className="label">Code PIN (4-6 chiffres)</label>
            <input
              id="pin"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="1234"
              autoComplete="off"
              className="input font-mono tracking-[0.4em] text-center"
            />
            <p className="text-xs text-slate-500 mt-1">
              {role === "agent_showroom"
                ? "Communique ce PIN à l'agent showroom — il s'en sert pour se connecter."
                : "Communique ce PIN au chef de poste — il s'en sert pour se connecter."}
            </p>
          </div>
        )}

        {role === "commercial" && (
          <label
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
              superviseurFlotte
                ? "border-brand-900 bg-brand-50 ring-2 ring-brand-200"
                : "border-slate-200 hover:border-slate-300",
            )}
          >
            <input
              type="checkbox"
              checked={superviseurFlotte}
              onChange={(e) => setSuperviseurFlotte(e.target.checked)}
              className="mt-1"
            />
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  "text-sm font-medium flex items-center gap-1.5",
                  superviseurFlotte ? "text-brand-900" : "text-slate-900",
                )}
              >
                <Truck className="h-4 w-4" />
                Superviseur Flotte
              </div>
              <div className="text-xs text-slate-500">
                Donne accès aux vues de contrôle de la flotte interne DMC (non-conformités, LOI
                10h, justifications responsable chauffeurs).
              </div>
            </div>
          </label>
        )}
      </form>
    </Modal>
  );
}
