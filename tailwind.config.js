/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/index.html", "./client/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Palette reconstruite depuis le CSS compilé du build en production
        // (fadbazz-bot.github.io/dmc-livraisons) — valeurs exactes, ne pas changer
        // sans vérifier le rendu réel du site.
        brand: {
          50: "rgb(240 245 250)",
          100: "rgb(220 232 243)",
          200: "rgb(185 208 231)",
          300: "rgb(136 174 211)",
          400: "rgb(91 137 187)",
          600: "rgb(47 88 135)",
          700: "rgb(40 70 108)",
          900: "rgb(26 58 92)",
        },
        accent: {
          DEFAULT: "rgb(230 126 34)",
          50: "rgb(254 245 236)",
          100: "rgb(252 229 207)",
          600: "rgb(196 95 16)",
        },
      },
      animation: {
        fadeIn: "fadeIn .18s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: 0, transform: "translateY(2px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
