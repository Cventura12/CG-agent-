import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0A0F11",
        surface: "#12191B",
        border: "#283235",
        text: "#EEE8DE",
        muted: "#93A0A4",
        orange: "#D9772B",
        green: "#5BB983",
        steel: "#6F93AD",
        yellow: "#D2A04B",
        panel: "#182124",
        ember: "#C96B30",
      },
      fontFamily: {
        sans: ["Archivo", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        display: ["Barlow Condensed", "Archivo Narrow", "ui-sans-serif", "sans-serif"],
      }
    }
  },
  plugins: [typography]
};

export default config;
