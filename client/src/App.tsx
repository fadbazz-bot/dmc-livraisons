import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";

import LoginPage from "@/pages/login";
import NouvelleDemandePage from "@/pages/nouvelle-demande";
import FileCommandesPage from "@/pages/file-commandes";
import ResponsablePage from "@/pages/responsable";
import PosteGardePage from "@/pages/poste-garde";
import DashboardPage from "@/pages/dashboard";
import ConfigurationPage from "@/pages/configuration";
import NotFound from "@/pages/not-found";

function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <button
      onClick={() => setDark((d) => !d)}
      className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      aria-label="Basculer le thème"
      data-testid="button-theme-toggle"
    >
      {dark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={FileCommandesPage} />
      <Route path="/nouvelle-demande" component={NouvelleDemandePage} />
      <Route path="/file-commandes" component={FileCommandesPage} />
      <Route path="/responsable" component={ResponsablePage} />
      <Route path="/poste-garde" component={PosteGardePage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/configuration" component={ConfigurationPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user } = useAuth();

  if (!user) return <LoginPage />;

  const sidebarStyle = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Top bar */}
          <header className="flex items-center justify-between px-4 py-2.5 border-b bg-background shrink-0 z-10">
            <SidebarTrigger
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-sidebar-toggle"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{user.nom}</span>
              <ThemeToggle />
            </div>
          </header>
          {/* Main content */}
          <main className="flex-1 overflow-hidden">
            <AppRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Router hook={useHashLocation}>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
