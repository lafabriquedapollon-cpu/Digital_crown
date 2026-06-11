/**
 * TreatmentSelector.tsx
 * Modal de sélection des traitements - Elite Data Table Edition
 * Design Premium Onyx & Ghost Intelligence
 */
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Check, Clock, Zap, Search, Plus, Star } from 'lucide-react';
import type { ToothNumberFDI, ToothTreatment, ToothSurface } from './types';
import { TOOTH_NAMES } from './types';
import { PriceBrain, type ActHistory } from './PriceBrain';
import { cn } from '../../utils/cn';
import { useCatalogStore } from '../../features/admin/Settings/hooks/useCatalogStore';

interface TreatmentSelectorProps {
  toothNumber: ToothNumberFDI;
  currentTreatments: ToothTreatment[];
  onConfirm: (treatments: ToothTreatment[], surfaces: ToothSurface[], notes: string) => void;
  onCancel: () => void;
  embedded?: boolean;
}

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  CONSERVATRICE: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  ENDODONTIE: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  CHIRURGIE: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
  PROTHESE: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  PREVENTION: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  PARODONTOLOGIE: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', dot: 'bg-teal-500' },
  ESTHETIQUE: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },
  ORTHODONTIE: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', dot: 'bg-sky-500' },
};

const getFallbackSuggestions = (): Omit<ToothTreatment, 'price'>[] => [
  { id: 'prev-det', name: 'Détartrage complet', category: 'PREVENTION', scope: 'GLOBAL', duration: 30 },
  { id: 'chir-ext-s', name: 'Extraction simple', category: 'CHIRURGIE', scope: 'UNITAIRE', duration: 20 },
  { id: 'comp-1', name: 'Composite 1 face', category: 'CONSERVATRICE', scope: 'UNITAIRE', duration: 20 },
  { id: 'comp-2', name: 'Composite 2 faces', category: 'CONSERVATRICE', scope: 'UNITAIRE', duration: 30 },
  { id: 'endo-mono', name: 'Traitement canalaire mono', category: 'ENDODONTIE', scope: 'UNITAIRE', duration: 45 },
  { id: 'prost-cm', name: 'Couronne Céramo-métallique', category: 'PROTHESE', scope: 'UNITAIRE', duration: 60 },
  { id: 'prost-zirc', name: 'Couronne Zircone Premium', category: 'PROTHESE', scope: 'UNITAIRE', duration: 60 },
];

const SURFACES: { code: ToothSurface; label: string }[] = [
  { code: 'M', label: 'Mésiale' },
  { code: 'O', label: 'Occlusale' },
  { code: 'D', label: 'Distale' },
  { code: 'V', label: 'Vestibulaire' },
  { code: 'P', label: 'Palatine/Linguale' },
];

