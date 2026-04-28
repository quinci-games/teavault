import { useEffect, useRef, useState } from 'react';
import { X, Camera, Loader2, CheckSquare, Square, Sparkles, Leaf } from 'lucide-react';
import {
  aiApi, teasApi, base64ToFile,
  BatchScanItem, TeaType, TeaForm, Caffeine,
} from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type Stage = 'capture' | 'analyzing' | 'review' | 'saving' | 'done';

interface EditableItem {
  uid: string;            // client-side stable key
  selected: boolean;
  name: string;
  brand: string;
  type: TeaType | '';
  form: TeaForm | '';
  caffeine: Caffeine | '';
  flavorTags: string[];
  notes: string;
  imageData: string;
  imageMimeType: string;
  status: 'pending' | 'saving' | 'saved' | 'error';
  error?: string;
}

const TYPES: TeaType[] = ['black', 'green', 'white', 'oolong', 'herbal', 'rooibos', 'pu-erh', 'matcha', 'chai', 'other'];
const FORMS: TeaForm[] = ['bagged', 'loose', 'sachet'];
const CAFFEINES: Caffeine[] = ['none', 'low', 'medium', 'high'];

function toEditable(item: BatchScanItem, idx: number): EditableItem {
  const f = item.fields;
  const coerce = <T extends string>(v: unknown, allowed: readonly T[]): T | '' =>
    typeof v === 'string' && allowed.includes(v as T) ? (v as T) : '';
  return {
    uid: `${Date.now()}-${idx}`,
    selected: true,
    name: (f.name ?? '').trim(),
    brand: (f.brand ?? '').trim(),
    type: coerce(f.type, TYPES),
    form: coerce(f.form, FORMS),
    caffeine: coerce(f.caffeine, CAFFEINES),
    flavorTags: Array.isArray(f.flavorTags) ? f.flavorTags.filter(t => typeof t === 'string') : [],
    notes: (f.notes ?? '').trim(),
    imageData: item.imageData,
    imageMimeType: item.imageMimeType,
    status: 'pending',
  };
}

