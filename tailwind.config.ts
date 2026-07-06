import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        line: "var(--line)",
        "line-2": "var(--line-2)",
        ink: "var(--text)",
        dim: "var(--dim)",
        faint: "var(--faint)",
        accent: "var(--accent)",
        editorial: "var(--editorial)",
        good: "var(--good)",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      boxShadow: {
        sc: "0 1px 3px rgba(20,20,30,.06), 0 6px 18px rgba(20,20,30,.05)",
        "sc-h": "0 2px 6px rgba(20,20,30,.08), 0 14px 34px rgba(20,20,30,.12)",
      },
    },
  },
  plugins: [],
};
export default config;
