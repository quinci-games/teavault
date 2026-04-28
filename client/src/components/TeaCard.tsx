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

export default function TeaCard({ tea, onClick }: Props) {
  const src = imageUrl(tea.imageUrl, tea.updatedAt);
  const empty = tea.quantity <= 0;
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col text-left rounded-xl overflow-hidden border transition-all
        ${empty ? 'bg-tea-950 border-tea-900 opacity-50' : 'bg-tea-900/60 border-tea-800 hover:border-tea-600'}`}
    >
      <div className="aspect-square bg-tea-950 flex items-center justify-center overflow-hidden">
        {src ? (
          <img src={src} alt={tea.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <Leaf className="w-10 h-10 text-tea-700" />
        )}
      </div>
      <div className="p-3 flex flex-col gap-1 min-h-0">
        <div className="font-medium text-tea-50 text-sm line-clamp-2 leading-tight">{tea.name}</div>
        {tea.brand && <div className="text-xs text-tea-400 truncate">{tea.brand}</div>}
        {tea.type && (
          <div className="mt-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-tea-800 text-tea-100">
              {TYPE_LABEL[tea.type] ?? tea.type}
            </span>
          </div>
        )}
      </div>
      {empty ? (
        <div className="absolute top-2 right-2 text-[10px] uppercase tracking-wider bg-gray-900/90 text-gray-300 px-2 py-0.5 rounded">
          Out
        </div>
      ) : tea.quantity > 1 ? (
        <div className="absolute top-2 right-2 min-w-[24px] h-6 px-1.5 rounded-full bg-tea-500 text-white text-xs font-semibold flex items-center justify-center shadow">
          ×{tea.quantity}
        </div>
      ) : null}
    </button>
  );
}
