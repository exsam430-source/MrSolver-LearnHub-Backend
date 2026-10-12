// /home/u200322609/nodejs/config/env.js
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Absolute path to .env — works regardless of where Node starts
const envPath = path.resolve(__dirname, '../.env');

const result = config({ path: envPath });

if (result.error) {
  console.error(`❌ Failed to load .env from: ${envPath}`);
  console.error(result.error.message);
} else {
  const count = Object.keys(result.parsed || {}).length;
  console.log(`✅ Loaded ${count} env vars from: ${envPath}`);
}