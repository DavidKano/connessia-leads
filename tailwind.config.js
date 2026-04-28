/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        connessia: {
          50: "#effdf9",
          100: "#d7fbf1",
          200: "#b2f5e4",
          300: "#75e8cf",
          400: "#32d0b3",
          500: "#16b39b",
          600: "#0f8f7f",
          700: "#0f766e",
          800: "#115f5a",
          900: "#134f4b"
        },
        coral: {
          100: "#ffe6df",
          500: "#f9735b",
          700: "#c2412d"
        }
      },
      boxShadow: {
        panel: "0 12px 32px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};
