import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Check, Truck, User } from "lucide-react";
import { api } from "@/api/appsScript";
import type { ChauffeurFlotte, LivraisonFlotte } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

/**
 * Attribution d'une livraison flotte : le chauffeur et le véhicule sont deux choix distincts.
 * Choisir un chauffeur propose sa plaque habituelle, mais on peut la changer (ou saisir une autre).
 */

/** Immatriculations connues : celles des chauffeurs + celles déjà utilisées (liste de suggestions). */
export function plaquesConnues(chauffeurs: ChauffeurFlotte[], livraisons: LivraisonFlotte[] = []): string[] {
  const s = new Set<string>();
  chauffeurs.forEach((c) => c.plaque && s.add(c.plaque.trim().toUpperCase()));
  livraisons.forEach((l) => l.chauffeurPlaque && s.add(l.chauffeurPlaque.trim().toUpperCase()));
  return Array.from(s).sort();
}

export function useAttribution(l: LivraisonFlotte, chauffeurs: ChauffeurFlotte[]) {
  const toast = useToast();
  const qc = useQueryClient();
  const [chauffeurId, setChauffeurId] = useState(l.chauffeurId || "");
  const [plaque, setPlaque] = useState(l.chauffeurPlaque || "");
  const [validee, setValidee] = useState(l.attributionValidee);

  const refresh = () => qc.invalidateQueries({ queryKey: ["flotte-livraisons"] });
  const m = useMutation({
    mutationFn: (input: { chauffeurId?: string; plaque?: string; valider?: boolean }) =>
      api.flotteLivraisons.assignChauffeur({ expId: l.id, ...input }),
    onSuccess: refresh,
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erreur d'attribution");
      refresh();
    },
  });

  // Resynchronise avec le serveur (autre onglet, glisser-déposer, rafraîchissement)…
  useEffect(() => {
    if (m.isPending) return;
    setChauffeurId(l.chauffeurId || "");
    setPlaque(l.chauffeurPlaque || "");
    setValidee(l.attributionValidee);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l.chauffeurId, l.chauffeurPlaque, l.attributionValidee]);

  function changeChauffeur(id: string) {
    setChauffeurId(id);
    setValidee(false);
    // Le chauffeur propose sa plaque habituelle ; l'utilisateur peut la changer ensuite
    const habituelle = chauffeurs.find((c) => c.id === id)?.plaque ?? "";
    setPlaque(id ? habituelle : "");
    m.mutate({ chauffeurId: id });
  }

  function changePlaque(p: string) {
    const v = p.trim().toUpperCase();
    setPlaque(v);
    if (v === (l.chauffeurPlaque || "")) return;
    setValidee(false);
    m.mutate({ plaque: v });
  }

  function basculer() {
    if (!validee) {
      if (!chauffeurId) return toast.error("Choisis d'abord un chauffeur.");
      if (!plaque.trim()) return toast.error("Indique le véhicule avant de valider.");
    }
    const v = !validee;
    setValidee(v);
    m.mutate({ valider: v });
  }

  return { chauffeurId, plaque, setPlaque, validee, changeChauffeur, changePlaque, basculer, pending: m.isPending };
}

export function SelectChauffeur({
  value, chauffeurs, disabled, aAttribuer, onChange, className,
}: {
  value: string; chauffeurs: ChauffeurFlotte[]; disabled?: boolean; aAttribuer?: boolean; onChange: (id: string) => void; className?: string;
}) {
  return (
    <div className="relative">
      <User className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
      <select
        aria-label="Chauffeur"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "input py-1 pl-7 pr-2 text-xs w-full",
          aAttribuer && !value && "border-amber-400 bg-amber-50 text-amber-800 font-semibold",
          disabled && "bg-slate-50",
          className,
        )}
      >
        <option value="">A ATTRIBUER</option>
        {chauffeurs.map((c) => (
          <option key={c.id} value={c.id}>{c.nom}</option>
        ))}
      </select>
    </div>
  );
}

