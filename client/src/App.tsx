import { Switch, Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import LoginPage from "@/pages/Login";
import FileCommandesPage from "@/pages/FileCommandes";
import PosteGardePage from "@/pages/PosteGarde";
import AgentShowroomPage from "@/pages/AgentShowroom";
import ResponsablePage from "@/pages/Responsable";
import NouvelleDemandePage from "@/pages/NouvelleDemande";
import UtilisateursPage from "@/pages/Utilisateurs";
import CoordinationPage from "@/pages/Coordination";
import NonConformitesMagasinPage from "@/pages/NonConformitesMagasin";
import ConfigurationPage from "@/pages/Configuration";
import DonneesAdminPage from "@/pages/DonneesAdmin";
import DashboardPage from "@/pages/Dashboard";
// Module flotte interne
import AujourdhuiPage from "@/pages/flotte/Aujourdhui";
import PlanifieesPage from "@/pages/flotte/Planifiees";
import EffectueesPage from "@/pages/flotte/Effectuees";
import NonConformitesPage from "@/pages/flotte/NonConformites";
import KpiFlottePage from "@/pages/flotte/KpiFlotte";
import ImportNavPage from "@/pages/flotte/ImportNav";
import ReferentielsFlottePage from "@/pages/flotte/Referentiels";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { routeAccueil, routeAutorisee } from "@/lib/nav";
import { useEffect } from "react";

function Redirect({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [navigate, to]);
  return null;
}

function AppRouter() {
  const { user } = useAuth();
  // Le chef flotte est redirigé sur /flotte/aujourdhui à l'ouverture
  // (il n'a accès qu'à la section Flotte interne)
  // L'agent showroom est redirigé directement sur son écran dédié
  const [location] = useLocation();
  const defaultRoute = routeAccueil(user?.role ?? "");
  // Accès direct par adresse : un rôle ne voit que ses propres écrans
  if (user && !routeAutorisee(user, location)) return <Redirect to={defaultRoute} />;
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to={defaultRoute} />} />
      <Route path="/file" component={FileCommandesPage} />
      <Route path="/nouvelle-demande" component={NouvelleDemandePage} />
      <Route path="/poste-garde" component={PosteGardePage} />
      <Route path="/agent-showroom" component={AgentShowroomPage} />
      <Route path="/responsable" component={ResponsablePage} />
      <Route path="/coordination" component={CoordinationPage} />
      <Route path="/non-conformites" component={NonConformitesMagasinPage} />
      {/* Anciennes adresses (Justificatifs / Contrôle) : regroupées dans Non-conformités */}
      <Route path="/justificatifs" component={() => <Redirect to="/non-conformites" />} />
      <Route path="/controleur" component={() => <Redirect to="/non-conformites" />} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/utilisateurs" component={UtilisateursPage} />
      <Route path="/donnees" component={DonneesAdminPage} />
      <Route path="/configuration" component={ConfigurationPage} />
      {/* Module flotte interne — 6 sections */}
      <Route path="/flotte" component={() => <Redirect to="/flotte/aujourdhui" />} />
      <Route path="/flotte/aujourdhui"      component={AujourdhuiPage} />
      <Route path="/flotte/planifiees"      component={PlanifieesPage} />
      <Route path="/flotte/effectuees"      component={EffectueesPage} />
      <Route path="/flotte/non-conformites" component={NonConformitesPage} />
      <Route path="/flotte/kpi"             component={KpiFlottePage} />
      <Route path="/flotte/import-nav"      component={ImportNavPage} />
      <Route path="/flotte/referentiels"    component={ReferentielsFlottePage} />
      {/* Compat ancienne URL */}
      <Route path="/referentiels-flotte"    component={() => <Redirect to="/flotte/referentiels" />} />
      <Route>
        <PlaceholderPage title="Page non trouvée" description="L'URL demandée n'existe pas dans l'application." />
      </Route>
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user } = useAuth();
  if (!user) return <LoginPage />;
  return (
    <AppShell>
      <AppRouter />
    </AppShell>
  );
}

export default function App() {
  return (
    <Router hook={useHashLocation}>
      <AuthenticatedApp />
    </Router>
  );
}
