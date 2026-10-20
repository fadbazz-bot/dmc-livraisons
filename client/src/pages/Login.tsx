import { useEffect, useRef, useState } from "react";
import { Truck, KeyRound, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

type Tab = "google" | "pin";

const SITES = ["Dakar", "Diamniadio"] as const;
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const ETAPES = [
  { titre: "Instruction", detail: "Le commercial crée la demande et reçoit le code de retrait." },
  { titre: "Entrée sur le site", detail: "Le poste de garde contrôle le véhicule et le chauffeur." },
  { titre: "Chargement", detail: "Le responsable valide le code du client et lance la préparation." },
  { titre: "Sortie", detail: "Le poste de garde valide le départ avec les photos du chargement." },
];

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
    <div className="min-h-[100dvh] bg-canvas lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Panneau de présentation (grands écrans) : le parcours réel d'une expédition */}
      <aside className="hidden lg:flex flex-col justify-between bg-brand-900 px-12 py-14 text-brand-100">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-ctl bg-white/10 flex items-center justify-center">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold text-white">DMC Livraisons</div>
            <div className="text-sm text-brand-300">DMC Sénégal</div>
          </div>
        </div>

        <div>
          <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight text-white">
            De la demande à la sortie du site, chaque étape est tracée.
          </h2>
          <ol className="mt-10 space-y-6">
            {ETAPES.map((e, i) => (
              <li key={e.titre} className="flex gap-4">
                <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand-400/60 text-xs text-brand-200">
                  {i + 1}
                </span>
                <div>
                  <div className="font-medium text-white">{e.titre}</div>
                  <div className="text-sm text-brand-300">{e.detail}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <p className="text-sm text-brand-300">© {new Date().getFullYear()} DMC Sénégal</p>
      </aside>

      {/* Formulaire */}
      <main className="flex min-h-[100dvh] items-center justify-center px-4 py-10 lg:min-h-0">
        <div className="w-full max-w-sm animate-in">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="h-10 w-10 rounded-ctl bg-brand-800 flex items-center justify-center">
              <Truck className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight">
              <div className="text-base font-semibold text-slate-900">DMC Livraisons</div>
              <div className="text-sm text-slate-500">Suivi des expéditions</div>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Connexion</h1>
          <p className="mt-1 text-sm text-slate-500">Choisis comment tu te connectes.</p>

          <div className="mt-6 grid grid-cols-2 gap-1 rounded-ctl bg-slate-100 p-1" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "google"}
              onClick={() => setTab("google")}
              className={cn(
                "rounded-[6px] py-2 text-sm font-medium transition-colors",
                tab === "google" ? "bg-white text-slate-900 shadow-card" : "text-slate-500 hover:text-slate-800",
              )}
            >
              Compte Google
            </button>
            <button
              role="tab"
              aria-selected={tab === "pin"}
              onClick={() => setTab("pin")}
              className={cn(
                "rounded-[6px] py-2 text-sm font-medium transition-colors",
                tab === "pin" ? "bg-white text-slate-900 shadow-card" : "text-slate-500 hover:text-slate-800",
              )}
            >
              Poste avec code PIN
            </button>
          </div>

          {tab === "google" && (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-slate-600">
                Utilise ton compte professionnel <span className="font-medium text-slate-900">@dmcsen.com</span>.
              </p>
              {!CLIENT_ID || CLIENT_ID.includes("REMPLACER_PAR") ? (
                <div className="flex items-start gap-2 rounded-ctl border border-amber-200 bg-amber-50 p-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="text-xs text-amber-800">
                    <strong>Configuration requise :</strong> renseigne <code className="rounded bg-amber-100 px-1">VITE_GOOGLE_CLIENT_ID</code> dans <code className="rounded bg-amber-100 px-1">.env.local</code> puis reconstruis le site.
                  </div>
                </div>
              ) : (
                <div ref={googleBtnRef} className="flex min-h-[44px] justify-center" />
              )}
              {error && (
                <div className="flex items-start gap-2 rounded-ctl border border-red-200 bg-red-50 p-3" role="alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {tab === "pin" && (
            <form onSubmit={handlePinSubmit} className="mt-6 space-y-5">
              <p className="text-sm text-slate-600">
                Pour le poste de garde et les agents showroom. Le code à 4 chiffres est remis par l'administrateur.
              </p>

              <div>
                <label className="label">Site</label>
                <div className="grid grid-cols-2 gap-2">
                  {SITES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPinSite(s)}
                      aria-pressed={pinSite === s}
                      className={cn(
                        "rounded-ctl border py-3 text-sm font-medium transition-colors",
                        pinSite === s
                          ? "border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
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
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                    className="input py-3 pl-9 text-center font-mono text-xl tracking-[0.5em]"
                  />
                </div>
              </div>

              {pinError && (
                <div className="flex items-start gap-2 rounded-ctl border border-red-200 bg-red-50 p-3" role="alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-sm text-red-700">{pinError}</p>
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                {loading ? "Connexion…" : "Se connecter"}
              </button>
            </form>
          )}

          <p className="mt-10 text-center text-xs text-slate-400 lg:hidden">
            © {new Date().getFullYear()} DMC Sénégal
          </p>
        </div>
      </main>
    </div>
  );
}
