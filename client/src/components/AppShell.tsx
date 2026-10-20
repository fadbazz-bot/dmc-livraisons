import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav, MobileTopBar } from "@/components/MobileNav";

/**
 * Coquille principale de l'application connectée.
 * Bureau : menu latéral. Mobile : barre du haut (compte) + onglets en bas.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileTopBar />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
