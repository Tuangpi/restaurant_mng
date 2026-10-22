import { defineConfig } from "@prisma/ts-config";

export default defineConfig({
  // Prisma 7 config
  // The DATABASE_URL will be read from the .env file
  url: "postgresql://restaurant_mng:restaurant_mng_dev@localhost:5432/restaurant_mng",
});