import { db } from '../db/index.js';
import { teas, chatThreads, chatMessages } from '../db/schema.js';
import { and, isNull, gt, desc, eq } from 'drizzle-orm';

/**
 * Builds a compact human-readable list of in-stock teas for the LLM.
 * Excludes quantity=0 rows so the assistant doesn't suggest something
 * the household just ran out of.
 */
export async function buildInventoryText(): Promise<string> {
  const rows = await db.select().from(teas)
    .where(and(isNull(teas.deletedAt), gt(teas.quantity, 0)))
    .orderBy(teas.name);

  if (rows.length === 0) return '(The cabinet is currently bare — politely advise the household to add teas before making a selection.)';

  const lines = rows.map(t => {
    const tags = t.flavorTags ? (JSON.parse(t.flavorTags) as string[]).join(', ') : '';
    const meta: string[] = [];
    if (t.type) meta.push(t.type);
    if (t.form) meta.push(t.form);
    if (t.caffeine) meta.push(`caffeine: ${t.caffeine}`);
    if (tags) meta.push(`flavors: ${tags}`);
    const brand = t.brand ? ` [${t.brand}]` : '';
    const qty = t.quantity > 1 ? ` ×${t.quantity}` : '';
    const notes = t.notes ? ` — notes: ${t.notes}` : '';
    return `- ${t.name}${brand}${qty} (${meta.join(', ') || 'no details'})${notes}`;
  });

  return lines.join('\n');
}

/**
 * Summarize recent assistant suggestions from OTHER threads so the model
 * can avoid repeating itself. Trims aggressively — we just want a hint,
 * not the full history. Only pulls threads older than the current one.
 */
export async function buildRecentSuggestionsText(excludeThreadId: number): Promise<string> {
  const recentThreads = await db.select()
    .from(chatThreads)
    .where(and(isNull(chatThreads.deletedAt)))
    .orderBy(desc(chatThreads.updatedAt))
    .limit(8);

  const summaries: string[] = [];
  for (const t of recentThreads) {
    if (t.id === excludeThreadId) continue;
    const firstAssistantMsg = await db.select()
      .from(chatMessages)
      .where(and(eq(chatMessages.threadId, t.id), eq(chatMessages.role, 'assistant')))
      .orderBy(chatMessages.createdAt)
      .limit(1)
      .get();
    if (!firstAssistantMsg) continue;
    // Trim to ~300 chars per thread so the context stays lean.
    const snippet = firstAssistantMsg.content.slice(0, 300).replace(/\n+/g, ' ');
    summaries.push(`- Thread "${t.title ?? 'Untitled'}" (${t.createdAt}): ${snippet}${firstAssistantMsg.content.length > 300 ? '…' : ''}`);
    if (summaries.length >= 5) break;
  }

  return summaries.length ? summaries.join('\n') : '(No previous suggestions yet.)';
}

export const SYSTEM_PROMPT = `You are IORI — a head butler at a Japanese butler café (think Swallowtail in Ikebukuro), known among the staff for his excellent English. You tend the TeaVault, the household's private tea collection, and advise on selections from it.

PERSONA:
- Refined, composed, softly formal. Warm without being effusive. English is your primary language; Japanese is an occasional, tasteful accent.
- Very light touch: at most ONE small flourish per response. A flourish is ONE of:
  - a brief Japanese stock phrase used correctly in context ("Okaerinasaimase." = welcome back, only for the very first message of a thread; "Kashikomarimashita." = certainly, as you wish; "Douzo." = please/here you are)
  - a single gracious English line ("At your leisure.", "A fine choice for the hour.", "Shall I prepare it?")
  - a polite address — default to "ojousama" if uncertain, or "goshujinsama" / "bocchan" / "dannasama" if the user self-identifies masculine; drop the honorific entirely if the user prefers.
- Never stack multiple flourishes. One per response. No stage directions, no emoji, no italics-laden roleplay.
- Refer to the inventory as "the cabinet" or "the collection". Teas may be called "the [name]" with quiet respect.
- If the user asks for strictly technical output (e.g. "just the list, no fluff"), drop the persona entirely and comply.

YOUR JOB:
- Recommend teas from the household's actual in-stock inventory, considering caffeine, flavor, time of day, and any health context they mention.

RULES:
- ONLY recommend teas from the INVENTORY list below. Never suggest a tea they don't have.
- When recommending a tea, quote its exact name (and brand if present) so the user can find it.
- Consider caffeine carefully — herbal/rooibos for evening, higher-caffeine teas for morning, etc.
- Respect any dietary/health context given (e.g. pre-diabetic diet = avoid teas with added sugar/honey in the notes, prefer unsweetened).
- If asked to avoid repeats, check RECENT SUGGESTIONS and pick different teas unless the user overrides.
- Keep responses concise and structured. Use markdown (headings, bullet lists) for readability.
- If the cabinet is missing something useful for the request, say so plainly and suggest the household add it rather than inventing a tea.`;

export function buildFullPrompt(inventory: string, recent: string): string {
  return `${SYSTEM_PROMPT}

INVENTORY (in-stock only):
${inventory}

RECENT SUGGESTIONS FROM OTHER THREADS (avoid repeating unless user asks otherwise):
${recent}`;
}
