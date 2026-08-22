import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

/**
 * Modal accessible : ferme avec Escape ou clic sur l'overlay,
 * focus initial sur la carte (au premier render uniquement, pas à chaque keystroke),
 * scroll bloqué sur le body.
 */
export function Modal({ open, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  // Ref pour onClose pour ne pas recréer l'effet à chaque render (sinon le focus est volé à chaque keystroke)
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Setup à l'ouverture uniquement (dépend seulement de `open`)
  useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement as HTMLElement | null;
    // Focus initial sur la carte — un seul appel, ne se réexécute pas à chaque render
    cardRef.current?.focus();
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previousActive?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div
        ref={cardRef}
        tabIndex={-1}
        className={cn(
          "relative w-full bg-white shadow-2xl rounded-t-2xl sm:rounded-2xl outline-none animate-pop",
          "max-h-[92vh] flex flex-col",
          size === "sm" && "sm:max-w-md",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-2xl",
        )}
      >
        <div className="flex items-start justify-between px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100">
          <div className="flex-1 min-w-0 pr-3">
            <h2 id="modal-title" className="text-base sm:text-lg font-semibold text-slate-900">{title}</h2>
            {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mt-1 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
