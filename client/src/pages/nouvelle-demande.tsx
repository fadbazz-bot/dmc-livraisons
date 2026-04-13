import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { insertCommandeSchema, type InsertCommande } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { SITE_OPTIONS, ZONE_OPTIONS, TYPE_OPTIONS, PRIORITE_OPTIONS } from "@/lib/utils";
import { useLocation } from "wouter";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PackagePlus, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = insertCommandeSchema.extend({
  numExpedition: z.string()
    .min(1, "N° expédition requis")
    .regex(/^EX-\d+$/, "Format attendu : EX-2504664"),
  numCommandeNav: z.string()
    .regex(/^CV-MC\d+$/, "Format attendu : CV-MC2502353")
    .optional()
    .or(z.literal("")),
  client: z.string().min(1, "Client requis"),
  site: z.string().min(1, "Site requis"),
  zoneLivraison: z.string().min(1, "Zone de livraison requise"),
  typeCommande: z.string().min(1, "Type requis"),
  priorite: z.string().min(1, "Priorité requise"),
});

export default function NouvelleDemandePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

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
      motifRetard: null,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: InsertCommande) =>
      apiRequest("POST", "/api/commandes", data).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/commandes"] });
      toast({ title: "Demande créée", description: "La commande a été ajoutée à la file." });
      navigate("/file-commandes");
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de créer la demande.", variant: "destructive" });
    },
  });

  const priorite = form.watch("priorite");

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
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
          <CardTitle className="text-base">Informations commande NAV</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-5">

              {/* N° Commande NAV + N° Expédition */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="numCommandeNav" render={({ field }) => (
                  <FormItem>
                    <FormLabel>N° Commande NAV</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="CV-MC2502353"
                        data-testid="input-num-commande"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          // Auto-format : ajoute le préfixe CV-MC si l'utilisateur commence à taper
                          let v = e.target.value.toUpperCase();
                          field.onChange(v);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="numExpedition" render={({ field }) => (
                  <FormItem>
                    <FormLabel>N° Expédition NAV *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="EX-2504664"
                        data-testid="input-num-expedition"
                        {...field}
                        onChange={(e) => {
                          let v = e.target.value.toUpperCase();
                          field.onChange(v);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Client */}
              <FormField control={form.control} name="client" render={({ field }) => (
                <FormItem>
                  <FormLabel>Client *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nom du client" data-testid="input-client" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Site + Zone livraison */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="site" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-site">
                          <SelectValue placeholder="Dakar ou Diamniadio" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SITE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="zoneLivraison" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zone de livraison *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-zone">
                          <SelectValue placeholder="Choisir la zone…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ZONE_OPTIONS.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Type + Priorité */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="typeCommande" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-type">
                          <SelectValue placeholder="Choisir…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="priorite" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priorité *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-priorite">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITE_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {priorite === "planifiee" && (
                <FormField control={form.control} name="dateHeureVoulue" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date/heure souhaitée</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" data-testid="input-date-voulue" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              {/* Commentaire */}
              <FormField control={form.control} name="commentaireCommercial" render={({ field }) => (
                <FormItem>
                  <FormLabel>Commentaire (facultatif)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Instructions particulières, contraintes de livraison…"
                      className="resize-none"
                      rows={3}
                      data-testid="textarea-commentaire"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => navigate("/file-commandes")}>
                  Annuler
                </Button>
                <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-demande">
                  {mutation.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Envoi…</>
                    : <><ArrowRight className="h-4 w-4 mr-2" />Soumettre la demande</>
                  }
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
