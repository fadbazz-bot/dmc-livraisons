import { useState } from "react";
import { Camera, Image as ImageIcon, X } from "lucide-react";
import { compressImage } from "@/lib/imageCompress";
import { useToast } from "@/components/Toast";

interface Props {
  /** Libellé affiché au-dessus */
  label: string;
  /** Description sous le libellé */
  hint?: string;
  /** Data URL actuelle (contrôlée par le parent) */
  value: string | null;
  /** Appelé avec la data URL JPEG compressée, ou null si suppression */
  onChange: (dataUrl: string | null) => void;
  /** Indique si le champ est obligatoire (étoile rouge) */
  required?: boolean;
  /** Taille max d'un côté en pixels après compression. 800 par défaut. */
  maxDimension?: number;
  /** Qualité JPEG (0-1). 0.7 par défaut. */
  quality?: number;
}

/**
 * Champ de capture photo avec compression automatique et aperçu.
 * Utilise la caméra native du téléphone via `capture="environment"`.
 */
export function PhotoCapture({
  label,
  hint,
  value,
  onChange,
  required = false,
  maxDimension = 800,
  quality = 0.7,
}: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const inputId = `photo-${label.replace(/\W+/g, "-").toLowerCase()}`;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const compressed = await compressImage(file, { maxDimension, quality });
      onChange(compressed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Compression photo échouée");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div>
      <label className="label" htmlFor={inputId}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {value ? (
        <div className="relative">
          <img
            src={value}
            alt={label}
            className="w-full h-40 object-cover rounded-lg border border-slate-200 bg-slate-50"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-white/95 text-xs font-medium text-slate-700 shadow-sm hover:bg-white inline-flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Reprendre
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="flex flex-col items-center justify-center gap-1.5 h-24 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-colors"
        >
          {busy ? (
            <>
              <div className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-brand-900 animate-spin" />
              <span className="text-xs text-slate-600">Compression…</span>
            </>
          ) : (
            <>
              <Camera className="h-5 w-5 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">Prendre / choisir</span>
              {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
            </>
          )}
          <input
            id={inputId}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            className="sr-only"
          />
        </label>
      )}
      {value && (
        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
          <ImageIcon className="h-3 w-3" />
          Compressée pour stockage.
        </p>
      )}
    </div>
  );
}
