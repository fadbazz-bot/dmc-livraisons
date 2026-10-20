/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/index.html", "./client/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // Bleu acier — identité DMC conservée, échelle complétée (800/950 manquaient avant)
        brand: {
          50: "#F1F6FB",
          100: "#E1ECF6",
          200: "#C3D8EB",
          300: "#94B6D6",
          400: "#5F90BC",
          500: "#3D70A3",
          600: "#2B5A89",
          700: "#224A72",
          800: "#1A3A5C",
          900: "#142C47",
          950: "#0D1E32",
        },
        // Orange signalisation — attention, retards, appel à l'action secondaire
        accent: {
          DEFAULT: "#E67E22",
          50: "#FEF5EC",
          100: "#FCE5CF",
          500: "#E67E22",
          600: "#C45F10",
        },
        // Couleurs de statut sémantiques (utilisées aussi par kpiColorClass)
        ok: "#15803D",
        warn: "#B45309",
        bad: "#B91C1C",
        // Surfaces
        canvas: "#F4F6F8",
        line: "#E2E7EC",
      },
      borderRadius: {
        card: "12px",
        ctl: "8px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(20, 44, 71, 0.05)",
        pop: "0 12px 32px -8px rgba(20, 44, 71, 0.22), 0 2px 6px rgba(20, 44, 71, 0.08)",
      },
      animation: {
        fadeIn: "fadeIn .18s ease-out",
        pop: "pop .18s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: 0, transform: "translateY(2px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        pop: {
          "0%": { opacity: 0, transform: "translateY(8px) scale(.98)" },
          "100%": { opacity: 1, transform: "translateY(0) scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
