import typography from "@tailwindcss/typography";
const config = {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                bg: "#F4F7FB",
                surface: "#FFFFFF",
                border: "#DBE3EF",
                text: "#0F172A",
                muted: "#64748B",
                steel: "#94A3B8",
                panel: "#EEF4FF",
                ember: "#2453D4",
            },
            fontFamily: {
                sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
                mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
                display: ["Oswald", "ui-sans-serif", "system-ui", "sans-serif"],
            }
        }
    },
    plugins: [typography]
};
export default config;
