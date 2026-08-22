import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  show: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const TOAST_DURATION_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (type: ToastType, message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => remove(id), TOAST_DURATION_MS);
    },
    [remove],
  );

  const value: ToastContextValue = {
    show,
    success: (m) => show("success", m),
    error: (m) => show("error", m),
    info: (m) => show("info", m),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onClose={remove} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé dans un ToastProvider");
  return ctx;
}

// ─── UI ──────────────────────────────────────────────────────────────────────

function ToastContainer({ toasts, onClose }: { toasts: ToastItem[]; onClose: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onClose={() => onClose(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const [hovering, setHovering] = useState(false);

  // Pas de timer dépendant ici car le parent gère déjà l'auto-dismiss.
  // On garde juste le hover pour empêcher le clic accidentel.
  useEffect(() => {}, [hovering]);

  const Icon =
    toast.type === "success" ? CheckCircle2 : toast.type === "error" ? AlertCircle : Info;
  const bg =
    toast.type === "success"
      ? "bg-white border-emerald-300"
      : toast.type === "error"
      ? "bg-white border-red-300"
      : "bg-white border-blue-300";
  const iconColor =
    toast.type === "success"
      ? "text-emerald-600"
      : toast.type === "error"
      ? "text-red-600"
      : "text-blue-600";

  return (
    <div
      role="status"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border shadow-lg p-3 pr-2 animate-in",
        bg,
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", iconColor)} />
      <p className="text-sm text-slate-900 flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={onClose}
        className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
