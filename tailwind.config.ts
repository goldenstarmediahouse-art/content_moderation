import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        charcoal: {
          950: "#0B0E14", // Deep dark background
          900: "#111620", // Card and surface background
          850: "#161D2B", // Elevated cards / hovering
          800: "#1E2738", // Borders & separators
          700: "#2B374D", // Subtle borders
          600: "#475569", // Muted text / icons
          500: "#64748B", // Secondary text
          400: "#94A3B8", // Regular text
          300: "#CBD5E1", // Light secondary
          200: "#E2E8F0", // High contrast
          100: "#F1F5F9", // Brightest text
        },
        status: {
          threat: "#DC2626", // Restrained red for serious threats
          "threat-bg": "rgba(220, 38, 38, 0.12)",
          "threat-border": "rgba(220, 38, 38, 0.28)",
          warning: "#D97706", // Restrained amber
          "warning-bg": "rgba(217, 119, 6, 0.12)",
          "warning-border": "rgba(217, 119, 6, 0.28)",
          safe: "#059669", // Restrained green
          "safe-bg": "rgba(5, 150, 105, 0.12)",
          "safe-border": "rgba(5, 150, 105, 0.28)",
          muted: "#475569",
        },
      },
    },
  },
  plugins: [],
};

export default config;
