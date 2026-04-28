import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

function getOAuthClient() {
  return new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

/**
 * Login and callback both use `/tea` as the external path prefix in prod
 * (Caddy strips it before Express sees the request). We hardcode the
 * redirect targets here as `/tea/...` so the browser ends up at the
 * correct external URL. In dev the Vite proxy + a root path make the
 * same strings work because the client is served at `/`.
 */
const LOGIN_PATH = process.env.EXTERNAL_PATH_PREFIX ?? '/tea';

router.get('/google', (_req, res) => {
  const client = getOAuthClient();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
  });
  res.redirect(url);
});

router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      return res.redirect(`${LOGIN_PATH}/login?error=no_code`);
    }

    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
    });
    const payload = ticket.getPayload()!;
    const email = payload.email!;
    const displayName = payload.name || email;
    const avatarUrl = payload.picture || null;

    let user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      const [created] = await db.insert(users).values({
        email, displayName, avatarUrl, role: 'user', isAllowed: false,
      }).returning();
      user = created;
    } else {
      await db.update(users)
        .set({ displayName, avatarUrl, updatedAt: new Date().toISOString() })
        .where(eq(users.id, user.id));
      user = (await db.select().from(users).where(eq(users.id, user.id)).get())!;
    }

    if (!user.isAllowed) {
      return res.redirect(`${LOGIN_PATH}/login?error=not_allowed`);
    }

    req.session.userId = user.id;
    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
      res.redirect(`${LOGIN_PATH}/`);
    });
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${LOGIN_PATH}/login?error=auth_failed`);
  }
});

router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = await db.select().from(users).where(eq(users.id, req.session.userId)).get();
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json(user);
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.json({ ok: true });
  });
});

export default router;