export default function BatchScanDialog({ open, onClose, onSaved }: Props) {
  const [stage, setStage] = useState<Stage>('capture');
  const [items, setItems] = useState<EditableItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ saved: number; failed: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setStage('capture');
      setItems([]);
      setError(null);
      setExpandedUid(null);
      setSummary(null);
      cancelRef.current = false;
    }
  }, [open]);

  const runScan = async (file: File) => {
    setStage('analyzing');
    setError(null);
    try {
      const result = await aiApi.analyzeTeasBatch(file);
      if (!result.items.length) {
        setError(result.message ?? 'No teas detected. Try again with better lighting or fewer items.');
        setStage('capture');
        return;
      }
      setItems(result.items.map(toEditable));
      setStage('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
      setStage('capture');
    }
  };

  const update = (uid: string, patch: Partial<EditableItem>) => {
    setItems(prev => prev.map(it => (it.uid === uid ? { ...it, ...patch } : it)));
  };

  const selectedCount = items.filter(i => i.selected).length;
  const toggleAll = () => {
    const allSelected = items.every(i => i.selected);
    setItems(prev => prev.map(i => ({ ...i, selected: !allSelected })));
  };

  const saveAll = async () => {
    const toSave = items.filter(i => i.selected && i.status !== 'saved');
    if (toSave.length === 0) return;
    setStage('saving');
    cancelRef.current = false;
    let saved = 0;
    let failed = 0;

    for (const item of toSave) {
      if (cancelRef.current) break;
      update(item.uid, { status: 'saving' });
      try {
        if (!item.name.trim()) throw new Error('Name is required');
        const created = await teasApi.create({
          name: item.name.trim(),
          brand: item.brand.trim() || undefined,
          type: item.type || undefined,
          form: item.form || undefined,
          caffeine: item.caffeine || undefined,
          flavorTags: item.flavorTags,
          notes: item.notes.trim() || undefined,
          quantity: 1,
        });
        // Upload the cropped thumbnail as the tea's image.
        const file = base64ToFile(item.imageData, item.imageMimeType, `tea-${created.id}.jpg`);
        await teasApi.uploadImage(created.id, file);
        update(item.uid, { status: 'saved' });
        saved++;
      } catch (err) {
        update(item.uid, { status: 'error', error: err instanceof Error ? err.message : 'Save failed' });
        failed++;
      }
    }

    setSummary({ saved, failed });
    setStage('done');
    onSaved();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={stage === 'capture' ? onClose : undefined}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-4xl bg-tea-950 border border-tea-800 rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[95dvh] animate-slide-up"
      >
        <div className="flex items-center justify-between p-4 border-b border-tea-800 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-tea-50">Scan layout</h2>
            {stage === 'review' && (
              <div className="text-xs text-tea-400">
                {items.length} detected · {selectedCount} selected
              </div>
            )}
            {stage === 'done' && summary && (
              <div className="text-xs text-tea-400">
                {summary.saved} added{summary.failed ? ` · ${summary.failed} failed` : ''}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 -m-2 text-tea-300 hover:text-tea-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Capture */}
        {stage === 'capture' && (
          <div className="p-6 flex flex-col items-center gap-4 safe-area-bottom">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) runScan(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full aspect-video border-2 border-dashed border-tea-700 rounded-xl flex flex-col items-center justify-center gap-3 text-tea-200 hover:border-tea-500 hover:bg-tea-900/40"
            >
              <Camera className="w-10 h-10" />
              <div className="text-sm font-medium">Take a photo of your teas</div>
              <div className="text-xs text-tea-500 max-w-xs text-center px-4">
                Lay boxes out flat with labels facing up. ~10-15 at a time works best.
              </div>
            </button>
            {error && (
              <div className="w-full p-3 rounded-lg bg-red-900/40 border border-red-700 text-red-200 text-sm">{error}</div>
            )}
          </div>
        )}

        {/* Analyzing */}
        {stage === 'analyzing' && (
          <div className="p-12 flex flex-col items-center justify-center gap-4 text-tea-200">
            <Loader2 className="w-10 h-10 animate-spin text-tea-400" />
            <div className="text-sm">Detecting teas…</div>
            <div className="text-xs text-tea-500 text-center max-w-xs">This usually takes 20-60 seconds depending on how many are in the photo.</div>
          </div>
        )}

        {/* Review */}
        {(stage === 'review' || stage === 'saving' || stage === 'done') && (
          <>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-tea-800 shrink-0">
              <button
                onClick={toggleAll}
                disabled={stage !== 'review'}
                className="flex items-center gap-1 text-xs text-tea-300 hover:text-tea-50 disabled:opacity-50"
              >
                {items.every(i => i.selected)
                  ? <CheckSquare className="w-4 h-4" />
                  : <Square className="w-4 h-4" />}
                {items.every(i => i.selected) ? 'Deselect all' : 'Select all'}
              </button>
              <div className="ml-auto text-xs text-tea-400">
                Tap a card to edit fields
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {items.map(item => {
                  const isExpanded = expandedUid === item.uid;
                  return (
                    <div
                      key={item.uid}
                      className={`rounded-xl overflow-hidden border transition-all ${
                        item.selected
                          ? item.status === 'saved' ? 'border-tea-500 bg-tea-900/60'
                          : item.status === 'error' ? 'border-red-700 bg-red-900/30'
                          : 'border-tea-700 bg-tea-900/60'
                          : 'border-tea-900 bg-tea-950 opacity-50'
                      }`}
                    >
                      <div
                        className="relative cursor-pointer"
                        onClick={() => stage === 'review' && update(item.uid, { selected: !item.selected })}
                      >
                        <img
                          src={`data:${item.imageMimeType};base64,${item.imageData}`}
                          alt=""
                          className="w-full aspect-square object-cover"
                          loading="lazy"
                        />
                        <div className="absolute top-2 left-2">
                          {item.selected
                            ? <CheckSquare className="w-5 h-5 text-tea-300 bg-tea-950/80 rounded" />
                            : <Square className="w-5 h-5 text-tea-500 bg-tea-950/80 rounded" />}
                        </div>
                        {item.status === 'saving' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                            <Loader2 className="w-6 h-6 animate-spin text-white" />
                          </div>
                        )}
                        {item.status === 'saved' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-tea-500/30">
                            <div className="text-tea-50 text-xs font-bold bg-tea-500 px-2 py-1 rounded">SAVED</div>
                          </div>
                        )}
                        {item.status === 'error' && item.error && (
                          <div className="absolute bottom-0 left-0 right-0 text-[10px] text-red-100 bg-red-900/80 px-2 py-1 truncate">
                            {item.error}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => setExpandedUid(isExpanded ? null : item.uid)}
                        className="w-full text-left p-2 bg-tea-950/40"
                        disabled={stage !== 'review'}
                      >
                        <div className="text-xs font-medium text-tea-50 truncate">
                          {item.name || <span className="italic text-tea-500">(no name)</span>}
                        </div>
                        {item.brand && <div className="text-[10px] text-tea-400 truncate">{item.brand}</div>}
                      </button>

                      {isExpanded && stage === 'review' && (
                        <div className="p-2 border-t border-tea-800 flex flex-col gap-2 bg-tea-950">
                          <input
                            value={item.name}
                            onChange={(e) => update(item.uid, { name: e.target.value })}
                            placeholder="Name"
                            className="w-full bg-tea-900 border border-tea-800 rounded px-2 py-1 text-xs text-tea-50"
                          />
                          <input
                            value={item.brand}
                            onChange={(e) => update(item.uid, { brand: e.target.value })}
                            placeholder="Brand"
                            className="w-full bg-tea-900 border border-tea-800 rounded px-2 py-1 text-xs text-tea-50"
                          />
                          <div className="grid grid-cols-3 gap-1">
                            <select
                              value={item.type}
                              onChange={(e) => update(item.uid, { type: e.target.value as EditableItem['type'] })}
                              className="bg-tea-900 border border-tea-800 rounded px-1 py-1 text-xs text-tea-50 capitalize"
                            >
                              <option value="">type</option>
                              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <select
                              value={item.form}
                              onChange={(e) => update(item.uid, { form: e.target.value as EditableItem['form'] })}
                              className="bg-tea-900 border border-tea-800 rounded px-1 py-1 text-xs text-tea-50 capitalize"
                            >
                              <option value="">form</option>
                              {FORMS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <select
                              value={item.caffeine}
                              onChange={(e) => update(item.uid, { caffeine: e.target.value as EditableItem['caffeine'] })}
                              className="bg-tea-900 border border-tea-800 rounded px-1 py-1 text-xs text-tea-50 capitalize"
                            >
                              <option value="">caffeine</option>
                              {CAFFEINES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <input
                            value={item.flavorTags.join(', ')}
                            onChange={(e) => update(item.uid, {
                              flavorTags: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                            })}
                            placeholder="Flavor tags (comma-sep)"
                            className="w-full bg-tea-900 border border-tea-800 rounded px-2 py-1 text-xs text-tea-50"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div className="col-span-full py-12 text-center text-tea-500">
                    <Leaf className="w-8 h-8 mx-auto mb-2" />
                    No teas detected.
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 p-4 border-t border-tea-800 shrink-0 safe-area-bottom">
              {stage === 'review' && (
                <>
                  <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-tea-900 border border-tea-800 text-tea-200">
                    Cancel
                  </button>
                  <button
                    onClick={saveAll}
                    disabled={selectedCount === 0}
                    className="flex-[2] py-3 rounded-xl bg-tea-500 text-white font-medium disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Add {selectedCount} {selectedCount === 1 ? 'tea' : 'teas'}
                  </button>
                </>
              )}
              {stage === 'saving' && (
                <>
                  <button
                    onClick={() => { cancelRef.current = true; }}
                    className="flex-1 py-3 rounded-xl bg-tea-900 border border-tea-800 text-tea-200"
                  >
                    Stop
                  </button>
                  <div className="flex-[2] py-3 rounded-xl bg-tea-500/40 text-white text-center flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </div>
                </>
              )}
              {stage === 'done' && (
                <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-tea-500 text-white font-medium">
                  Done
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
