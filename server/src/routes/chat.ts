import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db/index.js';
import { chatThreads, chatMessages, savedPrompts } from '../db/schema.js';
import { eq, and, isNull, desc, asc } from 'drizzle-orm';
import { requireAuth } from '../auth/middleware.js';
import { buildInventoryText, buildRecentSuggestionsText, buildFullPrompt } from '../lib/chatContext.js';
import { withGeminiFallback, getPrimaryGeminiKey } from '../lib/geminiKeys.js';

const router = Router();
router.use(requireAuth);

const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.1-flash-lite-preview';

function titleFromPrompt(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, ' ');
  return trimmed.length > 60 ? trimmed.slice(0, 60) + '…' : trimmed;
}

/**
 * Send the current thread to Gemini and return the assistant reply text.
 * Builds fresh system context each call so the inventory is always current.
 */
async function runGemini(threadId: number): Promise<string> {
  const inventory = await buildInventoryText();
  const recent = await buildRecentSuggestionsText(threadId);
  const systemText = buildFullPrompt(inventory, recent);

  const messages = await db.select().from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(asc(chatMessages.createdAt));

  // Gemini's chat format: roles are 'user' and 'model'. Our DB stores
  // 'user' and 'assistant'. Last user message goes in sendMessage, the
  // rest become history.
  if (messages.length === 0) throw new Error('No messages in thread');
  const last = messages[messages.length - 1];
  if (last.role !== 'user') throw new Error('Last message must be from user');

  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const result = await withGeminiFallback(async (apiKey) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: CHAT_MODEL,
      systemInstruction: systemText,
    });
    const chat = model.startChat({ history });
    return await chat.sendMessage(last.content);
  });
  return result.response.text();
}

// ─── Threads ──────────────────────────────────────────────────────────
router.get('/threads', async (_req, res) => {
  const rows = await db.select().from(chatThreads)
    .where(isNull(chatThreads.deletedAt))
    .orderBy(desc(chatThreads.updatedAt));
  res.json(rows);
});

router.get('/threads/:id', async (req, res) => {
  const id = Number(req.params.id);
  const thread = await db.select().from(chatThreads)
    .where(and(eq(chatThreads.id, id), isNull(chatThreads.deletedAt))).get();
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  const messages = await db.select().from(chatMessages)
    .where(eq(chatMessages.threadId, id))
    .orderBy(asc(chatMessages.createdAt));
  res.json({ thread, messages });
});

router.post('/threads', async (req, res) => {
  const userId = req.session.userId!;
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  if (!getPrimaryGeminiKey()) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' });

  const [thread] = await db.insert(chatThreads).values({
    userId,
    title: titleFromPrompt(prompt),
  }).returning();

  await db.insert(chatMessages).values({
    threadId: thread.id, role: 'user', content: prompt.trim(),
  });

  try {
    const reply = await runGemini(thread.id);
    await db.insert(chatMessages).values({
      threadId: thread.id, role: 'assistant', content: reply,
    });
    await db.update(chatThreads)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(chatThreads.id, thread.id));
  } catch (err) {
    console.error('Chat error:', err);
    // Delete the partial thread so the user can retry cleanly.
    await db.delete(chatMessages).where(eq(chatMessages.threadId, thread.id));
    await db.delete(chatThreads).where(eq(chatThreads.id, thread.id));
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Chat failed' });
  }

  const messages = await db.select().from(chatMessages)
    .where(eq(chatMessages.threadId, thread.id))
    .orderBy(asc(chatMessages.createdAt));
  res.status(201).json({ thread, messages });
});

router.post('/threads/:id/messages', async (req, res) => {
  const id = Number(req.params.id);
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  if (!getPrimaryGeminiKey()) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' });
  const thread = await db.select().from(chatThreads)
    .where(and(eq(chatThreads.id, id), isNull(chatThreads.deletedAt))).get();
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  await db.insert(chatMessages).values({
    threadId: id, role: 'user', content: prompt.trim(),
  });

  try {
    const reply = await runGemini(id);
    await db.insert(chatMessages).values({
      threadId: id, role: 'assistant', content: reply,
    });
    await db.update(chatThreads)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(chatThreads.id, id));
  } catch (err) {
    console.error('Chat error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Chat failed' });
  }

  const messages = await db.select().from(chatMessages)
    .where(eq(chatMessages.threadId, id))
    .orderBy(asc(chatMessages.createdAt));
  res.json({ thread, messages });
});

router.patch('/threads/:id', async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (typeof req.body.title === 'string') updates.title = req.body.title.trim() || null;
  const [row] = await db.update(chatThreads).set(updates).where(eq(chatThreads.id, id)).returning();
  if (!row) return res.status(404).json({ error: 'Thread not found' });
  res.json(row);
});

router.delete('/threads/:id', async (req, res) => {
  const id = Number(req.params.id);
  const now = new Date().toISOString();
  await db.update(chatThreads).set({ deletedAt: now, updatedAt: now }).where(eq(chatThreads.id, id));
  res.json({ ok: true });
});

// ─── Messages: pin/unpin ──────────────────────────────────────────────
router.patch('/messages/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { isPinned } = req.body;
  const [row] = await db.update(chatMessages)
    .set({ isPinned: !!isPinned })
    .where(eq(chatMessages.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: 'Message not found' });
  res.json(row);
});

router.get('/messages/pinned', async (_req, res) => {
  // Join thread + message so the UI can jump to the source thread.
  const rows = await db.select({
    message: chatMessages,
    thread: chatThreads,
  })
    .from(chatMessages)
    .innerJoin(chatThreads, eq(chatMessages.threadId, chatThreads.id))
    .where(and(eq(chatMessages.isPinned, true), isNull(chatThreads.deletedAt)))
    .orderBy(desc(chatMessages.createdAt));
  res.json(rows);
});

// ─── Saved prompts ────────────────────────────────────────────────────
router.get('/saved-prompts', async (_req, res) => {
  const rows = await db.select().from(savedPrompts)
    .where(isNull(savedPrompts.deletedAt))
    .orderBy(desc(savedPrompts.updatedAt));
  res.json(rows);
});

router.post('/saved-prompts', async (req, res) => {
  const userId = req.session.userId!;
  const { label, prompt } = req.body;
  if (!label || !prompt) return res.status(400).json({ error: 'Label and prompt required' });
  const [row] = await db.insert(savedPrompts).values({
    userId, label: label.trim(), prompt: prompt.trim(),
  }).returning();
  res.status(201).json(row);
});

router.patch('/saved-prompts/:id', async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (typeof req.body.label === 'string') updates.label = req.body.label.trim();
  if (typeof req.body.prompt === 'string') updates.prompt = req.body.prompt.trim();
  const [row] = await db.update(savedPrompts).set(updates).where(eq(savedPrompts.id, id)).returning();
  if (!row) return res.status(404).json({ error: 'Prompt not found' });
  res.json(row);
});

router.delete('/saved-prompts/:id', async (req, res) => {
  const id = Number(req.params.id);
  const now = new Date().toISOString();
  await db.update(savedPrompts).set({ deletedAt: now, updatedAt: now }).where(eq(savedPrompts.id, id));
  res.json({ ok: true });
});

export default router;
