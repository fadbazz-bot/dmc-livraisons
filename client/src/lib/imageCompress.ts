/**
 * Compresse une photo (File) en JPEG base64 prêt pour stockage dans Google Sheets.
 *
 * Pourquoi : la photo de chargement est stockée dans la colonne PhotoChargement
 * de la feuille EXPEDITIONS. Une cellule Sheets accepte ~50 000 caractères.
 * Une photo brute fait facilement 2-5 Mo (3-7 millions de chars en base64),
 * donc on doit la compresser avant envoi.
 *
 * Stratégie :
 *   - Redimensionner à max 1024 px (côté le plus long)
 *   - Encoder en JPEG qualité 0.75
 *   - Résultat typique : 50-200 KB → base64 ~70-280 KB (tient dans la cellule)
 */

interface CompressOptions {
  maxDimension?: number;
  quality?: number;
  mimeType?: "image/jpeg" | "image/webp";
}

export async function compressImage(file: File, options: CompressOptions = {}): Promise<string> {
  const maxDimension = options.maxDimension ?? 1024;
  const quality = options.quality ?? 0.75;
  const mimeType = options.mimeType ?? "image/jpeg";

  if (!file.type.startsWith("image/")) {
    throw new Error("Le fichier sélectionné n'est pas une image.");
  }

  const dataUrl = await fileToDataUrl(file);
  const img = await dataUrlToImage(dataUrl);

  const { width, height } = scaleToFit(img.naturalWidth, img.naturalHeight, maxDimension);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossible de créer le contexte 2D");

  // Fond blanc (au cas où PNG transparent → JPEG noir)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const out = canvas.toDataURL(mimeType, quality);
  // Sanity check — refuse si toujours > 200 KB après compression
  const approxSize = Math.ceil((out.length * 3) / 4);
  if (approxSize > 250_000) {
    // Re-compress plus dur
    const out2 = canvas.toDataURL(mimeType, 0.55);
    return out2;
  }
  return out;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Lecture du fichier échouée"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Décodage image impossible"));
    img.onload = () => resolve(img);
    img.src = dataUrl;
  });
}

function scaleToFit(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  if (w >= h) {
    return { width: max, height: Math.round((h * max) / w) };
  }
  return { width: Math.round((w * max) / h), height: max };
}
