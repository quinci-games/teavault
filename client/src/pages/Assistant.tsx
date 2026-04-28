import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  ArrowLeft, Send, Sparkles, MessageSquarePlus, Trash2, Pin, PinOff,
  Save, X, Plus, Loader2, BookmarkCheck, Menu, Star,
} from 'lucide-react';
import {
  chatApi, ChatMessage, ChatThread, SavedPrompt,
} from '../lib/api';

type ViewFilter = 'threads' | 'pinned';

export default function Assistant() {
  const qc = useQueryClient();
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<ViewFilter>('threads');
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<SavedPrompt | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const threadsQ = useQuery({
    queryKey: ['chat', 'threads'],
    queryFn: () => chatApi.listThreads(),
  });
  const promptsQ = useQuery({
    queryKey: ['chat', 'saved-prompts'],
    queryFn: () => chatApi.listSavedPrompts(),
  });
  const pinnedQ = useQuery({
    queryKey: ['chat', 'pinned'],
    queryFn: () => chatApi.listPinned(),
    enabled: view === 'pinned',
  });
  const threadQ = useQuery({
    queryKey: ['chat', 'thread', selectedThreadId],
    queryFn: () => chatApi.getThread(selectedThreadId!),
    enabled: selectedThreadId != null,
  });

  const messages = threadQ.data?.messages ?? [];
  const activeThread = threadQ.data?.thread ?? null;

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  const invalidateChat = () => {
    qc.invalidateQueries({ queryKey: ['chat', 'threads'] });
    qc.invalidateQueries({ queryKey: ['chat', 'pinned'] });
    if (selectedThreadId) qc.invalidateQueries({ queryKey: ['chat', 'thread', selectedThreadId] });
  };

  const onSend = async () => {
    const prompt = input.trim();
    if (!prompt || sending) return;
    setSending(true);
    setError(null);
    try {
      if (selectedThreadId == null) {
        const result = await chatApi.createThread(prompt);
        qc.setQueryData(['chat', 'thread', result.thread.id], result);
        setSelectedThreadId(result.thread.id);
      } else {
        const result = await chatApi.sendMessage(selectedThreadId, prompt);
        qc.setQueryData(['chat', 'thread', selectedThreadId], result);
      }
      setInput('');
      qc.invalidateQueries({ queryKey: ['chat', 'threads'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const newThread = () => {
    setSelectedThreadId(null);
    setInput('');
    setError(null);
    setSidebarOpen(false);
  };

  const deleteThread = async (id: number) => {
    if (!confirm('Delete this conversation?')) return;
    await chatApi.deleteThread(id);
    if (id === selectedThreadId) setSelectedThreadId(null);
    invalidateChat();
  };

  const togglePin = async (msg: ChatMessage) => {
    await chatApi.setPinned(msg.id, !msg.isPinned);
    invalidateChat();
  };

  const applySavedPrompt = (p: SavedPrompt) => {
    setInput(prev => prev ? `${prev}\n\n${p.prompt}` : p.prompt);
    setSidebarOpen(false);
  };

  const saveCurrentAsPrompt = () => {
    if (!input.trim()) {
      setError('Type a prompt first, then save it.');
      return;
    }
    setEditingPrompt({ id: 0, userId: 0, label: '', prompt: input.trim(), createdAt: '', updatedAt: '' });
    setPromptEditorOpen(true);
  };

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 px-3 py-2 bg-tea-950/80 backdrop-blur border-b border-tea-800 sticky top-0 z-10 flex items-center gap-2">
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="sm:hidden p-2 -m-2 text-tea-300 hover:text-tea-50"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link to="/" className="p-2 -m-2 text-tea-300 hover:text-tea-50" aria-label="Back to vault">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Sparkles className="w-5 h-5 text-tea-400" />
        <h1 className="text-base font-semibold text-tea-50 truncate">
          {activeThread?.title ?? 'Iori'}
        </h1>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={newThread}
            className="p-2 text-tea-300 hover:text-tea-50"
            title="New conversation"
          >
            <MessageSquarePlus className="w-5 h-5" />
          </button>
          {selectedThreadId != null && (
            <button
              onClick={() => deleteThread(selectedThreadId)}
              className="p-2 text-red-400 hover:text-red-200"
              title="Delete conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside
          className={`shrink-0 bg-tea-950 border-r border-tea-800 w-72 flex flex-col ${
            sidebarOpen ? 'absolute inset-y-0 left-0 z-20 sm:relative sm:flex' : 'hidden sm:flex'
          }`}
          style={{ top: sidebarOpen ? '0' : undefined, height: sidebarOpen ? '100%' : undefined }}
        >
          <div className="flex gap-1 p-2 border-b border-tea-800 shrink-0">
            <button
              onClick={() => setView('threads')}
              className={`flex-1 text-xs py-2 rounded-lg ${view === 'threads' ? 'bg-tea-500 text-white' : 'bg-tea-900 text-tea-300'}`}
            >
              History
            </button>
            <button
              onClick={() => setView('pinned')}
              className={`flex-1 text-xs py-2 rounded-lg flex items-center justify-center gap-1 ${view === 'pinned' ? 'bg-tea-500 text-white' : 'bg-tea-900 text-tea-300'}`}
            >
              <Pin className="w-3 h-3" /> Pinned
            </button>
          </div>

          <div className="flex-1 overflow-y-auto hide-scrollbar">
            {view === 'threads' && (
              <ul className="p-2 flex flex-col gap-1">
                {(threadsQ.data ?? []).map(t => (
                  <ThreadRow
                    key={t.id}
                    thread={t}
                    active={t.id === selectedThreadId}
                    onClick={() => { setSelectedThreadId(t.id); setSidebarOpen(false); }}
                  />
                ))}
                {threadsQ.data?.length === 0 && (
                  <div className="text-xs text-tea-500 px-3 py-4 text-center">
                    No conversations yet.
                  </div>
                )}
              </ul>
            )}
            {view === 'pinned' && (
              <ul className="p-2 flex flex-col gap-2">
                {(pinnedQ.data ?? []).map(({ message, thread }) => (
                  <li key={message.id}>
                    <button
                      onClick={() => { setSelectedThreadId(thread.id); setSidebarOpen(false); }}
                      className="w-full text-left rounded-lg bg-tea-900 border border-tea-800 p-2 hover:border-tea-600"
                    >
                      <div className="flex items-center gap-1 text-xs text-tea-400 mb-1">
                        <Star className="w-3 h-3 text-yellow-400" />
                        <span className="truncate">{thread.title ?? 'Untitled'}</span>
                      </div>
                      <div className="text-xs text-tea-200 line-clamp-3">{message.content}</div>
                    </button>
                  </li>
                ))}
                {pinnedQ.data?.length === 0 && (
                  <div className="text-xs text-tea-500 px-3 py-4 text-center">
                    No pinned responses yet.
                  </div>
                )}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-tea-800 p-2 flex flex-col gap-2 safe-area-bottom">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-tea-500">Saved prompts</div>
              <button
                onClick={() => { setEditingPrompt(null); setPromptEditorOpen(true); }}
                className="p-1 text-tea-300 hover:text-tea-50"
                title="New saved prompt"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto hide-scrollbar">
              {(promptsQ.data ?? []).map(p => (
                <div key={p.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => applySavedPrompt(p)}
                    className="flex-1 text-left text-xs px-2 py-1.5 rounded bg-tea-900 border border-tea-800 text-tea-100 hover:border-tea-600 truncate"
                    title={p.prompt}
                  >
                    {p.label}
                  </button>
                  <button
                    onClick={() => { setEditingPrompt(p); setPromptEditorOpen(true); }}
                    className="p-1 text-tea-400 opacity-0 group-hover:opacity-100"
                    title="Edit"
                  >
                    <BookmarkCheck className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {promptsQ.data?.length === 0 && (
                <div className="text-[11px] text-tea-500 py-2 text-center">
                  No saved prompts. Tap + to create one.
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Chat view */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {selectedThreadId == null && messages.length === 0 ? (
              <EmptyState promptsLength={promptsQ.data?.length ?? 0} />
            ) : (
              <ul className="flex flex-col gap-3 max-w-3xl mx-auto">
                {messages.map(msg => (
                  <Message key={msg.id} msg={msg} onTogglePin={() => togglePin(msg)} />
                ))}
                {sending && (
                  <li className="flex items-center gap-2 text-tea-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Thinking…
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* Saved-prompt quick-fire row (mobile-visible) */}
          {(promptsQ.data?.length ?? 0) > 0 && (
            <div className="shrink-0 px-3 py-1.5 border-t border-tea-800 bg-tea-950/80 flex gap-1.5 overflow-x-auto hide-scrollbar">
              {(promptsQ.data ?? []).map(p => (
                <button
                  key={p.id}
                  onClick={() => applySavedPrompt(p)}
                  className="shrink-0 text-xs px-3 py-1 rounded-full bg-tea-800 text-tea-100 border border-tea-700 hover:border-tea-500"
                  title={p.prompt}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <div className="shrink-0 p-3 border-t border-tea-800 bg-tea-950 safe-area-bottom">
            {error && (
              <div className="mb-2 p-2 rounded bg-red-900/40 border border-red-700 text-red-200 text-xs">{error}</div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                placeholder={selectedThreadId == null
                  ? 'Call for Iori…'
                  : 'Continue the conversation…'}
                rows={2}
                className="flex-1 bg-tea-900 border border-tea-800 rounded-xl px-3 py-2 text-sm text-tea-50 placeholder:text-tea-500 resize-none max-h-40"
              />
              <div className="flex flex-col gap-1">
                <button
                  onClick={saveCurrentAsPrompt}
                  disabled={!input.trim() || sending}
                  className="p-2 rounded-lg bg-tea-900 border border-tea-800 text-tea-300 hover:text-tea-50 disabled:opacity-40"
                  title="Save this prompt for reuse"
                >
                  <Save className="w-4 h-4" />
                </button>
                <button
                  onClick={onSend}
                  disabled={!input.trim() || sending}
                  className="p-2 rounded-lg bg-tea-500 text-white disabled:opacity-40"
                  title="Send (Ctrl+Enter)"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      <SavedPromptEditor
        open={promptEditorOpen}
        prompt={editingPrompt}
        onClose={() => { setPromptEditorOpen(false); setEditingPrompt(null); }}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['chat', 'saved-prompts'] }); }}
      />
    </div>
  );
}

function ThreadRow({ thread, active, onClick }: { thread: ChatThread; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
          active ? 'bg-tea-500 text-white' : 'bg-tea-900 text-tea-100 border border-tea-800 hover:border-tea-600'
        }`}
      >
        <div className="truncate">{thread.title ?? 'Untitled'}</div>
        <div className={`text-[10px] mt-0.5 ${active ? 'text-tea-50/70' : 'text-tea-500'}`}>
          {new Date(thread.updatedAt).toLocaleDateString()}
        </div>
      </button>
    </li>
  );
}

function Message({ msg, onTogglePin }: { msg: ChatMessage; onTogglePin: () => void }) {
  const isUser = msg.role === 'user';
  return (
    <li className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`relative max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'bg-tea-600 text-white rounded-br-sm'
          : 'bg-tea-900 border border-tea-800 text-tea-50 rounded-bl-sm'
      }`}>
        {isUser ? (
          <div className="whitespace-pre-wrap">{msg.content}</div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-headings:text-tea-50 prose-strong:text-tea-50 prose-ul:my-1 prose-p:my-1.5 prose-li:my-0">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        )}
        {!isUser && (
          <button
            onClick={onTogglePin}
            className={`absolute -top-2 -right-2 w-7 h-7 rounded-full border flex items-center justify-center ${
              msg.isPinned
                ? 'bg-yellow-500 border-yellow-400 text-white'
                : 'bg-tea-950 border-tea-700 text-tea-400 hover:text-tea-50'
            }`}
            title={msg.isPinned ? 'Unpin' : 'Pin this response'}
          >
            {msg.isPinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
          </button>
        )}
      </div>
    </li>
  );
}

function EmptyState({ promptsLength }: { promptsLength: number }) {
  const examples = useMemo(() => [
    'Help me pick 3 teas from my stock for morning, midday, and evening.',
    'What\'s a good caffeine-free tea for winding down before bed?',
    'Suggest something fruity for iced brewing.',
  ], []);
  return (
    <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto py-12 gap-4 text-tea-300">
      <Sparkles className="w-12 h-12 text-tea-500" />
      <h2 className="text-xl font-semibold text-tea-50">Iori</h2>
      <p className="text-sm italic text-tea-400">Okaerinasaimase. <span className="text-tea-500 not-italic">&mdash; Welcome home.</span></p>
      <p className="text-sm text-tea-400">
        Your tea butler. He knows the full contents of the cabinet and can advise on a suitable
        selection &mdash; for a moment, a day, or the week ahead. He'll also take care not to
        repeat himself across visits.
      </p>
      {promptsLength === 0 && (
        <div className="w-full mt-2">
          <div className="text-xs uppercase tracking-wider text-tea-500 mb-2">Try asking:</div>
          <ul className="flex flex-col gap-2 text-sm">
            {examples.map((ex, i) => (
              <li key={i} className="px-3 py-2 rounded-lg bg-tea-900 border border-tea-800 text-tea-100 text-left">
                {ex}
              </li>
            ))}
          </ul>
          <div className="text-[11px] text-tea-500 mt-3">
            Tap the save icon next to the send button after typing a prompt to save it for reuse.
          </div>
        </div>
      )}
    </div>
  );
}

function SavedPromptEditor({ open, prompt, onClose, onSaved }: {
  open: boolean;
  prompt: SavedPrompt | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLabel(prompt?.label ?? '');
    setBody(prompt?.prompt ?? '');
    setError(null);
  }, [open, prompt]);

  if (!open) return null;

  const isNew = !prompt?.id;

  const onSave = async () => {
    if (!label.trim() || !body.trim()) { setError('Label and prompt are required.'); return; }
    setSaving(true);
    try {
      if (isNew) await chatApi.createSavedPrompt(label.trim(), body.trim());
      else await chatApi.updateSavedPrompt(prompt!.id, { label: label.trim(), prompt: body.trim() });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!prompt || !confirm('Delete this saved prompt?')) return;
    setSaving(true);
    try {
      await chatApi.deleteSavedPrompt(prompt.id);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-tea-950 border border-tea-800 rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90dvh] animate-slide-up"
      >
        <div className="flex items-center justify-between p-4 border-b border-tea-800 shrink-0">
          <h2 className="text-base font-semibold text-tea-50">{isNew ? 'New saved prompt' : 'Edit saved prompt'}</h2>
          <button onClick={onClose} className="p-2 -m-2 text-tea-300 hover:text-tea-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0 safe-area-bottom">
          <div>
            <label className="text-xs uppercase tracking-wider text-tea-400 mb-1 block">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Daily rotation"
              className="w-full bg-tea-900 border border-tea-800 rounded-lg px-3 py-2 text-sm text-tea-50"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-tea-400 mb-1 block">Prompt</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full bg-tea-900 border border-tea-800 rounded-lg px-3 py-2 text-sm text-tea-50 resize-y"
              placeholder="Help me select 3 teas..."
            />
          </div>
          {error && <div className="p-2 rounded bg-red-900/40 border border-red-700 text-red-200 text-xs">{error}</div>}
        </div>
        <div className="flex gap-2 p-4 border-t border-tea-800 shrink-0 safe-area-bottom">
          {!isNew && (
            <button onClick={onDelete} disabled={saving} className="p-3 rounded-xl bg-red-900/50 border border-red-800 text-red-200 disabled:opacity-50">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-tea-900 border border-tea-800 text-tea-200">Cancel</button>
          <button onClick={onSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-tea-500 text-white font-medium disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
