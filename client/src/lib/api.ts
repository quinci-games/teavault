// All API calls go through /tea/api/* so that Caddy's `handle_path /tea/*`
// strips the prefix before proxying to Express. In dev, the Vite proxy
// does the same rewrite so the same URLs work in both environments.
const BASE = '/tea/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = `${body.error} (HTTP ${res.status})`;
    } catch { /* non-JSON */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Types ─────────────────────────────────────────────────────────
export interface User {
  id: number;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'admin' | 'user';
  isAllowed: boolean;
}

export type TeaType = 'black' | 'green' | 'white' | 'oolong' | 'herbal' | 'rooibos' | 'pu-erh' | 'matcha' | 'chai' | 'other';
export type TeaForm = 'bagged' | 'loose' | 'sachet';
export type Caffeine = 'none' | 'low' | 'medium' | 'high';

export interface Tea {
  id: number;
  userId: number;
  name: string;
  brand: string | null;
  type: TeaType | null;
  form: TeaForm | null;
  caffeine: Caffeine | null;
  flavorTags: string[];
  notes: string | null;
  imageUrl: string | null;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeaInput {
  name: string;
  brand?: string;
  type?: TeaType | '';
  form?: TeaForm | '';
  caffeine?: Caffeine | '';
  flavorTags?: string[];
  notes?: string;
  quantity?: number;
}

export interface TeaFilter {
  q?: string;
  type?: TeaType;
  form?: TeaForm;
  caffeine?: Caffeine;
  inStock?: boolean;
}

export interface AiAnalyzeResult {
  name?: string;
  brand?: string;
  type?: TeaType | string;
  form?: TeaForm | string;
  caffeine?: Caffeine | string;
  flavorTags?: string[];
  notes?: string;
}

// ─── API helpers ───────────────────────────────────────────────────
export const authApi = {
  me: () => request<User>('/auth/me'),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  loginUrl: () => `${BASE}/auth/google`,
};

function toQS(filter: TeaFilter): string {
  const params = new URLSearchParams();
  if (filter.q) params.set('q', filter.q);
  if (filter.type) params.set('type', filter.type);
  if (filter.form) params.set('form', filter.form);
  if (filter.caffeine) params.set('caffeine', filter.caffeine);
  if (filter.inStock !== undefined) params.set('inStock', String(filter.inStock));
  const s = params.toString();
  return s ? `?${s}` : '';
}

export const teasApi = {
  list: (filter: TeaFilter = {}) => request<Tea[]>(`/teas${toQS(filter)}`),
  get: (id: number) => request<Tea>(`/teas/${id}`),
  create: (input: TeaInput) => request<Tea>('/teas', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, input: Partial<TeaInput>) =>
    request<Tea>(`/teas/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: number) => request<{ ok: true }>(`/teas/${id}`, { method: 'DELETE' }),
  uploadImage: async (id: number, file: File | Blob) => {
    const fd = new FormData();
    fd.append('image', file);
    return request<Tea>(`/teas/${id}/image`, { method: 'POST', body: fd });
  },
};

export interface BatchScanItem {
  fields: AiAnalyzeResult;
  bbox: { yMin: number; xMin: number; yMax: number; xMax: number };
  imageData: string;      // base64 (no data: prefix)
  imageMimeType: string;
}

export interface BatchScanResponse {
  items: BatchScanItem[];
  originalWidth?: number;
  originalHeight?: number;
  message?: string;
}

export const aiApi = {
  analyzeTea: async (file: File | Blob): Promise<AiAnalyzeResult> => {
    const fd = new FormData();
    fd.append('image', file);
    return request<AiAnalyzeResult>('/ai/analyze-tea', { method: 'POST', body: fd });
  },
  analyzeTeasBatch: async (file: File | Blob): Promise<BatchScanResponse> => {
    const fd = new FormData();
    fd.append('image', file);
    return request<BatchScanResponse>('/ai/analyze-teas-batch', { method: 'POST', body: fd });
  },
};

/** Convert a base64 string + mime into a File for upload. */
export function base64ToFile(base64: string, mimeType: string, filename: string): File {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], filename, { type: mimeType });
}

// ─── Chat / AI Assistant ───────────────────────────────────────────
export interface ChatThread {
  id: number;
  userId: number;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: number;
  threadId: number;
  role: 'user' | 'assistant';
  content: string;
  isPinned: boolean;
  createdAt: string;
}

export interface ChatThreadDetail {
  thread: ChatThread;
  messages: ChatMessage[];
}

export interface SavedPrompt {
  id: number;
  userId: number;
  label: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PinnedMessageEntry {
  message: ChatMessage;
  thread: ChatThread;
}

export const chatApi = {
  listThreads: () => request<ChatThread[]>('/chat/threads'),
  getThread: (id: number) => request<ChatThreadDetail>(`/chat/threads/${id}`),
  createThread: (prompt: string) =>
    request<ChatThreadDetail>('/chat/threads', { method: 'POST', body: JSON.stringify({ prompt }) }),
  sendMessage: (threadId: number, prompt: string) =>
    request<ChatThreadDetail>(`/chat/threads/${threadId}/messages`, { method: 'POST', body: JSON.stringify({ prompt }) }),
  renameThread: (id: number, title: string) =>
    request<ChatThread>(`/chat/threads/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteThread: (id: number) =>
    request<{ ok: true }>(`/chat/threads/${id}`, { method: 'DELETE' }),
  setPinned: (messageId: number, isPinned: boolean) =>
    request<ChatMessage>(`/chat/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ isPinned }) }),
  listPinned: () => request<PinnedMessageEntry[]>('/chat/messages/pinned'),
  listSavedPrompts: () => request<SavedPrompt[]>('/chat/saved-prompts'),
  createSavedPrompt: (label: string, prompt: string) =>
    request<SavedPrompt>('/chat/saved-prompts', { method: 'POST', body: JSON.stringify({ label, prompt }) }),
  updateSavedPrompt: (id: number, body: { label?: string; prompt?: string }) =>
    request<SavedPrompt>(`/chat/saved-prompts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSavedPrompt: (id: number) =>
    request<{ ok: true }>(`/chat/saved-prompts/${id}`, { method: 'DELETE' }),
};

export const imageUrl = (filename: string | null, updatedAt?: string): string | null => {
  if (!filename) return null;
  const bust = updatedAt ? `?t=${encodeURIComponent(updatedAt)}` : '';
  return `${BASE}/images/${filename}${bust}`;
};
