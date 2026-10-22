import react from "@vitejs/plugin-react";
import tailwind from "tailwindcss";
import postcss from "postcss";

export default {
  plugins: [react()],
  css: {
    postcssConfig: {
      plugins: [tailwind()],
    },
  },
};