import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PackagePlus,
  ShoppingBag,
  Building2,
  Hash,
  Copy,
  CheckCircle2,
  Check,
  AlertCircle,
  Truck,
  Globe,
  CalendarClock,
  XCircle,
  Database,
  History,
} from "lucide-react";
import { api } from "@/api/appsScript";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { MAGASINS, findMagasin, type Magasin } from "@/types/magasins";
import type { CreateCommandeInput, CreateCommandeResult, ModeLivraison } from "@/types/domain";
import { cn } from "@/lib/cn";
import { calculerDatePrevueLocale, formatDateLisible } from "@/lib/flotte";

const CLIENT_HISTORY_KEY = "dmc.client_history.v1";
const MAX_CLIENT_HISTORY = 40;

/**
 * Nouvelle demande de préparation — flux v3.
 *
 * Le commercial coche directement les magasins concernés parmi les 6 (Dakar +
 * Diamniadio). Une coche = une expédition créée avec son propre code PIN.
 * Le "site" de la commande est dérivé : si tous les magasins cochés sont sur
 * le même site, c'est ce site ; sinon "Mixte" (mais on garde le site du
 * premier coché pour la rétrocompat avec Code.gs qui exige un site).
 */
export default function NouvelleDemandePage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [modeLivraison, setModeLivraison] = useState<ModeLivraison>("externe");
  const [numCmdNav, setNumCmdNav] = useState("");
  const [client, setClient] = useState("");
  const [clientHistory, setClientHistory] = useState<string[]>([]);
  const [selectedMagIds, setSelectedMagIds] = useState<Set<string>>(new Set());
  const [createdCodes, setCreatedCodes] = useState<CreateCommandeResult | null>(null);

  // Date prévue calculée auto si mode interne (preview client-side)
  const datePrevue = useMemo(
    () => (modeLivraison === "interne" ? calculerDatePrevueLocale() : null),
    [modeLivraison],
  );

  // Vérification que le client est dans la whitelist livraison interne
  // (déclenchée uniquement si mode interne + nom client renseigné)
  const clientTrimmed = client.trim();
  const { data: clientVerif, isLoading: verifying } = useQuery({
    queryKey: ["client-verif", clientTrimmed],
    queryFn: () => api.flotteClients.verifier(clientTrimmed),
    enabled: modeLivraison === "interne" && clientTrimmed.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  // Lire l'historique des clients au mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLIENT_HISTORY_KEY);
      if (raw) setClientHistory(JSON.parse(raw));
    } catch {}
  }, []);

  const selectedMagasins = useMemo(
    () => MAGASINS.filter((m) => selectedMagIds.has(m.id)),
    [selectedMagIds],
  );

  // Site dérivé : le premier site touché (pour respecter le contrat Code.gs)
  const derivedSite = useMemo(() => {
    if (selectedMagasins.length === 0) return "";
    const sites = new Set(selectedMagasins.map((m) => m.site));
    if (sites.size === 1) return [...sites][0];
    return selectedMagasins[0].site; // mixed → on prend le premier
  }, [selectedMagasins]);

  const hasMixedSites = useMemo(
    () => new Set(selectedMagasins.map((m) => m.site)).size > 1,
    [selectedMagasins],
  );

  const m = useMutation({
    mutationFn: (payload: CreateCommandeInput) => api.commandes.create(payload),
    onSuccess: (res) => {
      toast.success(
        `Commande créée — ${res.expeditions.length} expédition${res.expeditions.length > 1 ? "s" : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["expeditions"] });
      if (client.trim()) {
        const next = [client.trim(), ...clientHistory.filter((c) => c !== client.trim())].slice(
          0,
          MAX_CLIENT_HISTORY,
        );
        setClientHistory(next);
        try {
          localStorage.setItem(CLIENT_HISTORY_KEY, JSON.stringify(next));
        } catch {}
      }
      setCreatedCodes(res);
      setNumCmdNav("");
      setClient("");
      setSelectedMagIds(new Set());
      // On garde modeLivraison tel quel — souvent l'utilisateur enchaîne plusieurs commandes du même type
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur inconnue"),
  });

  function toggleMag(id: string) {
    setSelectedMagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Session expirée");
      return;
    }
    if (!numCmdNav.trim()) {
      toast.error("N° de commande NAV obligatoire.");
      return;
    }
    if (selectedMagasins.length === 0) {
      toast.error("Coche au moins un magasin de livraison.");
      return;
    }
    // En mode interne, le client est obligatoire (vérification whitelist)
    if (modeLivraison === "interne" && !clientTrimmed) {
      toast.error("En livraison interne, le nom du client est obligatoire (whitelist).");
      return;
    }
    // Si client non autorisé en interne, confirmation
    if (
      modeLivraison === "interne" &&
      clientVerif &&
      !clientVerif.autorise &&
      !clientVerif.exception
    ) {
      const ok = window.confirm(
        `Attention : « ${clientTrimmed} » n'est pas dans la whitelist livraison interne.\n\n` +
          `Raison : ${clientVerif.raison}\n\n` +
          `Tu peux quand même créer la commande, mais elle sera marquée hors whitelist. Continuer ?`,
      );
      if (!ok) return;
    }

    const payload: CreateCommandeInput = {
      numCmdNav: numCmdNav.trim(),
      nomClient: client.trim() || undefined,
      site: derivedSite,
      commercialEmail: user.email,
      commercialNom: user.nom,
      modeLivraison,
      expeditions: selectedMagasins.map((mag) => ({
        zone: mag.label,
        magasinId: mag.id,
        magasinLabel: mag.label,
        magasinEmail: mag.email,
        magasinNom: mag.label,
      })),
    };
    m.mutate(payload);
  }

  // Grouper les magasins par site pour l'affichage
  const magasinsDakar = MAGASINS.filter((m) => m.site === "Dakar");
  const magasinsDiamniadio = MAGASINS.filter((m) => m.site === "Diamniadio");

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-brand-900 text-white flex items-center justify-center">
            <PackagePlus className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Nouvelle demande</h1>
            <p className="text-xs text-slate-500">
              Crée une commande et coche les magasins de livraison
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <form onSubmit={onSubmit} className="max-w-3xl mx-auto space-y-5">
          {/* Mode de livraison */}
          <div className="card p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <label className="label !mb-0">Mode de livraison <span className="text-red-500">*</span></label>
              {modeLivraison === "interne" && datePrevue && (
                <span className="text-xs text-brand-700 inline-flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Livraison prévue : <strong>{formatDateLisible(datePrevue)}</strong>
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ModeCard
                value="externe"
                selected={modeLivraison === "externe"}
                onSelect={() => setModeLivraison("externe")}
                icon={<Globe className="h-5 w-5" />}
                title="Externe"
                desc="Transporteur ou véhicule du client"
              />
              <ModeCard
                value="interne"
                selected={modeLivraison === "interne"}
                onSelect={() => setModeLivraison("interne")}
                icon={<Truck className="h-5 w-5" />}
                title="Interne (Flotte DMC)"
                desc="Nos camions, nos chauffeurs"
              />
            </div>
          </div>

          {/* Identité de la commande */}
          <div className="card p-4 space-y-4">
            <div>
              <label htmlFor="numCmdNav" className="label">
                N° de commande NAV <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="numCmdNav"
                  type="text"
                  value={numCmdNav}
                  onChange={(e) => setNumCmdNav(e.target.value.toUpperCase())}
                  placeholder="CV-MC2502353"
                  autoComplete="off"
                  className="input pl-9 font-mono uppercase"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Tel qu'il apparaît dans NAV.</p>
            </div>

            <div>
              <label htmlFor="client" className="label">
                Nom du client {modeLivraison === "interne" && <span className="text-red-500">*</span>}
              </label>
              <ClientAutocomplete value={client} onChange={setClient} history={clientHistory} />

              {/* Vérification whitelist livraison interne */}
              {modeLivraison === "interne" && clientTrimmed.length >= 2 && (
                <ClientVerifBadge
                  loading={verifying}
                  verif={clientVerif}
                  client={clientTrimmed}
                />
              )}

              <p className="text-xs text-slate-500 mt-1">
                {modeLivraison === "interne"
                  ? "Obligatoire : le client doit être dans la whitelist livraison interne."
                  : "Optionnel mais recommandé — utile au poste de garde pour la vue \"par client\"."}
              </p>
            </div>
          </div>

          {/* Magasins — checkboxes groupés par site */}
          <div className="card p-4 space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="label !mb-0">Magasins de livraison <span className="text-red-500">*</span></div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Coche tous les magasins concernés. Une coche = une expédition avec son code PIN propre.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-600">
                {selectedMagIds.size} coché{selectedMagIds.size > 1 ? "s" : ""}
              </span>
            </div>

            <MagasinGroup
              site="Dakar"
              magasins={magasinsDakar}
              selectedIds={selectedMagIds}
              onToggle={toggleMag}
            />
            <MagasinGroup
              site="Diamniadio"
              magasins={magasinsDiamniadio}
              selectedIds={selectedMagIds}
              onToggle={toggleMag}
            />

            {hasMixedSites && (
              <div className="flex gap-2 items-start p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  Tu as coché des magasins sur les <strong>deux sites</strong>. Une seule commande
                  sera créée (site enregistré : <strong>{derivedSite}</strong>). Vérifie que c'est
                  bien voulu — sinon, sépare en plusieurs commandes.
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="sticky bottom-4 sm:bottom-0 flex gap-2 justify-end pt-2 bg-slate-50/95 backdrop-blur-sm rounded-lg">
            <button
              type="submit"
              className="btn-primary gap-2"
              disabled={m.isPending || selectedMagIds.size === 0}
            >
              <ShoppingBag className="h-4 w-4" />
              {m.isPending
                ? "Création…"
                : selectedMagIds.size === 0
                ? "Coche au moins un magasin"
                : `Créer la commande (${selectedMagIds.size} expé${selectedMagIds.size > 1 ? "s" : ""})`}
            </button>
          </div>
        </form>
      </div>

      {createdCodes && (
        <CodesRetraitModal result={createdCodes} onClose={() => setCreatedCodes(null)} />
      )}
    </div>
  );
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function ModeCard({
  value,
  selected,
  onSelect,
  icon,
  title,
  desc,
}: {
  value: ModeLivraison;
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      role="radio"
      aria-checked={selected}
      aria-label={value}
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
        selected
          ? "border-brand-900 bg-brand-50 ring-2 ring-brand-200"
          : "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      <div
        className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
          selected ? "bg-brand-900 text-white" : "bg-slate-100 text-slate-500",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-semibold", selected ? "text-brand-900" : "text-slate-900")}>
          {title}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
      </div>
    </button>
  );
}

function ClientVerifBadge({
  loading,
  verif,
  client,
}: {
  loading: boolean;
  verif?: { autorise: boolean; exception: boolean; raison: string };
  client: string;
}) {
  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
        <div className="h-3 w-3 rounded-full border-2 border-slate-300 border-t-brand-900 animate-spin" />
        Vérification de « {client} »…
      </div>
    );
  }
  if (!verif) return null;

  if (verif.autorise) {
    return (
      <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>Client autorisé livraison interne.</span>
      </div>
    );
  }
  if (verif.exception) {
    return (
      <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          <strong>Autorisé en exception seulement</strong> (dépend du montant et des articles).
          Vérifie avant de valider.
        </span>
      </div>
    );
  }
  return (
    <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900">
      <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>
        <strong>Non autorisé</strong> — {verif.raison}. Tu peux quand même créer la commande, on
        te demandera confirmation.
      </span>
    </div>
  );
}

function MagasinGroup({
  site,
  magasins,
  selectedIds,
  onToggle,
}: {
  site: string;
  magasins: Magasin[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Building2 className="h-4 w-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-700">Site {site}</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        {magasins.map((m) => (
          <MagasinCheckbox
            key={m.id}
            magasin={m}
            checked={selectedIds.has(m.id)}
            onToggle={() => onToggle(m.id)}
          />
        ))}
      </div>
    </div>
  );
}

function MagasinCheckbox({
  magasin,
  checked,
  onToggle,
}: {
  magasin: Magasin;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="checkbox"
      aria-checked={checked}
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
        checked
          ? "border-brand-900 bg-brand-50 ring-2 ring-brand-200"
          : "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      <div
        className={cn(
          "h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
          checked ? "bg-brand-900 border-brand-900" : "bg-white border-slate-300",
        )}
      >
        {checked && <Check className="h-3.5 w-3.5 text-white" />}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-sm font-semibold leading-tight",
            checked ? "text-brand-900" : "text-slate-900",
          )}
        >
          {magasin.label}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">{magasin.zone}</div>
      </div>
    </button>
  );
}

interface ClientSuggestion {
  name: string;
  source: "history" | "db";
  autorise?: boolean;
}

function ClientAutocomplete({
  value,
  onChange,
  history,
}: {
  value: string;
  onChange: (v: string) => void;
  history: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Charge la base clients (whitelist livraison interne) — utile en mode interne
  // ET en externe car ce sont quand même les noms de référence officiels.
  const { data: clientsDb = [] } = useQuery({
    queryKey: ["clients-autocomplete"],
    queryFn: () => api.flotteClients.list(true),
    staleTime: 10 * 60 * 1000,
  });

  const suggestions: ClientSuggestion[] = useMemo(() => {
    const v = String(value).trim().toLowerCase();

    // Historique localStorage (clients déjà saisis par cet utilisateur)
    const historyMatches = history
      .filter((h) => !v || String(h).toLowerCase().includes(v))
      .map((h) => ({ name: String(h), source: "history" as const }));

    // Base de données (whitelist livraison interne)
    const dbMatches = clientsDb
      .filter((c) => c.nomClient && (!v || String(c.nomClient).toLowerCase().includes(v)))
      .filter((c) => !history.some((h) => String(h).toLowerCase() === String(c.nomClient).toLowerCase()))
      .slice(0, 12)
      .map((c) => ({
        name: String(c.nomClient),
        source: "db" as const,
        autorise: c.autorise,
      }));

    return [...historyMatches.slice(0, 4), ...dbMatches];
  }, [value, history, clientsDb]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Tape quelques lettres ou un nouveau client…"
        autoComplete="off"
        className="input"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg divide-y divide-slate-50">
          {suggestions.map((s, i) => (
            <li key={`${s.source}-${s.name}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  onChange(s.name);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
              >
                {s.source === "history" ? (
                  <History className="h-3 w-3 text-slate-400 shrink-0" />
                ) : (
                  <Database className="h-3 w-3 text-brand-600 shrink-0" />
                )}
                <span className="flex-1 truncate">{s.name}</span>
                {s.source === "db" && s.autorise && (
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                    Whitelist
                  </span>
                )}
                {s.source === "history" && (
                  <span className="text-[10px] text-slate-400">Récent</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && suggestions.length === 0 && value.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 shadow-lg text-xs text-slate-500">
          <p>Aucun client trouvé pour « {value} ».</p>
          <p className="mt-1">C'est OK : tu peux saisir un nouveau client, il sera créé tel quel.</p>
        </div>
      )}
    </div>
  );
}

function CodesRetraitModal({
  result,
  onClose,
}: {
  result: CreateCommandeResult;
  onClose: () => void;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(id);
        toast.success("Code copié");
        setTimeout(() => setCopied(null), 2000);
      },
      () => toast.error("Copie impossible"),
    );
  }

  const isInterne = result.expeditions.some((e) => e.modeLivraison === "interne");

  return (
    <Modal
      open
      onClose={onClose}
      title="🔐 Codes de retrait générés"
      description="Tu pourras les retrouver via le bouton « Code » sur la file des commandes."
      size="lg"
      footer={
        <button type="button" onClick={onClose} className="btn-primary">
          J'ai noté les codes
        </button>
      }
    >
      <div className="space-y-3">
        {isInterne ? (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
            🚛 <strong>Livraison interne (Flotte DMC)</strong> — le responsable flotte prendra le
            relais : assignation chauffeur, planification, suivi conformité date prévue. Tu peux
            suivre l'avancée dans <strong>Flotte interne → Planifiées</strong>.
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            ⚠️ Ces codes PIN doivent être remis au client quand il vient les récupérer. Tu pourras
            les revoir plus tard dans la file via le bouton « Code ».
          </div>
        )}
        <div className="space-y-2">
          {result.expeditions.map((exp) => (
            <div
              key={exp.id}
              className="rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-500">{exp.magasinLabel || exp.zone}</div>
                <div className="font-mono text-sm font-medium text-slate-900 truncate">
                  Expé {exp.numExpedition}
                </div>
                {exp.dateLivraisonPrevue && (
                  <div className="text-xs text-brand-700 mt-1 inline-flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    Prévue : <strong>{formatDateLisible(exp.dateLivraisonPrevue)}</strong>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => copy(exp.codeRetrait, exp.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-900 text-white font-mono font-bold tracking-[0.3em] text-lg hover:bg-brand-700"
              >
                <span>{exp.codeRetrait}</span>
                {copied === exp.id ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4 opacity-70" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
