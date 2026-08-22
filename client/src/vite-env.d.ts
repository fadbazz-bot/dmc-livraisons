/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPS_SCRIPT_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  // Ajouter ici toute autre variable VITE_* utilisée dans le code
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Google Identity Services (chargé via <script src="https://accounts.google.com/gsi/client">
// dans index.html — pas de types npm officiels pour cette API).
interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (response: { credential: string }) => void;
          auto_select?: boolean;
          cancel_on_tap_outside?: boolean;
        }) => void;
        renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        prompt: () => void;
        disableAutoSelect: () => void;
      };
    };
  };
}

declare module "html2pdf.js" {
  interface Html2PdfOptions {
    margin?: number | [number, number, number, number];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: Record<string, unknown>;
  }
  interface Html2Pdf {
    set: (opt: Html2PdfOptions) => Html2Pdf;
    from: (element: HTMLElement) => Html2Pdf;
    save: () => Promise<void>;
    outputPdf: (type?: string) => Promise<unknown>;
  }
  function html2pdf(): Html2Pdf;
  export default html2pdf;
}
