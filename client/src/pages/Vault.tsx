import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, SlidersHorizontal, LogOut, Leaf, ScanLine, Sparkles, LayoutGrid, List } from 'lucide-react';
import { Link } from 'react-router-dom';
import { teasApi, Tea } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import TeaCard from '../components/TeaCard';
import TeaRow from '../components/TeaRow';
import FilterSheet, { EMPTY_FILTER, FilterState } from '../components/FilterSheet';
import AddTeaDialog from '../components/AddTeaDialog';
import BatchScanDialog from '../components/BatchScanDialog';

type ViewMode = 'grid' | 'list';
const VIEW_STORAGE_KEY = 'teavault-view-mode';

export default function Vault() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Tea | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'grid';
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === 'list' ? 'list' : 'grid';
  });

  const toggleView = () => {
    setViewMode(m => {
      const next = m === 'grid' ? 'list' : 'grid';
      try { window.localStorage.setItem(VIEW_STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  };

  // Fetch without the text query — we filter client-side for snappiness.
  const { data: teas = [], isLoading } = useQuery({
    queryKey: ['teas', {
      type: filter.type || undefined,
      form: filter.form || undefined,
      caffeine: filter.caffeine || undefined,
      inStock: filter.inStockOnly ? true : undefined,
    }],
    queryFn: () => teasApi.list({
      type: filter.type || undefined,
      form: filter.form || undefined,
      caffeine: filter.caffeine || undefined,
      inStock: filter.inStockOnly ? true : undefined,
    }),
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teas;
    return teas.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.brand?.toLowerCase().includes(q) ||
      t.notes?.toLowerCase().includes(q) ||
      t.flavorTags.some(tag => tag.toLowerCase().includes(q)),
    );
  }, [teas, query]);

  const activeFilterCount = [filter.type, filter.form, filter.caffeine]
    .filter(Boolean).length + (filter.inStockOnly ? 0 : 1);

  const onAdd = () => { setEditing(null); setEditorOpen(true); };
  const onOpen = (tea: Tea) => { setEditing(tea); setEditorOpen(true); };
  const onSaved = () => { qc.invalidateQueries({ queryKey: ['teas'] }); };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 px-4 pt-3 pb-2 bg-tea-950/80 backdrop-blur border-b border-tea-800 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Leaf className="w-5 h-5 text-tea-400" />
            <h1 className="text-lg font-semibold text-tea-50">TeaVault</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/assistant"
              className="p-2 -m-2 text-tea-300 hover:text-tea-50"
              title="Call for Iori"
            >
              <Sparkles className="w-5 h-5" />
            </Link>
            {user?.avatarUrl
              ? <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
              : <div className="w-7 h-7 rounded-full bg-tea-700" />}
            <button
              onClick={logout}
              className="p-2 -m-2 text-tea-400 hover:text-tea-100"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-tea-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teas…"
              className="w-full pl-9 pr-3 py-2 bg-tea-900 border border-tea-800 rounded-lg text-sm text-tea-50 placeholder:text-tea-500"
            />
          </div>
          <button
            onClick={toggleView}
            className="px-3 rounded-lg bg-tea-900 border border-tea-800 text-tea-100 shrink-0"
            title={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
            aria-label="Toggle view"
          >
            {viewMode === 'grid' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setFilterOpen(true)}
            className="relative px-3 rounded-lg bg-tea-900 border border-tea-800 text-tea-100 shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-tea-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Grid */}
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {isLoading ? (
          <div className="text-center text-tea-400 text-sm mt-8">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center mt-16 gap-3 text-tea-400">
            <Leaf className="w-12 h-12 text-tea-700" />
            <div className="text-sm">
              {teas.length === 0
                ? 'Your vault is empty. Tap + to add your first tea.'
                : 'No teas match your filters.'}
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {visible.map(tea => (
              <TeaCard key={tea.id} tea={tea} onClick={() => onOpen(tea)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 max-w-3xl mx-auto">
            {visible.map(tea => (
              <TeaRow key={tea.id} tea={tea} onClick={() => onOpen(tea)} />
            ))}
          </div>
        )}
      </main>

      {/* FABs */}
      <div
        className="fixed right-5 z-30 flex flex-col gap-3 items-end"
        style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => setBatchOpen(true)}
          className="h-12 pl-3 pr-4 rounded-full bg-tea-700 hover:bg-tea-600 text-white shadow-lg shadow-black/40 flex items-center gap-2 text-sm font-medium"
          aria-label="Scan layout"
          title="Scan a photo of multiple teas at once"
        >
          <ScanLine className="w-5 h-5" />
          Scan layout
        </button>
        <button
          onClick={onAdd}
          className="w-14 h-14 rounded-full bg-tea-500 hover:bg-tea-400 text-white shadow-lg shadow-black/40 flex items-center justify-center"
          aria-label="Add tea"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      <FilterSheet
        open={filterOpen}
        filter={filter}
        onChange={setFilter}
        onClose={() => setFilterOpen(false)}
      />
      <AddTeaDialog
        open={editorOpen}
        editing={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={onSaved}
      />
      <BatchScanDialog
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        onSaved={onSaved}
      />
    </div>
  );
}
