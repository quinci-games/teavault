import session from 'express-session';
import { db } from '../db/index.js';
import { authSessions } from '../db/schema.js';
import { eq, lt } from 'drizzle-orm';

export class SQLiteSessionStore extends session.Store {
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    super();
    this.cleanupInterval = setInterval(() => {
      db.delete(authSessions)
        .where(lt(authSessions.expiresAt, Math.floor(Date.now() / 1000)))
        .run();
    }, 15 * 60 * 1000);
  }

  get(sid: string, cb: (err?: any, session?: session.SessionData | null) => void) {
    db.select().from(authSessions).where(eq(authSessions.sid, sid)).get()
      .then(row => {
        if (!row || row.expiresAt < Math.floor(Date.now() / 1000)) return cb(null, null);
        cb(null, JSON.parse(row.data));
      })
      .catch(err => cb(err));
  }

  set(sid: string, sessionData: session.SessionData, cb?: (err?: any) => void) {
    const maxAge = sessionData.cookie?.maxAge ?? 86400000;
    const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(maxAge / 1000);
    const data = JSON.stringify(sessionData);

    db.select().from(authSessions).where(eq(authSessions.sid, sid)).get()
      .then(existing => {
        if (existing) {
          return db.update(authSessions).set({ data, expiresAt }).where(eq(authSessions.sid, sid)).run();
        }
        return db.insert(authSessions).values({ sid, data, expiresAt }).run();
      })
      .then(() => cb?.())
      .catch(err => cb?.(err));
  }

  destroy(sid: string, cb?: (err?: any) => void) {
    db.delete(authSessions).where(eq(authSessions.sid, sid)).run()
      .then(() => cb?.())
      .catch(err => cb?.(err));
  }

  close() {
    clearInterval(this.cleanupInterval);
  }
}
