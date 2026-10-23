import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  plugins: [react()],
  css: {
    postcss: join(__dirname, "tailwind.config.ts"),
  },
};