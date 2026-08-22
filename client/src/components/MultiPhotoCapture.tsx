import { useState } from "react";
import { Camera, Plus, X, Image as ImageIcon } from "lucide-react";
import { compressImage } from "@/lib/imageCompress";
import { useToast } from "@/components/Toast";

interface Props {
  /** Libellé affiché au-dessus du composant */
  label: string;
  /** Hint optionnel */
  hint?: string;
  /** Tableau de data URLs des photos déjà prises */
  values: string[];
  /** Appelé avec le tableau complet à chaque changement */
  onChange: (urls: string[]) => void;
  /** Indique si au moins une photo est obligatoire */
  required?: boolean;
  /** Nombre max de photos. 6 par défaut. */
  maxPhotos?: number;
  /** Taille max d'un côté après compression. 1024 par défaut. */
  maxDimension?: number;
  /** Qualité JPEG. 0.75 par défaut. */
  quality?: number;
}

/**
 * Capture multi-photos avec compression + miniatures + ajout / suppression.
 * Utilisé notamment pour la sortie site (plusieurs angles du véhicule chargé).
 */
export function MultiPhotoCapture({
  label,
  hint,
  values,
  onChange,
  required = false,
  maxPhotos = 6,
  maxDimension = 1024,
  quality = 0.75,
}: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const inputId = `multiphoto-${label.replace(/\W+/g, "-").toLowerCase()}`;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (values.length >= maxPhotos) {
      toast.error(`Maximum ${maxPhotos} photos.`);
      e.target.value = "";
      return;
    }
    setBusy(true);
    try {
      const compressed = await compressImage(file, { maxDimension, quality });
      onChange([...values, compressed]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Compression photo échouée");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  function removeAt(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  const canAddMore = values.length < maxPhotos;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="label !mb-0" htmlFor={inputId}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <span className="text-xs text-slate-500">
          {values.length} / {maxPhotos}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {values.map((url, i) => (
          <div key={i} className="relative aspect-square">
            <img
              src={url}
              alt={`Photo ${i + 1}`}
              className="w-full h-full object-cover rounded-lg border border-slate-200"
            />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute top-1 right-1 p-1 rounded-full bg-white/90 text-slate-700 hover:text-red-600 shadow-sm"
              aria-label="Supprimer cette photo"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {canAddMore && (
          <label
            htmlFor={inputId}
            className="aspect-square flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-colors"
          >
            {busy ? (
              <div className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-brand-900 animate-spin" />
            ) : values.length === 0 ? (
              <>
                <Camera className="h-5 w-5 text-slate-400" />
                <span className="text-[11px] font-medium text-slate-700">Photo</span>
              </>
            ) : (
              <>
                <Plus className="h-5 w-5 text-slate-400" />
                <span className="text-[11px] font-medium text-slate-700">Ajouter</span>
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
      </div>

      {hint && (
        <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1.5">
          <ImageIcon className="h-3 w-3" />
          {hint}
        </p>
      )}
    </div>
  );
}
