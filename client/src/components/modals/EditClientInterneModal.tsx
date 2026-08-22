import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { api } from "@/api/appsScript";
import type { ClientLivraisonInterne } from "@/types/domain";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

interface Props {
  existing?: ClientLivraisonInterne;
  open: boolean;
  onClose: () => void;
}

export function EditClientInterneModal({ existing, open, onClose }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const isEdit = !!existing;
  // Wrap avec String() : Sheets renvoie parfois des nombres pour les codes clients
  // numériques, ce qui fait planter .trim() plus loin.
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const [codeClient, setCodeClient] = useState(s(existing?.codeClient));
  const [nomClient, setNomClient] = useState(s(existing?.nomClient));
  const [codeCommercial, setCodeCommercial] = useState(s(existing?.codeCommercial));
  const [autorise, setAutorise] = useState(existing?.autorise ?? false);
  const [autoriseException, setAutoriseException] = useState(existing?.autoriseException ?? false);
  const [lieuLivraison, setLieuLivraison] = useState(s(existing?.lieuLivraison));
  const [contact, setContact] = useState(s(existing?.contact));
  const [telephone, setTelephone] = useState(s(existing?.telephone));
  const [email, setEmail] = useState(s(existing?.email));
  const [demandeDecharg, setDemandeDecharg] = useState(existing?.demandeDecharg ?? false);
  const [demandeLivraison, setDemandeLivraison] = useState(existing?.demandeLivraison ?? false);
  const [commentaire, setCommentaire] = useState(s(existing?.commentaire));
  const [actif, setActif] = useState(existing?.actif ?? true);

  const m = useMutation({
    mutationFn: () => {
      // String() défensif : si une valeur a été initialisée comme nombre, .trim() planterait.
      const payload = {
        codeClient: String(codeClient).trim(),
        nomClient: String(nomClient).trim(),
        codeCommercial: String(codeCommercial).trim(),
        autorise,
        autoriseException,
        lieuLivraison: String(lieuLivraison).trim(),
        contact: String(contact).trim(),
        telephone: String(telephone).trim(),
        email: String(email).trim(),
        demandeDecharg,
        demandeLivraison,
        commentaire: String(commentaire).trim(),
      };
      if (isEdit) return api.flotteClients.update({ id: existing!.id, ...payload, actif });
      return api.flotteClients.add(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Client modifié" : "Client ajouté");
      qc.invalidateQueries({ queryKey: ["flotte-clients"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nomClient.trim()) {
      toast.error("Nom client obligatoire");
      return;
    }
    m.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Modifier ${existing.nomClient}` : "Nouveau client livraison interne"}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={m.isPending}>
            Annuler
          </button>
          <button type="submit" form="form-client" className="btn-primary gap-2" disabled={m.isPending}>
            <Save className="h-4 w-4" />
            {m.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <form id="form-client" onSubmit={onSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="code" className="label">Code client NAV</label>
            <input id="code" type="text" value={codeClient} onChange={(e) => setCodeClient(e.target.value)} className="input font-mono" />
          </div>
          <div>
            <label htmlFor="comm" className="label">Code commercial (CSE)</label>
            <input id="comm" type="text" value={codeCommercial} onChange={(e) => setCodeCommercial(e.target.value.toUpperCase())} className="input font-mono uppercase" placeholder="OUDI, FAN, etc." />
          </div>
        </div>
        <div>
          <label htmlFor="nom" className="label">Nom client (NAV) <span className="text-red-500">*</span></label>
          <input id="nom" type="text" value={nomClient} onChange={(e) => setNomClient(e.target.value)} autoFocus className="input" />
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200">
            <input type="checkbox" checked={autorise} onChange={(e) => setAutorise(e.target.checked)} />
            <span className="text-sm">Autorisé livraison interne</span>
          </label>
          <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200">
            <input type="checkbox" checked={autoriseException} onChange={(e) => setAutoriseException(e.target.checked)} />
            <span className="text-sm">Exception (selon montant)</span>
          </label>
        </div>

        <div>
          <label htmlFor="lieu" className="label">Lieu de livraison</label>
          <input id="lieu" type="text" value={lieuLivraison} onChange={(e) => setLieuLivraison(e.target.value)} className="input" />
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="contact" className="label">Contact</label>
            <input id="contact" type="text" value={contact} onChange={(e) => setContact(e.target.value)} className="input" />
          </div>
          <div>
            <label htmlFor="tel" className="label">Téléphone</label>
            <input id="tel" type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} className="input" />
          </div>
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200">
            <input type="checkbox" checked={demandeDecharg} onChange={(e) => setDemandeDecharg(e.target.checked)} />
            <span className="text-sm">Demande déchargement / manoeuvres</span>
          </label>
          <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200">
            <input type="checkbox" checked={demandeLivraison} onChange={(e) => setDemandeLivraison(e.target.checked)} />
            <span className="text-sm">Demande systématique livraison</span>
          </label>
        </div>

        <div>
          <label htmlFor="commentaire" className="label">Commentaire</label>
          <textarea id="commentaire" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={2} className="input" />
        </div>

        {isEdit && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
            <span>Actif</span>
          </label>
        )}
      </form>
    </Modal>
  );
}
