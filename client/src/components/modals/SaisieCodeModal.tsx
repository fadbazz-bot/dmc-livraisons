import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Footprints, KeyRound, PackageCheck, PackageX, TriangleAlert } from "lucide-react";
import { api } from "@/api/appsScript";
import type { Expedition } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { ExpInfoBlock } from "@/components/modals/ExpInfoBlock";
import { PhotoCapture } from "@/components/PhotoCapture";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

interface Props {
  exp: Expedition;
  open: boolean;
  onClose: () => void;
}

/** Découpe "CV-MC123 / CV-MC456 / ..." en tableau de N° propres. */
function splitNumCmdNav(str: string): string[] {
  return str
    .split(/[/,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type Preuve = "plaque" | "pieton" | "code";

/**
 * Action côté responsable magasin :
 * le client est arrivé chez lui → il le confirme par une PREUVE, et le chargement est enclenché.
 *   - plaque : photo de la plaque du véhicule (comparée à celle saisie au poste de garde) ;
 *   - pieton : client venu sans véhicule (uniquement si aucune plaque n'a été enregistrée à l'entrée) ;
 *   - code   : ancien code PIN, conservé pendant la période de transition.
 *
 * Chargement partiel : si la demande regroupe plusieurs N° commande NAV et que
 * le véhicule ne peut pas tout emporter, le responsable décoche les commandes
 * qui restent au magasin. Un reliquat (nouveau code, nouvelle attente) est
 * créé automatiquement pour elles — pas besoin que le commercial recrée une
 * demande.
 */
export function SaisieCodeModal({ exp, open, onClose }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [pin, setPin] = useState("");
  const sansVehicule = !exp.plaque;
  const [preuve, setPreuve] = useState<Preuve>(sansVehicule ? "pieton" : "plaque");
  const [photoPlaque, setPhotoPlaque] = useState<string | null>(null);
  const [plaqueDiff, setPlaqueDiff] = useState(false);
  const [commentaire, setCommentaire] = useState("");

  const commandes = useMemo(() => splitNumCmdNav(exp.numCmdNav || ""), [exp.numCmdNav]);
  const isMultiple = commandes.length > 1;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(commandes));

  const toutSelectionne = selected.size === commandes.length;
  const nbRestantes = commandes.length - selected.size;

  function toggle(cmd: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cmd)) next.delete(cmd);
      else next.add(cmd);
      return next;
    });
  }

  const m = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Session expirée");
      return api.jalons.saisieCode(exp.id, {
        acteurEmail: user.email,
        acteurNom: user.nom,
        preuve,
        photoPlaqueMagasin: preuve === "plaque" ? (photoPlaque ?? undefined) : undefined,
        plaqueConforme: preuve === "plaque" ? !plaqueDiff : undefined,
        commentaire: plaqueDiff ? commentaire.trim() : undefined,
        codeRetraitSaisi: preuve === "code" ? pin.trim() : undefined,
        // On ne transmet la sélection que si elle a du sens (plusieurs
        // commandes ET pas toutes sélectionnées) — sinon comportement normal.
        commandesChargees: isMultiple ? Array.from(selected) : undefined,
      });
    },
    onSuccess: (res) => {
      if (res.reliquat) {
        toast.success(
          `Chargement partiel validé — reliquat créé (${res.reliquat.numCmdNav}), ` +
            `nouveau code : ${res.reliquat.codeRetrait}`,
        );
      } else {
        toast.success(
          res.plaqueConforme === false
            ? "Chargement enclenché — plaque différente signalée"
            : "Arrivée confirmée — le chargement est enclenché",
        );
      }
      qc.invalidateQueries({ queryKey: ["expeditions"] });
      resetForm();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur inconnue"),
  });

  function resetForm() {
    setPin("");
    setPhotoPlaque(null);
    setPlaqueDiff(false);
    setCommentaire("");
    setSelected(new Set(commandes));
  }

  const preuveOk =
    preuve === "pieton" ||
    (preuve === "plaque" && !!photoPlaque && (!plaqueDiff || commentaire.trim().length >= 3)) ||
    (preuve === "code" && pin.trim().length === 4);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!preuveOk) {
      toast.error(
        preuve === "plaque"
          ? "Prends la photo de la plaque (et précise la différence si elle ne correspond pas)."
          : "Le code PIN doit faire 4 chiffres.",
      );
      return;
    }
    if (isMultiple && selected.size === 0) {
      toast.error("Sélectionne au moins une commande chargée sur ce véhicule.");
      return;
    }
    m.mutate();
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Client arrivé au magasin"
      description="Confirme que le client est bien là : le chargement démarre."
      size={isMultiple ? "lg" : "md"}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={handleClose} disabled={m.isPending}>
            Annuler
          </button>
          <button
            type="submit"
            form="form-saisie-code"
            className="btn-primary gap-2"
            disabled={m.isPending || !preuveOk || (isMultiple && selected.size === 0)}
          >
            <Check className="h-4 w-4" />
            {m.isPending
              ? "Validation…"
              : toutSelectionne
                ? "Confirmer et enclencher"
                : `Valider (${selected.size}/${commandes.length}) et créer le reliquat`}
          </button>
        </>
      }
    >
      <form id="form-saisie-code" onSubmit={onSubmit} className="space-y-4">
        <ExpInfoBlock exp={exp} />

        {isMultiple && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">
                Commandes effectivement chargées sur ce véhicule
              </label>
              <button
                type="button"
                onClick={() =>
                  setSelected(toutSelectionne ? new Set() : new Set(commandes))
                }
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                {toutSelectionne ? "Tout décocher" : "Tout sélectionner"}
              </button>
            </div>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {commandes.map((c) => {
                const checked = selected.has(c);
                return (
                  <label
                    key={c}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer transition-colors",
                      checked ? "bg-emerald-50" : "bg-white hover:bg-slate-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(c)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-900 focus:ring-brand-400"
                    />
                    <span className="font-mono flex-1">{c}</span>
                    {checked ? (
                      <PackageCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <PackageX className="h-4 w-4 text-slate-300 shrink-0" />
                    )}
                  </label>
                );
              })}
            </div>
            {nbRestantes > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mt-2">
                {nbRestantes} commande(s) resteront au magasin : un nouveau code de retrait sera
                généré automatiquement et le commercial en sera notifié.
              </p>
            )}
          </div>
        )}

        {/* Preuve d'arrivée */}
        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-700">Preuve d'arrivée</div>
          <div className="grid grid-cols-3 gap-1 rounded-ctl bg-slate-100 p-1 text-sm">
            {([
              ["plaque", "Plaque", Camera, sansVehicule],
              ["pieton", "Client à pied", Footprints, !sansVehicule],
              ["code", "Code", KeyRound, false],
            ] as const).map(([k, label, Icon, off]) => (
              <button
                key={k}
                type="button"
                disabled={off}
                onClick={() => setPreuve(k)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md px-2 py-2 font-medium transition-colors disabled:opacity-40",
                  preuve === k ? "bg-white text-brand-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {preuve === "plaque" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-slate-50 px-3.5 py-2.5 text-sm">
              <span className="text-slate-500">Plaque notée au poste de garde</span>
              <span className="num text-base font-semibold text-slate-900">{exp.plaque}</span>
            </div>
            <PhotoCapture
              label="Photo de la plaque du véhicule"
              hint="La plaque doit être lisible. L'heure est enregistrée par le serveur."
              value={photoPlaque}
              onChange={setPhotoPlaque}
              maxDimension={1280}
              quality={0.8}
              required
            />
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={plaqueDiff}
                onChange={(e) => setPlaqueDiff(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-900 focus:ring-brand-400"
              />
              La plaque ne correspond pas à celle du poste de garde
            </label>
            {plaqueDiff && (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <div className="flex items-start gap-2 text-sm text-amber-900">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Tu peux continuer, mais l'écart sera signalé dans Chat et dans l'historique.</span>
                </div>
                <input
                  className="input"
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  placeholder="Que s'est-il passé ? (autre véhicule, plaque mal saisie…)"
                />
              </div>
            )}
          </div>
        )}

        {preuve === "pieton" && (
          <p className="rounded-lg border border-line bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
            Client venu sans véhicule : aucune plaque n'a été enregistrée à l'entrée, aucune photo n'est
            demandée. L'heure de son entrée vaut heure d'arrivée.
          </p>
        )}

        {preuve === "code" && (
          <div>
            <label htmlFor="pin-saisie" className="label">
              Code à 4 chiffres <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="pin-saisie"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                autoComplete="off"
                placeholder="1234"
                className="input pl-9 text-center text-2xl tracking-[0.8em] font-mono font-bold"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Ancienne méthode, conservée pendant la transition. Préfère la photo de la plaque.
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
}
