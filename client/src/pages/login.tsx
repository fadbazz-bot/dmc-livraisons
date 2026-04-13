import { useState } from "react";
import { useAuth, DEMO_USERS } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!selected) return;
    const ok = await login(selected);
    if (!ok) setError("Compte introuvable. Vérifiez votre sélection.");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <svg viewBox="0 0 48 48" fill="none" className="w-16 h-16" aria-label="DMC">
            <rect width="48" height="48" rx="10" fill="hsl(215,72%,28%)" />
            <path d="M9 14h12a9 9 0 0 1 0 18H9V14z" fill="white" opacity="0.9"/>
            <rect x="25" y="21" width="14" height="11" rx="2" fill="white" opacity="0.7"/>
            <circle cx="15" cy="36.5" r="3.5" fill="hsl(28,90%,52%)"/>
            <circle cx="33" cy="36.5" r="3.5" fill="hsl(28,90%,52%)"/>
          </svg>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-foreground">DMC Livraisons</h1>
            <p className="text-sm text-muted-foreground mt-1">Gestion des expéditions — Accès intranet</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <p className="text-sm text-center text-muted-foreground">
              Connectez-vous avec votre compte Google Workspace DMC
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Compte</label>
              <Select onValueChange={setSelected} value={selected}>
                <SelectTrigger data-testid="select-compte">
                  <SelectValue placeholder="Sélectionnez votre compte…" />
                </SelectTrigger>
                <SelectContent>
                  {DEMO_USERS.map((u) => (
                    <SelectItem key={u.email} value={u.email} data-testid={`option-${u.email}`}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Mode démo — sélectionnez un profil pour simuler la connexion Google</p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              className="w-full"
              onClick={handleLogin}
              disabled={!selected || isLoading}
              data-testid="button-login"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Se connecter
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">DMC Sénégal · Plateforme interne</p>
      </div>
    </div>
  );
}
