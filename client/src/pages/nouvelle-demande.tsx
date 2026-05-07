import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { insertCommandeSchema, type InsertCommande } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { SITE_OPTIONS, ZONE_OPTIONS, TYPE_OPTIONS, PRIORITE_OPTIONS } from "@/lib/utils";
import { useLocation } from "wouter";
import { z } from "zod";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, PackagePlus, ArrowRight, ShieldCheck, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = insertCommandeSchema.extend({
  numExpedition: z.string()
    .min(1, "N° expédition requis")
    .regex(/^EX-\d+$/, "Format attendu : EX-2504664"),
  numCommandeNav: z.string()
    .optional()
    .or(z.literal("")),
  client: z.string().min(1, "Client requis"),
  site: z.string().min(1, "Site requis"),
  zoneLivraison: z.string().min(1, "Zone de livraison requise"),
  typeCommande: z.string().min(1, "Type requis"),
  priorite: z.string().min(1, "Priorité requise"),
  telephoneChauffeur: z.string().optional(), // NOUVEAU
});

export default function NouvelleDemandePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  // NOUVEAU : État pour afficher le code PIN généré
  const [codeGenere, setCodeGenere] = useState<string | null>(null);

  const form = useForm<InsertCommande>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      numExpedition: "",
      numCommandeNav: "",
      client: "",
      site: user?.site || "",
      zoneLivraison: "",
      typeCommande: "Livraison interne",
      priorite: "aujourd_hui",
      commercialNom: user?.nom || "",
      commercialEmail: user?.email || "",
      commentaireCommercial: "",
      dateHeureVoulue: "",
      telephoneChauffeur: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: InsertCommande) => {
      const res = await apiRequest("POST", "/api/commandes", data);
      if (!res.ok) throw new Error("Erreur de création");
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/commandes"] });
      // On affiche le code PIN reçu du serveur
      setCodeGenere(data.codeRetrait);
      toast({ title: "Demande créée", description: "Commande enregistrée avec succès." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de créer la demande.", variant: "destructive" });
    },
  });

  const handleCloseAndNavigate = () => {
    setCodeGenere(null);
    navigate("/file-commandes");
  };

  const priorite = form.watch("priorite");

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <PackagePlus className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Nouvelle demande de livraison</h1>
          <p className="text-sm text-muted-foreground">Saisie T0 — par {user?.nom}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Informations commande</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
              
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="numCommandeNav" render={({ field }) => (
                  <FormItem>
                    <FormLabel>N° Commande NAV (Optionnel)</FormLabel>
                    <FormControl><Input placeholder="CV-MC2502353" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value.toUpperCase())} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="numExpedition" render={({ field }) => (
                  <FormItem>
                    <FormLabel>N° Expédition NAV *</FormLabel>
                    <FormControl><Input placeholder="EX-2504664" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="client" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client *</FormLabel>
                    <FormControl><Input placeholder="Nom du client" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="telephoneChauffeur" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Téléphone du chauffeur (Optionnel)</FormLabel>
                    <FormControl><Input placeholder="+221 77 000 00 00" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="site" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Dakar ou Diamniadio" /></SelectTrigger></FormControl>
                      <SelectContent>{SITE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="zoneLivraison" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zone de livraison *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Choisir la zone…" /></SelectTrigger></FormControl>
                      <SelectContent>{ZONE_OPTIONS.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="typeCommande" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger></FormControl>
                      <SelectContent>{TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="priorite" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priorité *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{PRIORITE_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="commentaireCommercial" render={({ field }) => (
                <FormItem>
                  <FormLabel>Commentaire (facultatif)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Instructions particulières…" className="resize-none" rows={3} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => navigate("/file-commandes")}>Annuler</Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Envoi…</> : <><ArrowRight className="h-4 w-4 mr-2" />Soumettre la demande</>}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* MODALE DU CODE DE RETRAIT ANTI-TRICHE */}
      <Dialog open={!!codeGenere} onOpenChange={handleCloseAndNavigate}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="flex flex-col items-center gap-2 text-xl">
              <ShieldCheck className="h-12 w-12 text-emerald-500 mb-2" />
              Commande validée !
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Veuillez transmettre ce code de retrait au chauffeur. <br />
              <strong className="text-foreground">Il est obligatoire pour retirer la marchandise.</strong>
            </p>
            <div className="bg-muted py-6 rounded-xl border flex items-center justify-center gap-4">
              <span className="text-5xl font-mono font-bold tracking-widest text-primary">
                {codeGenere}
              </span>
            </div>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button onClick={handleCloseAndNavigate} className="w-full sm:w-auto px-8">
              J'ai transmis le code, fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
