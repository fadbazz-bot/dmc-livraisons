import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Printer, FileDown, AlertCircle } from "lucide-react";
import { api } from "@/api/appsScript";
import type { Expedition } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { BonLivraison } from "@/components/BonLivraison";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";

interface Props {
  exp: Expedition;
  open: boolean;
  onClose: () => void;
}

/**
 * Modal qui charge les données nécessaires au bon (code + photos) puis :
 *  - Affiche un aperçu A4 mis à l'échelle
 *  - Bouton Imprimer (fenêtre print du navigateur — propose aussi "Enregistrer en PDF")
 *  - Bouton Télécharger PDF (html2pdf.js → vrai PDF)
 *
 * Stratégie d'impression / PDF :
 * On rend DEUX versions du bon : une visible mise à l'échelle pour l'aperçu,
 * et une cachée off-screen à taille A4 réelle qu'on cible pour la capture.
 * Sans ça, le scale du wrapper se propageait au html2canvas → PDF cassé.
 */
export function BonLivraisonModal({ exp, open, onClose }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const captureRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  // Charger le code + les photos en parallèle
  const codeQ = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Session expirée");
      return api.expeditions.getCodeRetrait(exp.id, user.email);
    },
  });

  const mediasQ = useMutation({
    mutationFn: () => api.medias.list(exp.id),
  });

  useEffect(() => {
    if (open) {
      codeQ.reset();
      mediasQ.reset();
      codeQ.mutate();
      mediasQ.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isLoading = codeQ.isPending || mediasQ.isPending;
  const error = (codeQ.error || mediasQ.error) as Error | null;
  const code = codeQ.data?.codeRetrait || "";
  const photoPermis = mediasQ.data?.find((m) => m.type === "permis")?.dataUrl ?? null;
  const photoPlaque = mediasQ.data?.find((m) => m.type === "plaque")?.dataUrl ?? null;
  const ready = !isLoading && !error && !!code;

  function handlePrint() {
    if (!captureRef.current) {
      toast.error("Le bon n'est pas encore prêt.");
      return;
    }
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) {
      toast.error("Impossible d'ouvrir la fenêtre d'impression (popup bloquée ?).");
      return;
    }
    const styles = Array.from(document.styleSheets)
      .map((sheet) => {
        try {
          return Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
        } catch {
          return "";
        }
      })
      .join("\n");
    w.document.write(`<!doctype html><html><head><title>Bon de livraison ${exp.numCmdNav || exp.id}</title>
      <style>${styles}
      @page { size: A4; margin: 0; }
      html, body { margin: 0; padding: 0; background: white; }
      </style></head><body>${captureRef.current.outerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  }

  async function handleDownloadPdf() {
    if (!captureRef.current) {
      toast.error("Le bon n'est pas encore prêt.");
      return;
    }
    setDownloading(true);
    try {
      const mod = await import("html2pdf.js");
      const html2pdf = mod.default;
      const filename = `bon-livraison-${exp.numCmdNav || exp.id}.pdf`;
      await html2pdf()
        .set({
          margin: 0,
          filename,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
            backgroundColor: "#ffffff",
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(captureRef.current)
        .save();
      toast.success("PDF téléchargé");
    } catch (e) {
      // Surface l'erreur réelle pour debug
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[BonLivraison PDF] erreur génération :", e);
      toast.error("Génération PDF échouée : " + msg);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="🧾 Bon de livraison"
        description="Document à imprimer et remettre au chauffeur."
        size="lg"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={onClose}>
              Fermer
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!ready || downloading}
              className="btn-outline gap-2"
            >
              <FileDown className="h-4 w-4" />
              {downloading ? "Génération…" : "Télécharger PDF"}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!ready}
              className="btn-primary gap-2"
            >
              <Printer className="h-4 w-4" />
              Imprimer
            </button>
          </>
        }
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <div className="h-6 w-6 rounded-full border-2 border-slate-300 border-t-brand-900 animate-spin" />
            <p className="text-sm text-slate-500">Préparation du bon (code + photos)…</p>
          </div>
        ) : error ? (
          <div className="flex gap-2 items-start p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error.message}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-100 p-3 max-h-[65vh] overflow-auto">
            {/* Aperçu mis à l'échelle pour la modal */}
            <div style={{ transform: "scale(0.62)", transformOrigin: "top center" }}>
              <BonLivraison
                exp={exp}
                codeRetrait={code}
                photoPermisUrl={photoPermis}
                photoPlaqueUrl={photoPlaque}
                commercialNom={user?.nom || ""}
              />
            </div>
            <p className="text-xs text-slate-500 text-center mt-2">
              Aperçu réduit — l'impression et le PDF sont au format A4 complet.
            </p>
          </div>
        )}
      </Modal>

      {/* Version off-screen à taille A4 réelle — c'est elle qu'on capture pour print/PDF */}
      {ready && (
        <div
          style={{
            position: "fixed",
            left: "-9999px",
            top: 0,
            zIndex: -1,
            pointerEvents: "none",
            opacity: 0,
          }}
          aria-hidden="true"
        >
          <BonLivraison
            ref={captureRef}
            exp={exp}
            codeRetrait={code}
            photoPermisUrl={photoPermis}
            photoPlaqueUrl={photoPlaque}
            commercialNom={user?.nom || ""}
          />
        </div>
      )}
    </>
  );
}
