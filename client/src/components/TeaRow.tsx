import { Leaf } from 'lucide-react';
import { Tea, imageUrl } from '../lib/api';

interface Props {
  tea: Tea;
  onClick: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  black: 'Black', green: 'Green', white: 'White', oolong: 'Oolong',
  herbal: 'Herbal', rooibos: 'Rooibos', 'pu-erh': 'Pu-erh',
  matcha: 'Matcha', chai: 'Chai', other: 'Other',
};

export default function TeaRow({ tea, onClick }: Props) {
  const src = imageUrl(tea.imageUrl, tea.updatedAt);
  const empty = tea.quantity <= 0;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-lg border p-2 text-left transition-all
        ${empty ? 'bg-tea-950 border-tea-900 opacity-50' : 'bg-tea-900/60 border-tea-800 hover:border-tea-600'}`}
    >
      <div className="shrink-0 w-12 h-12 bg-tea-950 rounded overflow-hidden flex items-center justify-center">
        {src ? (
          <img src={src} alt={tea.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <Leaf className="w-5 h-5 text-tea-700" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-tea-50 text-sm truncate">{tea.name}</div>
        <div className="flex items-center gap-2 text-[11px] text-tea-400 truncate">
          {tea.brand && <span className="truncate">{tea.brand}</span>}
          {tea.brand && tea.type && <span className="text-tea-600">·</span>}
          {tea.type && <span>{TYPE_LABEL[tea.type] ?? tea.type}</span>}
          {tea.caffeine && <span className="text-tea-600">·</span>}
          {tea.caffeine && <span className="capitalize">{tea.caffeine} caffeine</span>}
        </div>
      </div>
      {empty ? (
        <span className="shrink-0 text-[10px] uppercase tracking-wider bg-gray-900 text-gray-400 px-2 py-0.5 rounded">Out</span>
      ) : (
        <span className={`shrink-0 min-w-[28px] h-6 px-2 rounded-full text-xs font-semibold flex items-center justify-center ${
          tea.quantity > 1 ? 'bg-tea-500 text-white' : 'bg-tea-800 text-tea-200'
        }`}>
          ×{tea.quantity}
        </span>
      )}
    </button>
  );
}
