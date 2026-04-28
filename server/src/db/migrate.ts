import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from './index.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let migrationsFolder = resolve(__dirname, './migrations');
if (!existsSync(migrationsFolder)) {
  migrationsFolder = resolve(__dirname, '../../src/db/migrations');
}

console.log('Running migrations...');
await migrate(db, { migrationsFolder });
console.log('Migrations complete.');