export const TreatmentSelector: React.FC<TreatmentSelectorProps> = ({
  toothNumber,
  currentTreatments,
  onConfirm,
  onCancel,
  embedded = false,
}) => {
  const [selectedTreatments, setSelectedTreatments] = useState<ToothTreatment[]>(currentTreatments);
  const [treatmentPrices, setTreatmentPrices] = useState<Record<string, number>>({});
  const [selectedSurfaces, setSelectedSurfaces] = useState<ToothSurface[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('FREQUENTS');
  const [notes, setNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const [showAddAct, setShowAddAct] = useState(false);
  const [newActName, setNewActName] = useState('');
  const [newActPrice, setNewActPrice] = useState('');
  const [addingAct, setAddingAct] = useState(false);
  const { specialties, fetchCatalog, createAct } = useCatalogStore();


  const CATEGORY_LABELS = useMemo(() => {
    const labels: Record<string, string> = {};
    specialties.forEach(s => {
      labels[s.name] = s.name;
    });
    return labels;
  }, [specialties]);

  const TREATMENTS_BY_CATEGORY = useMemo(() => {
    const treatments: Record<string, Omit<ToothTreatment, 'price'>[]> = {};
    specialties.forEach(s => {
      treatments[s.name] = s.acts.map(act => ({
        id: `act_${act.id}`,
        name: act.name,
        category: s.name as any,
        scope: 'UNITAIRE',
        duration: 30,
        code: act.code,
      }));
    });
    return treatments;
  }, [specialties]);

  const TREATMENT_TEMPLATES = useMemo(() => {
    return Object.values(TREATMENTS_BY_CATEGORY).flat();
  }, [TREATMENTS_BY_CATEGORY]);

  useEffect(() => {
    if (specialties.length === 0) {
      fetchCatalog();
    }
  }, [fetchCatalog, specialties.length]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    if (!embedded) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [embedded]);

  const toothName = TOOTH_NAMES[toothNumber];
  
  const frequentActs = useMemo(() => {
    const top = PriceBrain.getTopFrequent(7);
    return top.length > 0 ? top : getFallbackSuggestions();
  }, []);

  const toggleTreatment = (template: any) => {
    const id = template.id || `brain_${template.name}`;
    const exists = selectedTreatments.find(t => (t.id === id) || (t.name === template.name));
    
    if (exists) {
      setSelectedTreatments(prev => prev.filter(t => (t.id !== id) && (t.name !== template.name)));
    } else {
      const price = treatmentPrices[id] || PriceBrain.suggestPrice(template.name) || 0;
      setSelectedTreatments(prev => [...prev, { ...template, id, price }]);
    }
  };

  const updateTreatmentPrice = (id: string, price: number) => {
    const treatment = selectedTreatments.find(t => t.id === id);
    setTreatmentPrices(prev => ({ ...prev, [id]: price }));
    setSelectedTreatments(prev => prev.map(t => t.id === id ? { ...t, price } : t));
    if (treatment) PriceBrain.recordAct(treatment.name, price, treatment.category, id);
  };

  const toggleSurface = (code: ToothSurface) => {
    setSelectedSurfaces(prev => 
      prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code]
    );
  };

  const totalPrice = useMemo(() => 
    selectedTreatments.reduce((sum, t) => sum + (t.price || 0), 0)
  , [selectedTreatments]);

  const containerClasses = embedded 
    ? "w-full h-full flex flex-col overflow-hidden bg-slate-900"
    : "fixed inset-0 z-[100000] flex items-center justify-center p-4 md:p-10 bg-slate-800/40 backdrop-blur-md";

  const modalClasses = embedded
    ? "w-full h-full flex flex-col overflow-hidden"
    : "bg-white/95 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_32px_128px_rgba(0,0,0,0.3)] w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border border-white/50";

  const content = (
    <div className={containerClasses}>
      <motion.div
        initial={embedded ? { opacity: 0, x: 20 } : { opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
        exit={embedded ? { opacity: 0, x: 20 } : { opacity: 0, scale: 0.9, y: 40 }}
        className={modalClasses}
      >
        {/* Elite Header */}
        <div className="bg-slate-900 px-8 py-6 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent pointer-events-none" />
          <div className="flex items-center gap-6 relative z-10">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-2xl font-black text-white border border-white/10 shadow-2xl">
              {toothNumber}
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tighter">Dent {toothNumber}</h2>
              <p className="text-slate-400 font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                {toothName} • Assistant Intelligence
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/10 group relative z-10">
            <X className="w-6 h-6 text-white/60 group-hover:text-white transition-colors" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* Left: Table Area */}
          <div className={cn("flex-1 flex flex-col min-w-0", embedded ? "bg-white/5" : "bg-slate-50/30")}>
            
            {/* Toolbar */}
            <div className="p-6 pb-0 shrink-0 flex flex-col gap-4 mb-4">
              <div className="relative w-full group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  placeholder="Rechercher un acte (Composite, Extraction, Couronne...)"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value.length > 0) setActiveCategory('SEARCH');
                    else setActiveCategory('FREQUENTS');
                  }}
                  className={cn(
                    "w-full pl-14 pr-6 py-4 border rounded-2xl text-sm font-bold focus:ring-4 focus:ring-primary/10 transition-all shadow-sm",
                    embedded ? "bg-white/10 border-white/10 text-white placeholder:text-white/20" : "bg-white border-slate-200 text-slate-800"
                  )}
                />
              </div>
              
              <div className="flex flex-wrap bg-slate-200/50 p-1.5 rounded-2xl gap-1">
                  <button
                    onClick={() => { setActiveCategory('FREQUENTS'); setSearchQuery(''); }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      activeCategory === 'FREQUENTS' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >Favoris</button>
                  <button
                    onClick={() => { setActiveCategory('ALL'); setSearchQuery(''); }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      activeCategory === 'ALL' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >Tous les actes</button>
                  {Object.keys(TREATMENTS_BY_CATEGORY).map(cat => (
                    <button
                      key={cat}
                      onClick={() => { setActiveCategory(cat); setSearchQuery(''); }}
                      className={cn(
                        "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                        activeCategory === cat ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >{CATEGORY_LABELS[cat]}</button>
                  ))}
                </div>
            </div>

            {/* Elite Data Table */}
            <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
              <div className={cn("rounded-3xl border shadow-sm overflow-hidden", embedded ? "bg-white/5 border-white/5" : "bg-white border-slate-200")}>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-12 text-center">État</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-auto">Acte</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-24 text-center">Durée</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32 text-right">Prix</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(() => {
                      let items = [];
                      if (activeCategory === 'SEARCH') items = TREATMENT_TEMPLATES.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
                      else if (activeCategory === 'FREQUENTS') items = frequentActs;
                      else if (activeCategory === 'ALL') items = TREATMENT_TEMPLATES;
                      else items = TREATMENTS_BY_CATEGORY[activeCategory] || [];

                      return (items as (ActHistory | Omit<ToothTreatment, 'price'>)[]).map(template => {
                        const id = template.id || `brain_${template.name}`;
                        const isSelected = selectedTreatments.some(t => t.id === id || t.name === template.name);
                        const currentPrice = treatmentPrices[id] || PriceBrain.suggestPrice(template.name) || 0;
                        const colors = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.CONSERVATRICE;

                        return (
                          <tr 
                            key={id}
                            onClick={() => toggleTreatment(template)}
                            className={cn(
                              "group cursor-pointer transition-colors",
                              isSelected ? (embedded ? "bg-primary/20" : `${colors.bg}/40`) : (embedded ? "hover:bg-white/10" : "hover:bg-slate-50/80")
                            )}
                          >
                            <td className="px-6 py-3.5 text-center">
                              <div className={cn(
                                "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all mx-auto",
                                isSelected ? "bg-primary border-primary text-white scale-110 shadow-lg shadow-primary/20" : "border-slate-200 bg-white"
                              )} style={isSelected ? { backgroundColor: 'var(--primary)', borderColor: 'var(--primary)' } : {}}>
                                {isSelected && <Check size={14} strokeWidth={4} />}
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <span className={cn("w-2 h-2 rounded-full shrink-0", colors.dot)} />
                                <div>
                                                                  <p className={cn("font-bold text-sm leading-tight", embedded ? "text-white" : "text-slate-800")}>{template.name}</p>
                                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter mt-0.5">
                                    {CATEGORY_LABELS[template.category] || template.category}
                                  </p>
                                </div>
                                {activeCategory === 'FREQUENTS' && <Star size={12} className="text-amber-400 fill-amber-400" />}
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              {template.duration ? (
                                <div className={cn("flex items-center gap-1.5 text-xs font-bold", embedded ? "text-white/40" : "text-slate-500")}>
                                  <Clock size={12} className={embedded ? "text-white/20" : "text-slate-300"} />
                                  {template.duration} min
                                </div>
                              ) : <span className="text-slate-300">-</span>}
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              {isSelected ? (
                                <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="number"
                                    value={currentPrice || ''}
                                    onChange={(e) => updateTreatmentPrice(id, Number(e.target.value))}
                                    className="w-24 px-3 py-2 bg-white border-2 border-primary/20 rounded-xl text-right font-black text-primary text-sm outline-none focus:border-primary transition-all"
                                    style={{ color: 'var(--primary)' }}
                                    autoFocus
                                  />
                                </div>
                              ) : (
                                <span className="font-bold text-slate-400 text-sm">{currentPrice > 0 ? `${currentPrice} MAD` : "---"}</span>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
                {activeCategory === 'SEARCH' && searchQuery.length > 2 && (
                   <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-center">
                     <button
                        onClick={() => toggleTreatment({ id: `custom_${Date.now()}`, name: searchQuery, category: 'CONSERVATRICE', scope: 'UNITAIRE' })}
                        className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-black text-slate-500 hover:text-primary hover:border-primary transition-all shadow-sm group"
                     >
                       <Plus size={16} className="group-hover:rotate-90 transition-transform" />
                       Créer l'acte "{searchQuery}"
                     </button>
                   </div>
                )}

                {/* Add act inline — visible when on a specific specialty tab */}
                {!['FREQUENTS', 'ALL', 'SEARCH'].includes(activeCategory) && (() => {
                  const spec = specialties.find(s => s.name === activeCategory);
                  if (!spec) return null;
                  return (
                    <div className="p-4 bg-slate-50/50 border-t border-slate-100">
                      {!showAddAct ? (
                        <button
                          onClick={() => { setShowAddAct(true); setNewActName(''); setNewActPrice(''); }}
                          className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-dashed border-slate-200 rounded-2xl text-xs font-black text-slate-400 hover:text-primary hover:border-primary transition-all group"
                        >
                          <Plus size={14} className="group-hover:rotate-90 transition-transform" />
                          Ajouter un acte à {activeCategory}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Nom de l'acte..."
                            value={newActName}
                            onChange={e => setNewActName(e.target.value)}
                            className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-primary transition-all"
                          />
                          <input
                            type="number"
                            placeholder="Prix MAD"
                            value={newActPrice}
                            onChange={e => setNewActPrice(e.target.value)}
                            className="w-24 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-right text-slate-800 outline-none focus:border-primary transition-all"
                          />
                          <button
                            disabled={!newActName.trim() || addingAct}
                            onClick={async () => {
                              if (!newActName.trim()) return;
                              setAddingAct(true);
                              await createAct(spec.id, { name: newActName.trim(), base_price: Number(newActPrice) || 0 });
                              await fetchCatalog();
                              setShowAddAct(false);
                              setNewActName('');
                              setNewActPrice('');
                              setAddingAct(false);
                            }}
                            className="px-4 py-2.5 bg-primary text-white rounded-xl text-xs font-black disabled:opacity-40 transition-all hover:scale-105 active:scale-95 shadow-md shadow-primary/20"
                            style={{ backgroundColor: 'var(--primary)' }}
                          >
                            {addingAct ? '...' : 'OK'}
                          </button>
                          <button
                            onClick={() => setShowAddAct(false)}
                            className="px-3 py-2.5 bg-slate-100 text-slate-500 rounded-xl text-xs font-black hover:bg-slate-200 transition-all"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Right: Elite Panel */}
          <div className={cn("w-full lg:w-[18rem] border-l p-8 flex flex-col shrink-0 overflow-y-auto custom-scrollbar", embedded ? "bg-white/5 border-white/5" : "bg-white border-slate-100")}>
            <div className="mb-10 flex-1">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Notes Cliniques</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={cn(
                  "w-full h-48 p-6 border-none rounded-3xl text-sm font-bold focus:ring-4 focus:ring-primary/5 transition-all outline-none resize-none shadow-inner",
                  embedded ? "bg-white/5 text-white placeholder:text-white/20" : "bg-slate-50 text-slate-700 shadow-inner"
                )}
              />
            </div>

            <div className="pt-8 border-t border-slate-100">
              <div className="flex items-center justify-between mb-8">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Total Devis</span>
                <div className="text-right">
                                    <span className={cn("text-3xl font-black tracking-tighter", embedded ? "text-white" : "text-slate-900")}>{totalPrice}</span>

                  <span className="text-xs font-black text-slate-400 ml-2">MAD</span>
                </div>
              </div>

              <button
                onClick={() => onConfirm(selectedTreatments, selectedSurfaces, notes)}
                disabled={selectedTreatments.length === 0}
                className={cn(
                  "w-full py-6 rounded-3xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-2xl flex items-center justify-center gap-3",
                  selectedTreatments.length > 0
                    ? "bg-primary text-white hover:-translate-y-1 hover:shadow-primary/40 active:scale-95"
                    : "bg-slate-100 text-slate-300 cursor-not-allowed"
                )}
                style={selectedTreatments.length > 0 ? { backgroundColor: 'var(--primary)' } : {}}
              >
                <Check size={20} strokeWidth={3} /> Valider la Sélection
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );

  if (!mounted) return null;
  if (embedded) return content;
  return createPortal(content, document.body);
};

export default TreatmentSelector;
