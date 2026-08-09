/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#0A1628",
          navy: "#0E2340",
          card: "#111C2E",
          gold: "#F5A524",
        },
      },
    },
  },
  plugins: [],
};