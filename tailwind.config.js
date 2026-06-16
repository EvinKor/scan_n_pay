/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        divider: "rgb(var(--divider) / <alpha-value>)",
        main: "rgb(var(--main) / <alpha-value>)",
        subtle: "rgb(var(--subtle) / <alpha-value>)",
        brand: "rgb(var(--brand) / <alpha-value>)",
      },
      fontFamily: {
        display: ["'Outfit'", "sans-serif"],
        body: ["'Outfit'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
