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
 * Build a structured "recently suggested teas" list by matching every
 * inventory tea name against every assistant message in the last 15
 * threads (excluding the current one). The output is a dedup'd, count-
 * and date-stamped checklist the model can treat as a hard avoid list.
 *
 * Rationale: the previous text-snippet approach trimmed responses at
 * 300 chars and only looked at the first assistant message per thread —
 * meaning multi-pick recommendations got decapitated and the model
 * received fuzzy fragments instead of a concrete list. With a daily
 * rotation use-case this caused near-deterministic repeats.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

export async function buildRecentSuggestionsText(excludeThreadId: number): Promise<string> {
  // 1. Inventory tea names — including out-of-stock, since "you suggested
  //    this recently" is independent of whether it's currently on the shelf.
  const inventory = await db.select({ name: teas.name })
    .from(teas)
    .where(isNull(teas.deletedAt));
  const teaNames = Array.from(new Set(
    inventory.map(t => (t.name ?? '').trim()).filter(n => n.length > 0),
  ));
  if (teaNames.length === 0) return '(No teas in inventory yet.)';

  // 2. Last 15 threads excluding the current one. Pulled in updated-desc
  //    order so the first match per tea = most recent suggestion.
  const recentThreads = await db.select()
    .from(chatThreads)
    .where(isNull(chatThreads.deletedAt))
    .orderBy(desc(chatThreads.updatedAt))
    .limit(20);
  const otherThreads = recentThreads.filter(t => t.id !== excludeThreadId).slice(0, 15);
  if (otherThreads.length === 0) return '(No previous suggestions yet.)';

  // 3. Pre-compile word-boundary regexes once. \b avoids false positives
  //    on substring fragments inside larger words.
  const matchers = teaNames.map(name => ({
    name,
    re: new RegExp(`\\b${escapeRegex(name)}\\b`, 'i'),
  }));

  // 4. Walk every assistant message in every thread and tally hits.
  type Hit = { count: number; lastDate: string };
  const hits = new Map<string, Hit>();

  for (const thread of otherThreads) {
    const msgs = await db.select().from(chatMessages)
      .where(and(eq(chatMessages.threadId, thread.id), eq(chatMessages.role, 'assistant')));
    if (msgs.length === 0) continue;
    const fullContent = msgs.map(m => m.content).join('\n');

    for (const m of matchers) {
      if (!m.re.test(fullContent)) continue;
      const existing = hits.get(m.name);
      if (!existing) {
        // First match wins for lastDate because threads are descending.
        hits.set(m.name, { count: 1, lastDate: thread.createdAt });
      } else {
        existing.count += 1;
      }
    }
  }

  if (hits.size === 0) return '(No previous suggestions yet.)';

  // 5. Render as a clean checklist. Map iteration order = first-seen
  //    order = most-recent-first, which is what we want.
  const lines: string[] = [];
  for (const [name, info] of hits.entries()) {
    const dateStr = formatShortDate(info.lastDate);
    const suffix = info.count > 1
      ? ` (${info.count}× recently, last ${dateStr})`
      : ` (last ${dateStr})`;
    lines.push(`- ${name}${suffix}`);
  }
  return lines.join('\n');
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
- RECENTLY SUGGESTED is a HARD AVOID LIST by default. Do NOT recommend any tea on that list. Cycle through the rest of the inventory first — variety is part of your job. Override this rule only when (a) the user explicitly asks for a repeat or names a specific tea, or (b) every alternative in the inventory genuinely fails the request (e.g. user asks for caffeine-free evening picks and only herbal options remain on the avoid list). If you must repeat, briefly acknowledge it and prefer the tea suggested longest ago.
- Keep responses concise and structured. Use markdown (headings, bullet lists) for readability.
- If the cabinet is missing something useful for the request, say so plainly and suggest the household add it rather than inventing a tea.`;

export function buildFullPrompt(inventory: string, recent: string): string {
  return `${SYSTEM_PROMPT}

INVENTORY (in-stock only):
${inventory}

RECENTLY SUGGESTED (hard avoid list — picks made in the last 15 conversations):
${recent}`;
}
