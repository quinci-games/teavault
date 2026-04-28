import { useEffect, useRef, useState } from 'react';
import { X, Camera, Sparkles, Loader2, RefreshCw, Trash2, Minus, Plus } from 'lucide-react';
import { aiApi, teasApi, Tea, TeaForm, TeaType, Caffeine, imageUrl } from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  editing: Tea | null;
  onSaved: () => void;
}

type FormState = {
  name: string;
  brand: string;
  type: TeaType | '';
  form: TeaForm | '';
  caffeine: Caffeine | '';
  flavorTagsStr: string;
  notes: string;
  quantity: number;
};

const EMPTY: FormState = {
  name: '', brand: '', type: '', form: '', caffeine: '',
  flavorTagsStr: '', notes: '', quantity: 1,
};

const TYPES: TeaType[] = ['black', 'green', 'white', 'oolong', 'herbal', 'rooibos', 'pu-erh', 'matcha', 'chai', 'other'];
const FORMS: TeaForm[] = ['bagged', 'loose', 'sachet'];
const CAFFEINES: Caffeine[] = ['none', 'low', 'medium', 'high'];

function toForm(t: Tea | null): FormState {
  if (!t) return EMPTY;
  return {
    name: t.name,
    brand: t.brand ?? '',
    type: (t.type ?? '') as FormState['type'],
    form: (t.form ?? '') as FormState['form'],
    caffeine: (t.caffeine ?? '') as FormState['caffeine'],
    flavorTagsStr: t.flavorTags.join(', '),
    notes: t.notes ?? '',
    quantity: t.quantity,
  };
}

