import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'commerce');

// Same read/write-JSON-file pattern used by the CMS in server.js, scoped to
// data/commerce/. Used as the fallback store for products/orders/customers/
// campaigns whenever Supabase isn't configured.
const filePath = (name) => path.join(DATA_DIR, `${name}.json`);

export const readCollection = (name, defaultVal = []) => {
  const p = filePath(name);
  try {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(defaultVal, null, 2));
      return defaultVal;
    }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (error) {
    console.error(`[commerce/localStore] Error reading ${name}:`, error);
    return defaultVal;
  }
};

export const writeCollection = (name, data) => {
  const p = filePath(name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return data;
};

export const dataDir = DATA_DIR;
