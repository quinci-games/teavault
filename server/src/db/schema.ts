import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const timestamps = {
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
};

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').unique().notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  role: text('role', { enum: ['admin', 'user'] }).default('user').notNull(),
  isAllowed: integer('is_allowed', { mode: 'boolean' }).default(false).notNull(),
  ...timestamps,
});

export const authSessions = sqliteTable('auth_sessions', {
  sid: text('sid').primaryKey(),
  data: text('data').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const teas = sqliteTable('teas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  brand: text('brand'),
  // 'black' | 'green' | 'white' | 'oolong' | 'herbal' | 'rooibos' | 'pu-erh' | 'matcha' | 'chai' | 'other'
  type: text('type'),
  // 'bagged' | 'loose' | 'sachet'
  form: text('form'),
  // 'hot' | 'iced' | 'either'
  servingTemp: text('serving_temp'),
  // 'none' | 'low' | 'medium' | 'high'
  caffeine: text('caffeine'),
  flavorTags: text('flavor_tags'),       // JSON array
  notes: text('notes'),
  imageUrl: text('image_url'),           // filename only
  quantity: integer('quantity').default(1).notNull(),  // # of boxes/tins on hand
  deletedAt: text('deleted_at'),
  ...timestamps,
}, (t) => ({
  userDeletedIdx: index('teas_user_deleted_idx').on(t.userId, t.deletedAt),
}));

// ─── Chat / AI Assistant ─────────────────────────────────────────────
// Shared across the household — same scoping pattern as `teas`.
export const chatThreads = sqliteTable('chat_threads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id).notNull(),
  title: text('title'),
  deletedAt: text('deleted_at'),
  ...timestamps,
}, (t) => ({
  deletedIdx: index('chat_threads_deleted_idx').on(t.deletedAt),
}));

export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: integer('thread_id').references(() => chatThreads.id).notNull(),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  isPinned: integer('is_pinned', { mode: 'boolean' }).default(false).notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  threadIdx: index('chat_messages_thread_idx').on(t.threadId),
}));

export const savedPrompts = sqliteTable('saved_prompts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id).notNull(),
  label: text('label').notNull(),
  prompt: text('prompt').notNull(),
  deletedAt: text('deleted_at'),
  ...timestamps,
}, (t) => ({
  deletedIdx: index('saved_prompts_deleted_idx').on(t.deletedAt),
}));
