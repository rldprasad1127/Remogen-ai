/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        base: "#0F172A",
        panel: "#111827",
        accent: "#38BDF8",
      },
    },
  },
  plugins: [],
};
