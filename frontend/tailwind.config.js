/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f7f5",
          100: "#eeeeea",
          200: "#d6d5cd",
          400: "#8a887e",
          600: "#3d3d3a",
          900: "#16161a",
        },
        accent: {
          50: "#eef2ff",
          400: "#7c83ec",
          600: "#4f46e5",
          700: "#3d35c4",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
