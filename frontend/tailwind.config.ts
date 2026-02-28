import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0F0F0E",
        surface: "#1A1A18",
        border: "#2E2E2A",
        text: "#E8E6DF",
        muted: "#9A9890",
        orange: "#E8722A",
        green: "#4CAF7D",
        steel: "#5B8DB8",
        yellow: "#D4A843"
      },
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      }
    }
  },
  plugins: [typography]
};

export default config;