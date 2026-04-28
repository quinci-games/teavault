import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { SQLiteSessionStore } from './auth/sessionStore.js';
import authRoutes from './routes/auth.js';
import teasRoutes, { IMAGES_DIR } from './routes/teas.js';
import aiAnalyzeRoutes from './routes/aiAnalyze.js';
import chatRoutes from './routes/chat.js';
import usersAdminRoutes from './routes/usersAdmin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT) || 3004;

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

await import('./db/migrate.js');

const CLIENT_DIST = path.join(__dirname, '../../client/dist');
const IS_PRODUCTION = fs.existsSync(path.join(CLIENT_DIST, 'index.html'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
      connectSrc: ["'self'"],
    },
  },
}));

app.use(cors({
  origin: IS_PRODUCTION ? false : 'http://localhost:5175',
  credentials: true,
}));

app.set('trust proxy', 1);
app.use(express.json());

// In production, Caddy's `handle_path /tea/*` strips the prefix before
// proxying. When hitting Express directly (dev, or a prod build without
// Caddy), strip it ourselves so every route works regardless of how we
// were reached.
app.use((req, _res, next) => {
  if (req.url.startsWith('/tea/')) req.url = req.url.slice(4) || '/';
  else if (req.url === '/tea') req.url = '/';
  next();
});

app.use(session({
  store: new SQLiteSessionStore(),
  name: 'teavault.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: IS_PRODUCTION,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  },
}));

app.use('/api/auth', authRoutes);
app.use('/api/teas', teasRoutes);
app.use('/api/ai', aiAnalyzeRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/users', usersAdminRoutes);

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
app.use('/api/images', express.static(IMAGES_DIR, { maxAge: '365d', immutable: true }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

if (IS_PRODUCTION) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`TeaVault server running on port ${PORT}`);
  console.log(IS_PRODUCTION ? 'Production mode' : 'Development mode');
});
