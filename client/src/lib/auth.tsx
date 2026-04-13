import { createContext, useContext, useState, type ReactNode } from "react";
import type { Utilisateur } from "@shared/schema";
import { apiRequest } from "./queryClient";

interface AuthContextType {
  user: Utilisateur | null;
  login: (email: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Utilisateurs demo (simule Google Workspace)
const DEMO_USERS = [
  { email: "Fadell.bazzouni@dmcsen.com", label: "Fadel Bazzouni (Admin)" },
  { email: "commercial1@dmcsen.com", label: "Ndeye Fatou (Commercial)" },
  { email: "commercial2@dmcsen.com", label: "Fatou Sow (Commercial)" },
  { email: "responsable1@dmcsen.com", label: "Ibrahima Ndoye (Resp. Showroom)" },
  { email: "responsable2@dmcsen.com", label: "Ousmane Fall (Resp. Quincaillerie)" },
  { email: "responsable3@dmcsen.com", label: "Modou Thiam (Resp. Parc Acier)" },
  { email: "chef_poste@dmcsen.com", label: "Abdou Diop (Chef de Poste)" },
];
export { DEMO_USERS };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Utilisateur | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const login = async (email: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await apiRequest("GET", `/api/utilisateurs/${encodeURIComponent(email)}`);
      if (!res.ok) return false;
      const userData: Utilisateur = await res.json();
      setUser(userData);
      return true;
    } catch {
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  commercial: "Commercial",
  responsable: "Resp. Prépa/Livraison",
  chef_poste: "Chef de Poste",
};

export const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  commercial: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  responsable: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  chef_poste: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};
