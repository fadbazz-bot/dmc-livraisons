import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Footprints, Car, Truck } from "lucide-react";
import { api } from "@/api/appsScript";
import type { Expedition } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { ExpInfoBlock } from "@/components/modals/ExpInfoBlock";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

interface Props {
  exp: Expedition;
  open: boolean;
  onClose: () => void;
}

type ModeArrivee = "pieton" | "vehicule";

export function EntreeShowroomModal({ exp, open, onClose }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<ModeArrivee>("pieton");
  const [plaque, setPlaque] = useState("");

  const m = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Session expirée");
      return api.jalons.entreeShowroom(exp.id, {
        acteurEmail: user.email,
        acteurNom: user.nom,
        modeArrivee: mode,
        plaque: mode === "vehicule" ? plaque.trim().toUpperCase() : undefined,
      });
    },
    onSuccess: () => {
      toast.success("Client autorisé à entrer");
      qc.invalidateQueries({ queryKey: ["expeditions"] });
      reset();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur inconnue"),
  });

  function reset() {
    setMode("pieton");
    setPlaque("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === "vehicule" && !plaque.trim()) {
      toast.error("Immatriculation obligatoire pour une entrée en véhicule.");
      return;
    }
    m.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="🚪 Entrée showroom"
      description="Autorise le client à entrer dans le showroom."
      size="md"
      footer={
        <>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={m.isPending}
          >
            Annuler
          </button>
          <button
            type="submit"
            form="form-entree-showroom"
            className="btn-primary"
            disabled={m.isPending}
          >
            {m.isPending ? "Enregistrement…" : "Autoriser l'entrée"}
          </button>
        </>
      }
    >
      <form id="form-entree-showroom" onSubmit={onSubmit} className="space-y-4">
        <ExpInfoBlock exp={exp} />

        <div>
          <label className="label">Le client se présente…</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("pieton")}
              className={cn(
                "flex flex-col items-center gap-1.5 py-4 rounded-lg border text-sm font-medium transition-all",
                mode === "pieton"
                  ? "border-brand-900 bg-brand-50 text-brand-900 ring-2 ring-brand-200"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
              )}
            >
              <Footprints className="h-5 w-5" />
              À pied
            </button>
            <button
              type="button"
              onClick={() => setMode("vehicule")}
              className={cn(
                "flex flex-col items-center gap-1.5 py-4 rounded-lg border text-sm font-medium transition-all",
                mode === "vehicule"
                  ? "border-brand-900 bg-brand-50 text-brand-900 ring-2 ring-brand-200"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
              )}
            >
              <Car className="h-5 w-5" />
              En véhicule
            </button>
          </div>
        </div>

        {mode === "vehicule" && (
          <div className="animate-in">
            <label htmlFor="plaque-showroom" className="label">
              Immatriculation <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Truck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="plaque-showroom"
                type="text"
                value={plaque}
                onChange={(e) => setPlaque(e.target.value.toUpperCase())}
                placeholder="DK 1234 AA"
                autoFocus
                autoComplete="off"
                className="input pl-9 uppercase tracking-wider"
              />
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
