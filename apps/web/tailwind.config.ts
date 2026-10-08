import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9ebff",
          500: "#2f6fed",
          600: "#2559c7",
          700: "#1d47a1",
        },
      },
    },
  },
  plugins: [],
};

export default config;
