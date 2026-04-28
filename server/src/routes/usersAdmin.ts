import { Router } from 'express';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '../auth/middleware.js';

const router = Router();
router.use(requireAdmin);

router.get('/', async (_req, res) => {
  const rows = await db.select().from(users).orderBy(users.createdAt);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { email, role, isAllowed, displayName } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email required' });
  }
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) return res.status(409).json({ error: 'User already exists', user: existing });

  const [row] = await db.insert(users).values({
    email,
    displayName: displayName || email,
    role: role === 'admin' ? 'admin' : 'user',
    isAllowed: isAllowed !== false,
  }).returning();
  res.status(201).json(row);
});

router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  for (const f of ['role', 'isAllowed', 'displayName'] as const) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  const [row] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
  res.json(row);
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(users).where(eq(users.id, id));
  res.json({ ok: true });
});

export default router;
