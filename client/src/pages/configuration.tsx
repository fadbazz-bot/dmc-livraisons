import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Settings, MessageSquare, Mail, Sheet, CheckCircle2, XCircle,
  ExternalLink, Copy, AlertTriangle, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

function StatusIndicator({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={cn(
      "flex items-center gap-2 text-sm font-medium",
      ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
    )}>
      {ok
        ? <CheckCircle2 className="h-4 w-4" />
        : <XCircle className="h-4 w-4 text-muted-foreground" />
      }
      {label}
    </div>
  );
}

function copyToClipboard(text: string, toast: any) {
  navigator.clipboard.writeText(text).then(() => {
    toast({ title: "Copié", description: "URL copiée dans le presse-papier." });
  });
}

export default function ConfigurationPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "error" | null>(null);

  // Seul l'admin accède à cette page
  if (user?.role !== "admin") {
    navigate("/file-commandes");
    return null;
  }

  const WEBHOOK_URL = "https://chat.googleapis.com/v1/spaces/AAQAXESvaoE/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=jl7L1GzEQDx7K-Pv9yXEYQTelyDIwFR4rrehMIaJnqk";
  const APPS_SCRIPT_INSTALL_URL = "https://script.google.com/";

  const testWebhook = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-webhook", { method: "POST" });
      if (res.ok) {
        setTestResult("ok");
        toast({ title: "Test réussi", description: "Message envoyé dans Google Chat." });
      } else {
        setTestResult("error");
        toast({ title: "Erreur", description: "Impossible de joindre le webhook.", variant: "destructive" });
      }
    } catch {
      setTestResult("error");
      toast({ title: "Erreur réseau", description: "Vérifiez la connexion.", variant: "destructive" });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Configuration — Intégrations</h1>
          <p className="text-sm text-muted-foreground">Google Chat · Email (Apps Script) · Google Sheets</p>
        </div>
      </div>

      {/* Statut global */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Statut des intégrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusIndicator ok={true} label="Google Chat Webhook — Configuré" />
          <StatusIndicator ok={false} label="Apps Script (Email + Sheets) — En attente de configuration" />
        </CardContent>
      </Card>

      {/* Google Chat */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-sm">Google Chat</CardTitle>
            <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-600">Actif</Badge>
          </div>
          <CardDescription className="text-xs">
            Notifications automatiques à chaque jalon (T0, T2, T4) et alertes retard toutes les 5 min.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">URL Webhook</label>
            <div className="flex items-center gap-2">
              <Input
                value={WEBHOOK_URL.slice(0, 60) + "…"}
                readOnly
                className="text-xs font-mono bg-muted"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(WEBHOOK_URL, toast)}
                data-testid="button-copy-webhook"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground space-y-1">
            <p><strong>Événements déclencheurs :</strong></p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li>T0 — Nouvelle commande (carte riche avec détails)</li>
              <li>T2 — Commande prête, en attente de sortie</li>
              <li>T4 — Sortie validée (bilan durée + objectif)</li>
              <li>Retard &gt; 30 min — Alerte automatique (toutes les 5 min)</li>
            </ul>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={testWebhook}
              disabled={testLoading}
              data-testid="button-test-webhook"
            >
              {testLoading
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <MessageSquare className="h-4 w-4 mr-2" />
              }
              Envoyer un message test
            </Button>
            {testResult === "ok" && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Succès</span>}
            {testResult === "error" && <span className="text-xs text-red-500 flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />Échec</span>}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Apps Script */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-orange-500" />
            <CardTitle className="text-sm">Email + Google Sheets (Apps Script)</CardTitle>
            <Badge variant="outline" className="text-xs border-orange-400 text-orange-600">À configurer</Badge>
          </div>
          <CardDescription className="text-xs">
            Emails automatiques (T0 responsable, retards admin) + export Sheets avec colorisation KPI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              Configuration requise — 5 minutes
            </div>
            <ol className="text-xs text-amber-700 dark:text-amber-400 space-y-1.5 list-decimal list-inside">
              <li>Créer un Google Sheet nommé <strong>"DMC Livraisons — Suivi"</strong></li>
              <li>Aller sur <a href="https://script.google.com" target="_blank" className="underline">script.google.com</a> → Nouveau projet</li>
              <li>Coller le fichier <strong>Code.gs</strong> fourni, remplacer SPREADSHEET_ID et emails</li>
              <li>Déployer → Application Web → "Tout le monde" → copier l'URL</li>
              <li>Configurer le déclencheur <strong>checkKpiQuotidien</strong> à 18h</li>
            </ol>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(APPS_SCRIPT_INSTALL_URL, "_blank")}
              data-testid="button-open-apps-script"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Ouvrir script.google.com
            </Button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ce que ça envoie</label>
            <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground space-y-1">
              <div className="grid grid-cols-4 gap-2 font-medium text-foreground mb-2">
                <span>Événement</span><span>Chat</span><span>Email</span><span>Sheets</span>
              </div>
              {[
                ["T0 — Nouvelle demande", "✅", "✅ Responsable", "✅ Nouvelle ligne"],
                ["T2 — Prête", "✅", "—", "✅ Mise à jour"],
                ["T4 — Sortie (délai ok)", "✅", "—", "✅ Ligne verte"],
                ["T4 — Sortie (retard)", "✅", "✅ Admin", "✅ Ligne orange"],
                ["18h — Récap quotidien", "—", "✅ Admin + Resp.", "—"],
              ].map(([evt, chat, email, sheets]) => (
                <div key={evt} className="grid grid-cols-4 gap-2">
                  <span>{evt}</span><span>{chat}</span><span>{email}</span><span>{sheets}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
