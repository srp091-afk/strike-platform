import type { Config } from "tailwindcss";

const config: Config = {
  theme: {
    extend: {
      colors: {
        strike: {
          DEFAULT: "#E11D48",
          dark: "#BE123C",
        },
        ink: "#09090B",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["var(--font-jakarta)", "var(--font-inter)", "ui-sans-serif", "sans-serif"],
        display: ["var(--font-jakarta)", "var(--font-inter)", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: {
        card: "0 4px 20px -2px rgba(0,0,0,0.05)",
      },
    },
  },
};

export default config;
