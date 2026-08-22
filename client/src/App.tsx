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
import JustificatifsPage from "@/pages/Justificatifs";
import ControleurPage from "@/pages/Controleur";
import ConfigurationPage from "@/pages/Configuration";
import DashboardPage from "@/pages/Dashboard";
// Module flotte interne
import PlanifieesPage from "@/pages/flotte/Planifiees";
import EffectueesPage from "@/pages/flotte/Effectuees";
import NonConformitesPage from "@/pages/flotte/NonConformites";
import KpiFlottePage from "@/pages/flotte/KpiFlotte";
import ImportNavPage from "@/pages/flotte/ImportNav";
import ReferentielsFlottePage from "@/pages/flotte/Referentiels";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
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
  // Le chef flotte est redirigé sur /flotte/planifiees à l'ouverture
  // (il n'a accès qu'à la section Flotte interne)
  // L'agent showroom est redirigé directement sur son écran dédié
  const defaultRoute =
    user?.role === "chef_flotte" ? "/flotte/planifiees" :
    user?.role === "agent_showroom" ? "/agent-showroom" :
    "/file";
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to={defaultRoute} />} />
      <Route path="/file" component={FileCommandesPage} />
      <Route path="/nouvelle-demande" component={NouvelleDemandePage} />
      <Route path="/poste-garde" component={PosteGardePage} />
      <Route path="/agent-showroom" component={AgentShowroomPage} />
      <Route path="/responsable" component={ResponsablePage} />
      <Route path="/justificatifs" component={JustificatifsPage} />
      <Route path="/controleur" component={ControleurPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/utilisateurs" component={UtilisateursPage} />
      <Route path="/configuration" component={ConfigurationPage} />
      {/* Module flotte interne — 6 sections */}
      <Route path="/flotte" component={() => <Redirect to="/flotte/planifiees" />} />
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