function Select<T extends string>({ value, onChange, options, placeholder }: {
  value: T | ''; onChange: (v: T | '') => void; options: readonly T[]; placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T | '')}
      className="w-full bg-tea-900 border border-tea-800 rounded-lg px-3 py-2 text-sm text-tea-50 capitalize"
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function AddTeaDialog({ open, onClose, editing, onSaved }: Props) {
  const [state, setState] = useState<FormState>(EMPTY);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setState(toForm(editing));
    setImageFile(null);
    setImagePreview(editing ? imageUrl(editing.imageUrl, editing.updatedAt) : null);
    setError(null);
  }, [open, editing]);

  const applyAiFields = (fields: Awaited<ReturnType<typeof aiApi.analyzeTea>>) => {
    setState(prev => {
      const next = { ...prev };
      if (!next.name && fields.name) next.name = fields.name;
      if (!next.brand && fields.brand) next.brand = fields.brand;
      if (!next.type && fields.type && TYPES.includes(fields.type as TeaType)) next.type = fields.type as TeaType;
      if (!next.form && fields.form && FORMS.includes(fields.form as TeaForm)) next.form = fields.form as TeaForm;
      if (!next.caffeine && fields.caffeine && CAFFEINES.includes(fields.caffeine as Caffeine)) next.caffeine = fields.caffeine as Caffeine;
      if (!next.flavorTagsStr && Array.isArray(fields.flavorTags) && fields.flavorTags.length) {
        next.flavorTagsStr = fields.flavorTags.join(', ');
      }
      if (!next.notes && fields.notes) next.notes = fields.notes;
      return next;
    });
  };

  const runAnalysis = async (file: File) => {
    setAnalyzing(true);
    setError(null);
    try {
      const result = await aiApi.analyzeTea(file);
      applyAiFields(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const onPickImage = async (file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    await runAnalysis(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(editing ? imageUrl(editing.imageUrl, editing.updatedAt) : null);
  };

  const onSave = async () => {
    if (!state.name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tags = state.flavorTagsStr.split(',').map(s => s.trim()).filter(Boolean);
      const payload = {
        name: state.name.trim(),
        brand: state.brand.trim() || undefined,
        type: state.type || undefined,
        form: state.form || undefined,
        caffeine: state.caffeine || undefined,
        flavorTags: tags,
        notes: state.notes.trim() || undefined,
        quantity: Math.max(0, Math.round(state.quantity)),
      };
      const saved = editing
        ? await teasApi.update(editing.id, payload)
        : await teasApi.create(payload);
      if (imageFile) {
        await teasApi.uploadImage(saved.id, imageFile);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!editing) return;
    if (!confirm(`Delete "${editing.name}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await teasApi.remove(editing.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-tea-950 border border-tea-800 rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[95dvh] animate-slide-up"
      >
        <div className="flex items-center justify-between p-4 border-b border-tea-800 shrink-0">
          <h2 className="text-lg font-semibold text-tea-50">{editing ? 'Edit tea' : 'Add tea'}</h2>
          <button onClick={onClose} className="p-2 -m-2 text-tea-300 hover:text-tea-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 min-h-0 safe-area-bottom">
          {/* Image block */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickImage(f);
                e.target.value = '';
              }}
            />
            {imagePreview ? (
              <div className="relative">
                <img src={imagePreview} alt="" className="w-full max-h-64 object-contain rounded-xl bg-tea-900" />
                <div className="absolute top-2 right-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="p-2 rounded-full bg-black/60 hover:bg-black/80 text-white"
                    title="Replace photo"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={clearImage}
                    className="p-2 rounded-full bg-black/60 hover:bg-black/80 text-white"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {analyzing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
                    <div className="flex items-center gap-2 text-white text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing label…
                    </div>
                  </div>
                )}
                {imageFile && !analyzing && (
                  <button
                    type="button"
                    onClick={() => runAnalysis(imageFile)}
                    className="absolute bottom-2 left-2 flex items-center gap-1 px-3 py-1.5 rounded-full bg-tea-500 text-white text-xs font-medium"
                  >
                    <Sparkles className="w-3 h-3" />
                    Re-analyze
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full aspect-video border-2 border-dashed border-tea-700 rounded-xl flex flex-col items-center justify-center gap-2 text-tea-300 hover:border-tea-500 hover:text-tea-100"
              >
                <Camera className="w-8 h-8" />
                <span className="text-sm">Take photo or upload</span>
                <span className="text-xs text-tea-500">AI will fill in the fields</span>
              </button>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="text-xs uppercase tracking-wider text-tea-400 mb-1 block">Name *</label>
            <input
              value={state.name}
              onChange={(e) => setState(s => ({ ...s, name: e.target.value }))}
              className="w-full bg-tea-900 border border-tea-800 rounded-lg px-3 py-2 text-tea-50"
              placeholder="Earl Grey"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-tea-400 mb-1 block">Brand</label>
            <input
              value={state.brand}
              onChange={(e) => setState(s => ({ ...s, brand: e.target.value }))}
              className="w-full bg-tea-900 border border-tea-800 rounded-lg px-3 py-2 text-tea-50"
              placeholder="Twinings"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-tea-400 mb-1 block">Type</label>
              <Select value={state.type} onChange={(v) => setState(s => ({ ...s, type: v }))} options={TYPES} placeholder="—" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-tea-400 mb-1 block">Form</label>
              <Select value={state.form} onChange={(v) => setState(s => ({ ...s, form: v }))} options={FORMS} placeholder="—" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-tea-400 mb-1 block">Caffeine</label>
              <Select value={state.caffeine} onChange={(v) => setState(s => ({ ...s, caffeine: v }))} options={CAFFEINES} placeholder="—" />
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-tea-400 mb-1 block">Flavor tags</label>
            <input
              value={state.flavorTagsStr}
              onChange={(e) => setState(s => ({ ...s, flavorTagsStr: e.target.value }))}
              className="w-full bg-tea-900 border border-tea-800 rounded-lg px-3 py-2 text-tea-50"
              placeholder="bergamot, floral, citrus"
            />
            <div className="text-[11px] text-tea-500 mt-1">Comma-separated</div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-tea-400 mb-1 block">Notes</label>
            <textarea
              value={state.notes}
              onChange={(e) => setState(s => ({ ...s, notes: e.target.value }))}
              rows={3}
              className="w-full bg-tea-900 border border-tea-800 rounded-lg px-3 py-2 text-tea-50 resize-none"
              placeholder="Steep instructions, origin, impressions…"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-tea-900 rounded-lg border border-tea-800">
            <div>
              <div className="text-sm text-tea-100">Quantity</div>
              <div className="text-[11px] text-tea-500">Boxes / tins on hand. Set to 0 when you run out.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setState(s => ({ ...s, quantity: Math.max(0, s.quantity - 1) }))}
                className="w-9 h-9 rounded-lg bg-tea-800 border border-tea-700 text-tea-100 flex items-center justify-center disabled:opacity-40"
                disabled={state.quantity <= 0}
                aria-label="Decrease"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={state.quantity}
                onChange={(e) => setState(s => ({ ...s, quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                className="w-14 text-center bg-tea-900 border border-tea-700 rounded-lg py-1.5 text-tea-50 font-semibold"
              />
              <button
                type="button"
                onClick={() => setState(s => ({ ...s, quantity: s.quantity + 1 }))}
                className="w-9 h-9 rounded-lg bg-tea-800 border border-tea-700 text-tea-100 flex items-center justify-center"
                aria-label="Increase"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-900/40 border border-red-700 text-red-200 text-sm">{error}</div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-tea-800 shrink-0 safe-area-bottom">
          {editing && (
            <button
              onClick={onDelete}
              disabled={saving}
              className="p-3 rounded-xl bg-red-900/50 border border-red-800 text-red-200 disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-tea-900 border border-tea-800 text-tea-200"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-tea-500 text-white font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : editing ? 'Save' : 'Add to vault'}
          </button>
        </div>
      </div>
    </div>
  );
}
