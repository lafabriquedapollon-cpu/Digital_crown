import React, { useState } from 'react';
import { Search, X, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { MOTIFS_DICTIONARY, MOTIF_URGENCY_LABELS, findCategoryForMotif, type MotifItem } from '../../../data/motifsDictionary';
import { cn } from '../../../utils/cn';

interface MotifSelectorProps {
  selected: string[];
  onChange: (ids: string[]) => void;
  maxSelect?: number;
}

export const MotifSelector: React.FC<MotifSelectorProps> = ({ selected, onChange, maxSelect = 6 }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['DOULEUR', 'URGENCE']));

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggle = (motifId: string) => {
    if (selected.includes(motifId)) {
      onChange(selected.filter(id => id !== motifId));
    } else if (selected.length < maxSelect) {
      onChange([...selected, motifId]);
    }
  };

  const filteredDict = searchQuery.trim()
    ? MOTIFS_DICTIONARY.map(cat => ({
        ...cat,
        motifs: cat.motifs.filter(m => m.label.toLowerCase().includes(searchQuery.toLowerCase())),
      })).filter(cat => cat.motifs.length > 0)
    : MOTIFS_DICTIONARY;

  const hasUrgent = selected.some(id => {
    for (const cat of MOTIFS_DICTIONARY)
      for (const m of cat.motifs)
        if (m.id === id && m.urgency === 'urgence') return true;
    return false;
  });

  return (
    <div className="space-y-3">
      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
          {hasUrgent && (
            <span className="flex items-center gap-1 text-[9px] font-black text-red-600 uppercase tracking-widest bg-red-50 border border-red-200 px-2 py-1 rounded-full animate-pulse">
              <Zap size={9} /> URGENCE DÉTECTÉE
            </span>
          )}
          {selected.map(id => {
            const cat = findCategoryForMotif(id);
            const motif = cat?.motifs.find(m => m.id === id);
            if (!motif || !cat) return null;
            return (
              <span
                key={id}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border', cat.bgColor, cat.color, cat.borderColor)}
              >
                {motif.label}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="hover:opacity-70 transition-opacity ml-0.5"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors px-2 py-1"
            >
              Tout effacer
            </button>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Rechercher un motif..."
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); if (e.target.value) setExpandedCategories(new Set(MOTIFS_DICTIONARY.map(c => c.id))); }}
          className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Limit hint */}
      {selected.length >= maxSelect && (
        <p className="text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
          Maximum {maxSelect} motifs sélectionnés.
        </p>
      )}

      {/* Category list */}
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
        {filteredDict.map(cat => (
          <div key={cat.id} className="border border-slate-100 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCategory(cat.id)}
              className={cn('w-full flex items-center justify-between px-4 py-2.5 font-bold text-sm transition-colors', cat.bgColor, cat.color)}
            >
              <span>{cat.label}</span>
              <div className="flex items-center gap-2">
                {selected.filter(id => cat.motifs.some(m => m.id === id)).length > 0 && (
                  <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded-full bg-white/60')}>
                    {selected.filter(id => cat.motifs.some(m => m.id === id)).length}
                  </span>
                )}
                {expandedCategories.has(cat.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>
            {expandedCategories.has(cat.id) && (
              <div className="bg-white divide-y divide-slate-50">
                {cat.motifs.map(motif => {
                  const isSelected = selected.includes(motif.id);
                  const urgency = MOTIF_URGENCY_LABELS[motif.urgency];
                  return (
                    <button
                      key={motif.id}
                      type="button"
                      onClick={() => toggle(motif.id)}
                      disabled={!isSelected && selected.length >= maxSelect}
                      className={cn(
                        'w-full flex items-center justify-between px-4 py-2.5 text-left transition-all text-sm',
                        isSelected ? cn(cat.bgColor, 'font-bold') : 'hover:bg-slate-50 text-slate-700',
                        !isSelected && selected.length >= maxSelect && 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn('w-4 h-4 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all', isSelected ? cn('border-current', cat.color, cat.bgColor) : 'border-slate-300')}>
                          {isSelected && <div className={cn('w-2 h-2 rounded-sm', cat.color.replace('text-', 'bg-'))} />}
                        </div>
                        <span className={isSelected ? cat.color : ''}>{motif.label}</span>
                      </div>
                      <span className={cn('text-[9px] font-black border px-1.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0', urgency.color)}>
                        {urgency.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
