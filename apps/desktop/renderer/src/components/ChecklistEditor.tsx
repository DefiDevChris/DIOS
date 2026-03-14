import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react';

interface ChecklistEditorProps {
  title: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  items: string[];
  onItemsChange: (items: string[]) => void;
}

export default function ChecklistEditor({ title, enabled, onToggle, items, onItemsChange }: ChecklistEditorProps) {
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...items];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    onItemsChange(updated);
  };

  const handleMoveDown = (index: number) => {
    if (index === items.length - 1) return;
    const updated = [...items];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    onItemsChange(updated);
  };

  const handleUpdateItem = (index: number, value: string) => {
    onItemsChange(items.map((item, i) => (i === index ? value : item)));
  };

  const handleDeleteItem = (index: number) => {
    onItemsChange(items.filter((_, i) => i !== index));
  };

  const handleAddItem = () => {
    onItemsChange([...items, '']);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">
          {title}
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onToggle(true)}
            className={`px-3 py-1 rounded-xl text-xs font-medium transition-colors ${
              enabled
                ? 'bg-[#D49A6A] text-white'
                : 'bg-stone-100 text-stone-600'
            }`}
          >
            Enabled
          </button>
          <button
            type="button"
            onClick={() => onToggle(false)}
            className={`px-3 py-1 rounded-xl text-xs font-medium transition-colors ${
              !enabled
                ? 'bg-[#D49A6A] text-white'
                : 'bg-stone-100 text-stone-600'
            }`}
          >
            Disabled
          </button>
        </div>
      </div>

      <div className={enabled ? '' : 'opacity-50 pointer-events-none'}>
        {!enabled ? (
          <div className="text-sm text-stone-400 py-4 text-center border border-dashed border-stone-200 rounded-xl">
            Checklist disabled for this agency
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-stone-400 py-4 text-center border border-dashed border-stone-200 rounded-xl">
            No checklist items
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move up"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === items.length - 1}
                  className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down"
                >
                  <ChevronDown size={16} />
                </button>
                <input
                  type="text"
                  value={item}
                  onChange={(e) => handleUpdateItem(index, e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-colors outline-none"
                  placeholder="Checklist item..."
                />
                <button
                  type="button"
                  onClick={() => handleDeleteItem(index)}
                  className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                  title="Remove item"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {enabled && (
          <button
            type="button"
            onClick={handleAddItem}
            className="mt-3 text-sm font-medium text-[#D49A6A] hover:text-[#c28a5c] transition-colors flex items-center gap-1.5"
          >
            <Plus size={16} />
            Add Item
          </button>
        )}
      </div>
    </div>
  );
}
