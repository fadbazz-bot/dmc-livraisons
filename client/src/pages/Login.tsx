import { useEffect, useRef, useState } from "react";
import { Truck, KeyRound, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

type Tab = "google" | "pin";

const SITES = ["Dakar", "Diamniadio"] as const;
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function LoginPage() {
  const { loginWithGoogle, loginWithPin, loading, error } = useAuth();
  const [tab, setTab] = useState<Tab>("google");
  const [pinSite, setPinSite] = useState<string>("Dakar");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Initialisation Google Identity Services
  useEffect(() => {
    if (tab !== "google") return;
    if (!CLIENT_ID || CLIENT_ID.includes("REMPLACER_PAR")) return;

    let cancelled = false;
    const tryInit = () => {
      if (cancelled) return;
      if (!window.google?.accounts?.id) {
        // Script GIS pas encore chargé — retry dans 200ms
        setTimeout(tryInit, 200);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async (response) => {
          try {
            await loginWithGoogle(response.credential);
          } catch {
            /* error géré par useAuth */
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      if (googleBtnRef.current) {
        googleBtnRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: "standard",
          theme: "filled_blue",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: 320,
        });
      }
    };
    tryInit();
    return () => {
      cancelled = true;
    };
  }, [tab, loginWithGoogle]);

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPinError(null);
    if (!pinSite || !pin) {
      setPinError("Site et code PIN requis.");
      return;
    }
    try {
      await loginWithPin(pinSite, pin);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950">
      <div className="w-full max-w-md">
        <div className="card p-8 animate-pop">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-7">
            <div className="h-12 w-12 rounded-xl bg-brand-900 flex items-center justify-center">
              <Truck className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-brand-900">DMC Livraisons</h1>
              <p className="text-xs text-slate-500">Plateforme de suivi des expéditions</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-6">
            <button
              onClick={() => setTab("google")}
              className={cn(
                "py-2 text-sm font-medium rounded-md transition-colors",
                tab === "google" ? "bg-white text-brand-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              Compte Google
            </button>
            <button
              onClick={() => setTab("pin")}
              className={cn(
                "py-2 text-sm font-medium rounded-md transition-colors",
                tab === "pin" ? "bg-white text-brand-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              Poste PIN
            </button>
          </div>

          {tab === "google" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Connecte-toi avec ton compte <span className="font-semibold text-brand-900">@dmcsen.com</span>.
              </p>
              {(!CLIENT_ID || CLIENT_ID.includes("REMPLACER_PAR")) ? (
                <div className="flex gap-2 items-start p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800">
                    <strong>Configuration requise :</strong> renseigne <code className="px-1 bg-amber-100 rounded">VITE_GOOGLE_CLIENT_ID</code> dans <code className="px-1 bg-amber-100 rounded">.env.local</code> (voir <code>.env.example</code>).
                  </div>
                </div>
              ) : (
                <div ref={googleBtnRef} className="flex justify-center min-h-[44px]" />
              )}
              {error && (
                <div className="flex gap-2 items-start p-3 rounded-lg bg-red-50 border border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {tab === "pin" && (
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <p className="text-sm text-slate-600">
                Code à 4 chiffres distribué par l'administrateur DMC.
              </p>

              <div>
                <label className="label">Site</label>
                <div className="grid grid-cols-2 gap-2">
                  {SITES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPinSite(s)}
                      className={cn(
                        "py-3 rounded-lg border text-sm font-medium transition-all",
                        pinSite === s
                          ? "border-brand-900 bg-brand-50 text-brand-900 ring-2 ring-brand-200"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="pin" className="label">Code PIN</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••"
                    className="input pl-9 tracking-[0.4em] text-center text-lg"
                  />
                </div>
              </div>

              {pinError && (
                <div className="flex gap-2 items-start p-3 rounded-lg bg-red-50 border border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{pinError}</p>
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Connexion…" : "Entrer"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-brand-200 mt-6">
          © {new Date().getFullYear()} DMC Sénégal — Plateforme de gestion des expéditions
        </p>
      </div>
    </div>
  );
}
