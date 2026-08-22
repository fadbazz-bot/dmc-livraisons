import { QueryClient } from "@tanstack/react-query";

/**
 * Configuration globale React Query :
 *  - staleTime 60s par défaut : on évite de spammer Apps Script (qui est lent ~500ms-1s)
 *  - refetch on focus désactivé : les actions terrain ne changent pas la donnée externe
 *  - retry 1 fois : Apps Script peut timeout sporadiquement
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
