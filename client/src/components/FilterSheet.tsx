import { X } from 'lucide-react';
import { TeaType, TeaForm, Caffeine } from '../lib/api';

export interface FilterState {
  type: TeaType | '';
  form: TeaForm | '';
  caffeine: Caffeine | '';
  inStockOnly: boolean;
}

export const EMPTY_FILTER: FilterState = {
  type: '', form: '', caffeine: '', inStockOnly: true,
};

interface Props {
  open: boolean;
  filter: FilterState;
  onChange: (next: FilterState) => void;
  onClose: () => void;
}

const TYPES: TeaType[] = ['black', 'green', 'white', 'oolong', 'herbal', 'rooibos', 'pu-erh', 'matcha', 'chai', 'other'];
const FORMS: TeaForm[] = ['bagged', 'loose', 'sachet'];
const CAFFEINES: Caffeine[] = ['none', 'low', 'medium', 'high'];

function ChipRow<T extends string>({ label, value, options, onPick }: {
  label: string;
  value: T | '';
  options: readonly T[];
  onPick: (v: T | '') => void;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-tea-400 mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onPick('')}
          className={`px-3 py-1.5 rounded-full text-sm ${value === '' ? 'bg-tea-500 text-white' : 'bg-tea-900 text-tea-200 border border-tea-800'}`}
        >
          Any
        </button>
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onPick(opt)}
            className={`px-3 py-1.5 rounded-full text-sm capitalize ${value === opt ? 'bg-tea-500 text-white' : 'bg-tea-900 text-tea-200 border border-tea-800'}`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FilterSheet({ open, filter, onChange, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-tea-950 border border-tea-800 rounded-t-2xl sm:rounded-2xl p-6 max-h-[90dvh] overflow-y-auto animate-slide-up safe-area-bottom"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-tea-50">Filters</h2>
          <button onClick={onClose} className="p-2 -m-2 text-tea-300 hover:text-tea-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          <label className="flex items-center justify-between">
            <span className="text-sm text-tea-100">In-stock only</span>
            <input
              type="checkbox"
              checked={filter.inStockOnly}
              onChange={(e) => onChange({ ...filter, inStockOnly: e.target.checked })}
              className="w-5 h-5"
            />
          </label>

          <ChipRow label="Type" value={filter.type} options={TYPES} onPick={(v) => onChange({ ...filter, type: v })} />
          <ChipRow label="Form" value={filter.form} options={FORMS} onPick={(v) => onChange({ ...filter, form: v })} />
          <ChipRow label="Caffeine" value={filter.caffeine} options={CAFFEINES} onPick={(v) => onChange({ ...filter, caffeine: v })} />
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => onChange(EMPTY_FILTER)}
            className="flex-1 py-2.5 rounded-xl bg-tea-900 border border-tea-800 text-tea-200 text-sm"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-tea-500 text-white font-medium text-sm"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