export function ChampVehicule({
  value, plaques, disabled, onChange, onCommit, id, className,
}: {
  value: string; plaques: string[]; disabled?: boolean; onChange: (v: string) => void; onCommit: (v: string) => void; id: string; className?: string;
}) {
  const listId = `plaques-${id}`;
  return (
    <div className="relative">
      <Truck className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
      <input
        aria-label="Véhicule (immatriculation)"
        list={listId}
        value={value}
        disabled={disabled}
        placeholder="Véhicule"
        autoComplete="off"
        onChange={(e) => {
          const v = e.target.value.toUpperCase();
          onChange(v);
          if (plaques.includes(v)) onCommit(v); // choix dans la liste : enregistré tout de suite
        }}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className={cn("input py-1 pl-7 pr-2 text-xs w-full uppercase tracking-wide", disabled && "bg-slate-50", className)}
      />
      <datalist id={listId}>
        {plaques.map((p) => <option key={p} value={p} />)}
      </datalist>
    </div>
  );
}

/** Bouton « Valider » placé à droite de chaque ligne / carte. */
export function BoutonValider({
  validee, pending, onClick, compact,
}: { validee: boolean; pending?: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={validee ? "Attribution validée — cliquer pour déverrouiller" : "Valider l'attribution"}
      aria-pressed={validee}
      className={cn(
        "shrink-0 inline-flex items-center justify-center gap-1.5 rounded-md border font-semibold transition-all active:scale-95 disabled:opacity-50",
        compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
        validee
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-brand-900 bg-brand-900 text-white hover:bg-brand-800",
      )}
    >
      {validee ? <Lock className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
      {validee ? "Validé" : "Valider"}
    </button>
  );
}

/** Fenêtre d'attribution : chauffeur + véhicule (+ validation), utilisée par le kanban. */
export function ModalAttribution({
  l, chauffeurs, plaques, titre, onClose, onSubmit,
}: {
  l: LivraisonFlotte;
  chauffeurs: ChauffeurFlotte[];
  plaques: string[];
  titre?: string;
  onClose: () => void;
  onSubmit: (v: { chauffeurId: string; plaque: string; valider: boolean }) => void;
}) {
  const [chauffeurId, setChauffeurId] = useState(l.chauffeurId || "");
  const [plaque, setPlaque] = useState(l.chauffeurPlaque || "");
  const pret = useMemo(() => !!chauffeurId && !!plaque.trim(), [chauffeurId, plaque]);
  return (
    <Modal
      open
      onClose={onClose}
      title={titre ?? "Attribuer la livraison"}
      description={`${l.nomClient || "Client"} · ${l.numCmdNav || ""}`}
      size="md"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn-outline" disabled={!chauffeurId} onClick={() => onSubmit({ chauffeurId, plaque: plaque.trim().toUpperCase(), valider: false })}>
            Enregistrer
          </button>
          <button className="btn-primary" disabled={!pret} onClick={() => onSubmit({ chauffeurId, plaque: plaque.trim().toUpperCase(), valider: true })}>
            Enregistrer et valider
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Chauffeur</label>
          <SelectChauffeur
            value={chauffeurId}
            chauffeurs={chauffeurs}
            onChange={(id) => { setChauffeurId(id); setPlaque(chauffeurs.find((c) => c.id === id)?.plaque ?? ""); }}
            className="py-2 text-sm"
          />
        </div>
        <div>
          <label className="label">Véhicule</label>
          <ChampVehicule id={`modal-${l.id}`} value={plaque} plaques={plaques} onChange={setPlaque} onCommit={setPlaque} className="py-2 text-sm" />
          <p className="mt-1 text-xs text-slate-500">Pré-rempli avec la plaque habituelle du chauffeur — tu peux la changer.</p>
        </div>
      </div>
    </Modal>
  );
}
