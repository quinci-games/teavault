import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import * as schema from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, '../../data');
const dbPath = resolve(dataDir, 'teavault.db');

mkdirSync(dataDir, { recursive: true });

const client = createClient({ url: `file:${dbPath}` });

export const db = drizzle(client, { schema });
