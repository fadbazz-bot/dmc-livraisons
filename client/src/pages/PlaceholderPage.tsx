import { Construction } from "lucide-react";

/**
 * Page placeholder utilisée pour les sections pas encore implémentées.
 * Sera remplacée par les vraies pages au fil des Sessions 2-5 du plan.
 */
export function PlaceholderPage({ title, description }: { title: string; description?: string }) {
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="card p-10 text-center max-w-md">
        <div className="h-12 w-12 rounded-xl bg-slate-100 mx-auto mb-4 flex items-center justify-center">
          <Construction className="h-6 w-6 text-slate-500" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">{title}</h2>
        <p className="text-sm text-slate-500">
          {description ?? "Cette page sera disponible dans une prochaine itération de la refonte."}
        </p>
      </div>
    </div>
  );
}

export default PlaceholderPage;
