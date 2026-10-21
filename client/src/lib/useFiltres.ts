import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { porteeDe } from "@/lib/portee";
import type { Periode } from "@/lib/periode";

/**
 * État commun des filtres période / site / magasin, borné par les droits du compte
 * (un champ verrouillé par le rôle l'emporte toujours sur le choix affiché).
 */
export function useFiltres(periodeInitiale: Periode) {
  const { user } = useAuth();
  const portee = useMemo(() => porteeDe(user), [user]);
  const [periode, setPeriode] = useState<Periode>(periodeInitiale);
  const [siteChoisi, setSite] = useState("");
  const [zoneChoisie, setZone] = useState("");
  const site = portee.siteFixe ?? siteChoisi;
  const zone = portee.zoneFixe ?? zoneChoisie;
  // Bornes toujours renseignées pour l'API ("Tout" = très large)
  const dateDebut = periode.debut || "2000-01-01";
  const dateFin = periode.fin || "2100-12-31";
  return {
    portee, periode, setPeriode, site, setSite, zone, setZone, dateDebut, dateFin,
    params: { dateDebut, dateFin, site: site || undefined, magasin: zone || undefined },
  };
}

export type Filtres = ReturnType<typeof useFiltres>;
