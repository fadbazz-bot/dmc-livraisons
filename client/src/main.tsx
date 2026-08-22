import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "@/App";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/Toast";
import { queryClient } from "@/lib/queryClient";
import "@/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Élément root introuvable");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
