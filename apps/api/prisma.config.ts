import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });

export default defineConfig({
  schema: fileURLToPath(new URL('./prisma/schema.prisma', import.meta.url)),
  datasource: {
    url: env('DATABASE_URL'),
  },
});