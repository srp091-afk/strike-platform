import type { Config } from "tailwindcss";

const config: Config = {
  theme: {
    extend: {
      colors: {
        strike: {
          DEFAULT: "#E11D48",
          dark: "#BE123C",
        },
        ink: "#A1A1AA",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["var(--font-jakarta)", "var(--font-inter)", "ui-sans-serif", "sans-serif"],
        display: ["var(--font-jakarta)", "var(--font-inter)", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: {
        card: "0 0 0 1px rgba(255,255,255,0.04)",
      },
    },
  },
};

export default config;
