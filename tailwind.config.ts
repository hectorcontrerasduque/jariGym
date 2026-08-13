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
        gym: {
          bg: "#0B1120",
          surface: "#111827",
          border: "#1E293B",
          primary: "#38BDF8",
          secondary: "#818CF8",
          success: "#34D399",
          danger: "#FB7185",
          warning: "#FBBF24",
          text: "#F8FAFC",
          muted: "#94A3B8",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
