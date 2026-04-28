/**
 * Two-tier Gemini API key support.
 *
 * Set both env vars to get free→paid fallback:
 *   GEMINI_API_KEY                    — primary, tried first
 *   GEMINI_API_KEY_FALLBACK           — used only when primary returns a quota
 *                                       / rate-limit error (HTTP 429 or
 *                                       RESOURCE_EXHAUSTED)
 *   GEMINI_PRIMARY_COOLDOWN_SECONDS   — optional; how long to skip the primary
 *                                       after it 429s (default 60)
 *
 * If only one key is set, fallback is a no-op.
 */

export function getPrimaryGeminiKey(): string | null {
  const k = process.env.GEMINI_API_KEY;
  return k && k.trim() ? k.trim() : null;
}

export function getFallbackGeminiKey(): string | null {
  const k = process.env.GEMINI_API_KEY_FALLBACK;
  return k && k.trim() ? k.trim() : null;
}

function isQuotaError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { status?: unknown; message?: unknown; code?: unknown };
  if (e.status === 429 || e.status === '429') return true;
  if (e.code === 429 || e.code === 'RESOURCE_EXHAUSTED') return true;
  const msg = String(e.message ?? '');
  return /RESOURCE_EXHAUSTED|quota|rate limit|429|Too Many Requests/i.test(msg);
}

let primaryCooldownUntil = 0;
function getCooldownMs(): number {
  const raw = process.env.GEMINI_PRIMARY_COOLDOWN_SECONDS;
  const parsed = raw ? parseInt(raw, 10) : 60;
  if (!Number.isFinite(parsed) || parsed <= 0) return 60_000;
  return parsed * 1000;
}
export function isPrimaryOnCooldown(): boolean {
  return Date.now() < primaryCooldownUntil;
}
export function getPrimaryCooldownRemainingMs(): number {
  return Math.max(0, primaryCooldownUntil - Date.now());
}
export function clearPrimaryCooldown(): void {
  primaryCooldownUntil = 0;
}

/**
 * Run a Gemini call with automatic primary→fallback retry on quota errors.
 * Wrap the WHOLE chain (genAI construction + model + generateContent) inside
 * the callback so model state can be rebuilt with whichever key wins.
 */
export async function withGeminiFallback<T>(fn: (apiKey: string) => Promise<T>): Promise<T> {
  const primary = getPrimaryGeminiKey();
  if (!primary) throw new Error('GEMINI_API_KEY is not configured on the server');
  const fallback = getFallbackGeminiKey();

  if (fallback && isPrimaryOnCooldown()) {
    return await fn(fallback);
  }

  try {
    return await fn(primary);
  } catch (e) {
    if (!fallback) throw e;
    if (!isQuotaError(e)) throw e;
    const cooldownSec = Math.round(getCooldownMs() / 1000);
    primaryCooldownUntil = Date.now() + getCooldownMs();
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[gemini] Primary key hit quota — falling back to GEMINI_API_KEY_FALLBACK and skipping primary for ${cooldownSec}s. Error: ${msg.slice(0, 200)}`);
    return await fn(fallback);
  }
}
