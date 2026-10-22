import type { Config } from "tailwindcss";

export default {
  content: [
    "./index.html",
    "./src/**/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        burmese: {
          bg: "#F0F4F7",
          primary: "#2D3748",
          secondary: "#4A5568",
          accent: "#ED8936",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;