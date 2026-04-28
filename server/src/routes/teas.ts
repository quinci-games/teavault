import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { teas } from '../db/schema.js';
import { eq, and, isNull, desc, gt } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { compressTeaImage } from '../lib/imageCompression.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const IMAGES_DIR = path.resolve(__dirname, '../../data/images');
fs.mkdirSync(IMAGES_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

async function compressAndStore(file: Express.Multer.File): Promise<string> {
  const result = await compressTeaImage(file.buffer);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${result.extension}`;
  await fs.promises.writeFile(path.join(IMAGES_DIR, filename), result.buffer);
  return filename;
}

const router = Router();
router.use(requireAuth);

function serializeTea(row: typeof teas.$inferSelect) {
  return {
    ...row,
    flavorTags: row.flavorTags ? JSON.parse(row.flavorTags) as string[] : [],
  };
}

router.get('/', async (req, res) => {
  const { q, type, form, caffeine, inStock } = req.query;

  // Shared household vault — no per-user scoping. `userId` on each row
  // is kept purely as an audit field (who added it).
  const conditions = [isNull(teas.deletedAt)];
  if (type && typeof type === 'string') conditions.push(eq(teas.type, type));
  if (form && typeof form === 'string') conditions.push(eq(teas.form, form));
  if (caffeine && typeof caffeine === 'string') conditions.push(eq(teas.caffeine, caffeine));
  // `inStock=true` → quantity > 0; `inStock=false` → quantity = 0.
  if (inStock === 'true') conditions.push(gt(teas.quantity, 0));
  else if (inStock === 'false') conditions.push(eq(teas.quantity, 0));

  let rows = await db.select().from(teas)
    .where(and(...conditions))
    .orderBy(desc(teas.createdAt));

  if (q && typeof q === 'string') {
    const lower = q.toLowerCase();
    rows = rows.filter(t =>
      t.name.toLowerCase().includes(lower) ||
      t.brand?.toLowerCase().includes(lower) ||
      t.notes?.toLowerCase().includes(lower) ||
      t.flavorTags?.toLowerCase().includes(lower),
    );
  }

  res.json(rows.map(serializeTea));
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const row = await db.select().from(teas)
    .where(and(eq(teas.id, id), isNull(teas.deletedAt)))
    .get();
  if (!row) return res.status(404).json({ error: 'Tea not found' });
  res.json(serializeTea(row));
});

router.post('/', async (req, res) => {
  const userId = req.session.userId!;
  const { name, brand, type, form, caffeine, flavorTags, notes, quantity } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const q = Number.isFinite(Number(quantity)) ? Math.max(0, Math.round(Number(quantity))) : 1;

  const [row] = await db.insert(teas).values({
    userId,
    name,
    brand: brand || null,
    type: type || null,
    form: form || null,
    caffeine: caffeine || null,
    flavorTags: Array.isArray(flavorTags) && flavorTags.length ? JSON.stringify(flavorTags) : null,
    notes: notes || null,
    quantity: q,
  }).returning();

  res.status(201).json(serializeTea(row));
});

router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.select().from(teas)
    .where(and(eq(teas.id, id), isNull(teas.deletedAt)))
    .get();
  if (!existing) return res.status(404).json({ error: 'Tea not found' });

  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  for (const field of ['name', 'brand', 'type', 'form', 'caffeine', 'notes'] as const) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (req.body.quantity !== undefined) {
    const n = Number(req.body.quantity);
    updates.quantity = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }
  if (req.body.flavorTags !== undefined) {
    updates.flavorTags = Array.isArray(req.body.flavorTags) && req.body.flavorTags.length
      ? JSON.stringify(req.body.flavorTags)
      : null;
  }

  const [row] = await db.update(teas).set(updates).where(eq(teas.id, id)).returning();
  res.json(serializeTea(row));
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.select().from(teas)
    .where(and(eq(teas.id, id), isNull(teas.deletedAt)))
    .get();
  if (!existing) return res.status(404).json({ error: 'Tea not found' });

  const now = new Date().toISOString();
  await db.update(teas).set({ deletedAt: now, updatedAt: now }).where(eq(teas.id, id));

  if (existing.imageUrl) {
    await fs.promises.unlink(path.join(IMAGES_DIR, existing.imageUrl)).catch(() => {});
  }
  res.json({ ok: true });
});

router.post('/:id/image', upload.single('image'), async (req, res) => {
  const id = Number(req.params.id);
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });

  const existing = await db.select().from(teas)
    .where(and(eq(teas.id, id), isNull(teas.deletedAt)))
    .get();
  if (!existing) return res.status(404).json({ error: 'Tea not found' });

  try {
    const filename = await compressAndStore(req.file);
    const oldImage = existing.imageUrl;
    const [row] = await db.update(teas)
      .set({ imageUrl: filename, updatedAt: new Date().toISOString() })
      .where(eq(teas.id, id))
      .returning();
    if (oldImage) {
      await fs.promises.unlink(path.join(IMAGES_DIR, oldImage)).catch(() => {});
    }
    res.json(serializeTea(row));
  } catch (err) {
    console.error('Image upload error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Upload failed' });
  }
});

export default router;
