import { forwardRef } from "react";
import type { Expedition } from "@/types/domain";
import { formatDateTime } from "@/lib/format";

interface BonLivraisonProps {
  exp: Expedition;
  /** Code de retrait (à demander via API, sécurisé) */
  codeRetrait: string;
  /** Data URL de la photo permis chauffeur (récupérée via API medias) */
  photoPermisUrl: string | null;
  /** Optionnel — photo de plaque pour archives */
  photoPlaqueUrl?: string | null;
  /** Nom du commercial (pour signature) */
  commercialNom: string;
}

/**
 * Bon de livraison de transit — rendu A4 imprimable.
 * Conçu pour être imprimé en couleur ou noir et blanc.
 *
 * Styles inline + classes Tailwind compatibles print : @media print masque le reste.
 */
export const BonLivraison = forwardRef<HTMLDivElement, BonLivraisonProps>(function BonLivraison(
  { exp, codeRetrait, photoPermisUrl, photoPlaqueUrl, commercialNom },
  ref,
) {
  const dateEmission = formatDateTime(new Date().toISOString());

  return (
    <div
      ref={ref}
      id="bon-livraison-doc"
      className="bg-white text-slate-900"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "12mm",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: "11pt",
        lineHeight: "1.4",
        boxSizing: "border-box",
      }}
    >
      {/* En-tête */}
      <div className="flex items-start justify-between pb-4 border-b-2 border-brand-900">
        <div>
          <div className="text-xl font-bold text-brand-900">DMC SÉNÉGAL</div>
          <div className="text-sm text-slate-600">Plateforme Livraisons · Bon de transit</div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Émis le</div>
          <div className="font-semibold text-slate-700">{dateEmission}</div>
        </div>
      </div>

      {/* Bloc Commande */}
      <Section title="Commande">
        <Row label="N° Commande NAV" value={exp.numCmdNav || "—"} mono />
        <Row label="Client"           value={exp.nomClient || "—"} bold />
        <Row label="Commercial"       value={commercialNom} />
      </Section>

      {/* Bloc Expédition */}
      <Section title="Expédition">
        <Row label="N° Expédition" value={exp.numExpedition} mono />
        <Row label="Magasin"       value={exp.magasinLabel || exp.zone} bold />
      </Section>

      {/* Bloc Chauffeur */}
      <Section title="Chauffeur">
        <Row label="Nom"        value={exp.chauffeur || "—"} bold />
        <Row label="Plaque"     value={exp.plaque || "—"} mono />
        <Row label="Téléphone"  value={exp.numeroChauffeur || "—"} mono />
        <Row label="Entrée site" value={formatDateTime(exp.tEntreeSite)} />
      </Section>

      {/* Photos */}
      <div className="grid grid-cols-2 gap-4 my-4">
        <PhotoSlot title="Pièce d'identité / Permis" url={photoPermisUrl} />
        <PhotoSlot title="Plaque du véhicule" url={photoPlaqueUrl ?? null} />
      </div>

      {/* Code de livraison — bloc très visible */}
      <div className="mt-5 mb-5 border-4 border-brand-900 rounded-lg p-4 bg-brand-50">
        <div className="text-xs font-bold uppercase tracking-widest text-brand-900 mb-1">
          Code de livraison
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="font-mono font-bold text-4xl tracking-[0.5em] text-brand-900">
            {codeRetrait || "— — — —"}
          </div>
          <div className="text-xs text-slate-700 max-w-[200px]">
            À remettre au responsable du magasin pour enclencher le chargement.
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        <SignatureBox label="Signature du commercial" sub={commercialNom} />
        <SignatureBox label="Signature du chauffeur" sub={exp.chauffeur || ""} />
      </div>

      {/* Pied de page */}
      <div className="mt-8 pt-3 border-t border-slate-300 text-[9pt] text-slate-500 flex justify-between">
        <span>DMC Sénégal · Plateforme Livraisons · {new Date().getFullYear()}</span>
        <span className="font-mono">{exp.id}</span>
      </div>
    </div>
  );
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="text-xs font-bold uppercase tracking-widest text-brand-900 mb-1.5">
        {title}
      </div>
      <div className="border border-slate-300 rounded-md divide-y divide-slate-200">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 px-3 py-1.5 text-sm">
      <div className="col-span-1 text-slate-500">{label}</div>
      <div
        className={
          "col-span-2 text-slate-900" +
          (mono ? " font-mono" : "") +
          (bold ? " font-semibold" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}

function PhotoSlot({ title, url }: { title: string; url: string | null }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-widest text-brand-900 mb-1.5">
        {title}
      </div>
      {url ? (
        <img
          src={url}
          alt={title}
          className="w-full h-40 object-cover rounded-md border border-slate-300"
        />
      ) : (
        <div className="w-full h-40 flex items-center justify-center text-xs text-slate-400 italic rounded-md border border-dashed border-slate-300 bg-slate-50">
          Photo non capturée
        </div>
      )}
    </div>
  );
}

function SignatureBox({ label, sub }: { label: string; sub: string }) {
  return (
    <div>
      <div className="h-20 border border-slate-300 rounded-md bg-slate-50"></div>
      <div className="mt-1 text-xs text-slate-600 text-center">
        <div className="font-medium">{label}</div>
        {sub && <div className="text-slate-400">{sub}</div>}
      </div>
    </div>
  );
}
