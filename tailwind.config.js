/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: "#00c896",
        dark: "#0f0f0f",
        surface: "#1a1a1a",
        muted: "#2a2a2a",
      },
      fontFamily: {
        display: ["'DM Mono'", "monospace"],
        body: ["'DM Sans'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
