import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  Plus, 
  Trash2, 
  Zap,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Banknote,
  Brain,
  History,
  LayoutGrid,
  ArrowLeft,
  Sparkles,
  Wand2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../utils/cn';
import { OdontogramSVG } from '../../components/odontogram/OdontogramSVG';
import { TreatmentSelector } from '../../components/odontogram/TreatmentSelector';
import { createPortal } from 'react-dom';
import type { SelectedSurfaceData } from '../../components/odontogram/types';
import { api } from '../../services/api';
import type { ValidationError, CoherenceWarning } from './DocumentStudio/useDocumentGenerator';
import { PriceBrain } from '../../components/odontogram/PriceBrain';
import { useAccountingStore, type PriceItem, type InstallmentItem } from './store/useAccountingStore';
import { useCatalogStore } from './Settings/hooks/useCatalogStore';


const detectRegion = (teeth: number[]): string => {
  if (teeth.length === 0) return 'Général';
  const first = teeth[0];
  const q = Math.floor(first / 10);
  const qName = q === 1 ? 'Sup. Droit' : q === 2 ? 'Sup. Gauche' : q === 3 ? 'Inf. Gauche' : q === 4 ? 'Inf. Droit' : q === 5 ? 'Prim. Sup. Droit' : q === 6 ? 'Prim. Sup. Gauche' : q === 7 ? 'Prim. Inf. Gauche' : 'Prim. Inf. Droit';
  const isAnterior = teeth.every(t => [1,2,3].includes(t % 10));
  if (isAnterior) return q <= 2 || q === 5 || q === 6 ? 'Sextant Antérieur Sup.' : 'Sextant Antérieur Inf.';
  const isPosterior = teeth.every(t => [4,5,6,7,8].includes(t % 10));
  if (isPosterior) return `Sextant ${qName}`;
  return `Quadrant ${q}`;
};




interface AccountingStudioProps {
  isDevis?: boolean;
  patientId: string;
  coherenceWarnings?: CoherenceWarning[];
  validationErrors?: { message: string }[];
  setSelectedTeethFromOdontogram: (teeth: SelectedSurfaceData[]) => void;
}


export const AccountingStudio: React.FC<AccountingStudioProps> = ({
  isDevis = false,
  patientId,
  coherenceWarnings = [],
  validationErrors = [],
  setSelectedTeethFromOdontogram,
}) => {
  const {
    items, setItems,
    paymentMode, setPaymentMode,
    showOdontoPanoramique, setShowOdontoPanoramique,
    odontogramMode, setOdontogramMode,
    groupSelectedTeeth, setGroupSelectedTeeth,
    actSuggestions, setActSuggestions,
    activeActSearchId, setActiveActSearchId,
    installments, setInstallments,
    isAccounted, setIsAccounted,
    paymentStatus, setPaymentStatus,
    isGlobalNote, setIsGlobalNote,
    groupTreatmentName, setGroupTreatmentName,
    groupTreatmentPrice, setGroupTreatmentPrice
  } = useAccountingStore();

  const { specialties, fetchCatalog } = useCatalogStore();
  
  React.useEffect(() => {
    if (specialties.length === 0) {
      fetchCatalog();
    }
  }, [fetchCatalog, specialties.length]);

  const TREATMENT_TEMPLATES = React.useMemo(() => {
    return specialties.flatMap(s => s.acts.map(act => ({
      id: act.id.toString(),
      name: act.name,
      category: s.name,
      base_price: act.base_price,
    })));
  }, [specialties]);

  const handleToothDirectClick = (n: number) => setGroupSelectedTeeth(groupSelectedTeeth.includes(n) ? groupSelectedTeeth.filter(x => x !== n) : [...groupSelectedTeeth, n]);
  
  const selectTeethGroup = (g: string) => {
    const max = [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28];
    const mand = [31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48];
    const regions: Record<string, number[]> = {
      'all': [...max, ...mand],
      'maxillaire': max,
      'mandibule': mand,
      'Q1': [11, 12, 13, 14, 15, 16, 17, 18],
      'Q2': [21, 22, 23, 24, 25, 26, 27, 28],
      'Q3': [31, 32, 33, 34, 35, 36, 37, 38],
      'Q4': [41, 42, 43, 44, 45, 46, 47, 48],
      'S1': [14, 15, 16, 17, 18],
      'S2': [13, 12, 11, 21, 22, 23],
      'S3': [24, 25, 26, 27, 28],
      'S4': [34, 35, 36, 37, 38],
      'S5': [33, 32, 31, 41, 42, 43],
      'S6': [44, 45, 46, 47, 48]
    };
    if (regions[g]) setGroupSelectedTeeth(regions[g]);
    else setGroupSelectedTeeth([]);
  };

  const applyGroupTreatment = () => {
    if (!groupTreatmentName.trim() || groupSelectedTeeth.length === 0) return;
    const sorted = [...groupSelectedTeeth].sort((a, b) => a - b);
    setItems((prev: any) => [...prev, { id: Date.now(), description: groupTreatmentName, dent: sorted.join('-'), price: Number(groupTreatmentPrice) || 0, toothNumbers: sorted }]);
    setGroupSelectedTeeth([]);
    setGroupTreatmentName('');
    setGroupTreatmentPrice('');
  };

  const handleTeethFromOdontogram = React.useCallback((teeth: SelectedSurfaceData[]) => {
    setSelectedTeethFromOdontogram(teeth);
    setItems((prev: any) => {
      const activeKeys = new Set(teeth.flatMap(t => t.treatments.map(tr => `${t.toothNumber}::${tr.id}`)));
      const surviving = prev.filter((i: any) => {
        if (i._odontogramKey) return activeKeys.has(i._odontogramKey);
        return i.description.trim() !== '';
      });
      const existingKeys = new Set(surviving.map((i: any) => i._odontogramKey).filter(Boolean));
      const newItems: PriceItem[] = [];
      teeth.forEach(t => {
        t.treatments.forEach(tr => {
          const k = `${t.toothNumber}::${tr.id}`;
          if (!existingKeys.has(k)) {
            newItems.push({
              id: Date.now() + Math.random(),
              description: tr.name, dent: t.toothNumber.toString(),
              price: tr.price, toothNumbers: [t.toothNumber], _odontogramKey: k,
            });
          }
        });
      });
      return [...surviving, ...newItems];
    });
  }, [setSelectedTeethFromOdontogram, setItems]);

  const addEmptyRow = () => setItems((prev: any) => [...prev, { id: Date.now(), description: '', dent: '0', price: 0 }]);
  const removeItem = (id: number) => setItems((prev: any) => prev.filter((i: any) => i.id !== id));
  
  const updateItem = (id: number, f: string, v: string | number) => {
    const newItems = items.map(i => i.id === id ? { ...i, [f]: f === 'price' ? Number(v) : v } : i);
    setItems(newItems);
    const item = newItems.find(i => i.id === id);
    if (item && item.description && item.price > 0 && (f === 'price' || f === 'description')) {
      PriceBrain.recordAct(item.description, item.price, item.category || 'CONSERVATRICE');
    }
  };

  const handleActSearch = async (q: string, id: number) => {
    setItems(items.map(i => i.id === id ? { ...i, description: q } : i));
    if (q.length < 2) { setActSuggestions([]); setActiveActSearchId(null); return; }
    setActiveActSearchId(id);
    
    const localMatches = TREATMENT_TEMPLATES.filter((t: any) => 
      t.name.toLowerCase().includes(q.toLowerCase()) || 
      t.category.toLowerCase().includes(q.toLowerCase())
    ).map((t: any) => ({ 
      id: `template_${t.id}`, 
      name: t.name, 
      base_price: 0, 
      category: t.category, 
      isLocal: true,
      is_habit: false
    }));

    try {
      const res = await api.get(`/actes/search?q=${encodeURIComponent(q)}`);
      const apiMatches = res.data.map((m: any) => ({ ...m, is_habit: true }));
      
      const merged = [...localMatches];
      apiMatches.forEach((am: any) => {
        if (!merged.find(lm => lm.name.toLowerCase() === am.name.toLowerCase())) {
          merged.push(am);
        }
      });
      setActSuggestions(merged);
    } catch {
      setActSuggestions(localMatches);
    }
  };

  const applyActSuggestion = (itemId: number, act: any) => {
    setItems(items.map(i => i.id === itemId ? {
      ...i,
      description: act.name,
      price: act.base_price || 0,
      category: act.category
    } : i));
    setActSuggestions([]);
    setActiveActSearchId(null);
  };

  const handleAIPhaseSequencing = () => {
    const cleanItems = items.filter(i => !i.description.startsWith('--- '));
    const newItems: PriceItem[] = [];
    const assainissement = cleanItems.filter(i => /détartrage|composite|carie|surfaçage|endo|pulpectomie|traitement|obturation/i.test(i.description));
    const chirurgie = cleanItems.filter(i => /extraction|implant|greffe|sinus|lambeau/i.test(i.description));
    const prothese = cleanItems.filter(i => /couronne|bridge|inlay|onlay|facette|prothèse/i.test(i.description));
    const autres = cleanItems.filter(i => !assainissement.includes(i) && !chirurgie.includes(i) && !prothese.includes(i));
    
    let currentId = Date.now();
    const addPhaseTitle = (title: string) => {
        newItems.push({ id: currentId++, description: `--- ${title} ---`, dent: '', price: 0, toothNumbers: [] });
    };

    if (assainissement.length > 0) {
        addPhaseTitle("PHASE 1 : ASSAINISSEMENT");
        newItems.push(...assainissement);
    }
    if (chirurgie.length > 0) {
        addPhaseTitle("PHASE 2 : CHIRURGIE");
        newItems.push(...chirurgie);
    }
    if (prothese.length > 0) {
        if (chirurgie.length > 0) addPhaseTitle("DÉLAI DE CICATRISATION (ESTIMÉ : 3 MOIS)");
        addPhaseTitle("PHASE 3 : PROTHÉTIQUE");
        newItems.push(...prothese);
    }
    if (autres.length > 0) {
        if (newItems.length > 0) addPhaseTitle("AUTRES ACTES");
        newItems.push(...autres);
    }

    setItems(newItems);
    toast.success("Séquençage IA appliqué au devis !");
  };

  const [isOdontoOpen, setIsOdontoOpen] = useState(items.length === 0);
  const [quickActs, setQuickActs] = useState<{ name: string; price: number; category: string }[]>([]);
  const [suggestedBundles, setSuggestedBundles] = useState<{ name: string; price: number; category: string }[]>([]);
  const [odontogramType, setOdontogramType] = useState<'ADULT' | 'PEDIATRIC'>('ADULT');
  const [activeTooth, setActiveTooth] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isTreasuryModalOpen, setIsTreasuryModalOpen] = useState(false);
  

  const fetchQuickActs = async () => {
    try {
      const res = await api.get('/accounting/frequent-acts');
      if (res.data && res.data.length > 0) {
        setQuickActs(res.data);
      } else {
        const top = PriceBrain.getTopFrequent(4);
        setQuickActs(top.length > 0 ? top.map(t => ({ name: t.name, price: t.price || 0, category: t.category })) : [
          { name: 'Consultation', price: 300, category: 'CONSERVATRICE' },
          { name: 'Détartrage', price: 500, category: 'PREVENTION' },
          { name: 'Composite 1 face', price: 400, category: 'CONSERVATRICE' },
          { name: 'Extraction simple', price: 600, category: 'CHIRURGIE' },
        ]);
      }
    } catch (err) {
      console.error("Erreur habitudes acts:", err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchQuickActs();
  }, []);

  useEffect(() => {
    const lastItem = items[items.length - 1];
    if (lastItem && lastItem.description.trim().length > 2) {
      const timer = setTimeout(async () => {
        try {
          const res = await api.post('/actes/catalog/bundles', { act_names: [lastItem.description] });
          setSuggestedBundles(res.data || []);
        } catch (err) {
          console.error("Erreur fetching bundles:", err);
        }
      }, 500);
      return () => clearTimeout(timer);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestedBundles([]);
    }
  }, [items]);

  const saveActAsHabit = async (name: string, price: number, category?: string) => {
    try {
      PriceBrain.recordAct(name, price, category || 'CONSERVATRICE');
      await api.post('/accounting/record-act', { name, price, category });
      fetchQuickActs();
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (items.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsOdontoOpen(true);
    }
  }, [items.length]);

  const labelClass = "text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1.5 ml-1";

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 max-w-[95rem] mx-auto">

      {/* ⚠️ Alertes Section */}
      {(validationErrors.length > 0 || coherenceWarnings.length > 0) && (
        <div className="space-y-2 px-2 mb-6">
          {validationErrors.map((err, idx) => (
            <div key={`v-${idx}`} className="px-6 py-3 bg-red-50 border border-red-100 rounded-2xl text-[11px] text-red-600 font-black flex items-center gap-3 animate-in slide-in-from-top-2">
              <AlertCircle size={16} /> {err.message}
            </div>
          ))}
          {coherenceWarnings.map((w, idx) => (
            <div key={`c-${idx}`} className={cn(
              "px-6 py-3 rounded-2xl text-[11px] font-black flex items-center gap-3 animate-in slide-in-from-top-2",
              w.level === 'warning' ? "bg-amber-50 border border-amber-100 text-amber-700"
                : w.level === 'critical' ? "bg-red-50 border border-red-100 text-red-600"
                : "bg-blue-50 border border-blue-100 text-blue-600"
            )}>
              <AlertCircle size={16} className="shrink-0" /> {w.message}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-10 max-w-5xl mx-auto items-center">
        {/* === ODONTOGRAMME & SUGGESTIONS === */}
        <div className="w-full space-y-6">

      {/* ⚡ Elite Quick Bar : Expandable Pill */}
      <div className="group flex flex-col px-6 py-3 bg-white/50 backdrop-blur-md rounded-[2rem] shadow-sm relative z-20 border border-white opacity-60 hover:opacity-100 hover:bg-white/90 transition-all duration-500 ease-in-out overflow-hidden cursor-pointer max-w-[220px] hover:max-w-4xl max-h-[46px] hover:max-h-[500px] mx-auto hover:shadow-xl">
        
        {/* Title Bar - Always Visible */}
        <div className="flex items-center gap-3 shrink-0 whitespace-nowrap w-full">
          <Zap className="w-5 h-5 text-amber-400 fill-amber-400/20" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Smart Acts</span>
          <span className="ml-auto text-[9px] text-primary opacity-100 group-hover:opacity-0 transition-opacity whitespace-nowrap">Survoler</span>
        </div>

        {/* Buttons - Visible on Hover */}
        <div className="flex flex-wrap gap-2 pt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500 border-t border-slate-100 mt-2">
          {quickActs.map((act, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                setItems([...items.filter(it => it.description.trim()), { id: Date.now()+i, description: act.name, price: act.price, dent: '-', category: act.category }]);
                saveActAsHabit(act.name, act.price, act.category);
              }}
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all flex items-center gap-2 shadow-sm hover:border-primary/30"
            >
              {act.name} <span className="text-primary transition-colors">+{act.price} MAD</span>
            </button>
          ))}
          <button
             onClick={(e) => {
               e.stopPropagation();
               addEmptyRow();
             }}
             className="px-5 py-2.5 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95"
          >
            <Plus size={14} /> Nouvel Acte
          </button>
        </div>
      </div>

        <AnimatePresence>
          {suggestedBundles.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-4 border-t border-slate-100 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Brain className="w-5 h-5 text-primary animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Combo IA Détecté :</span>
                <div className="flex gap-2">
                  {suggestedBundles.map((b, i) => (
                    <span key={i} className="px-2 py-1 bg-slate-50 rounded-lg text-[9px] font-bold text-slate-500">+{b.name}</span>
                  ))}
                </div>
              </div>
              <button 
                onClick={() => {
                  const newItems = [...items];
                  suggestedBundles.forEach(b => {
                    if (!newItems.find(it => it.description.toLowerCase() === b.name.toLowerCase())) {
                      newItems.push({ id: Date.now() + Math.random(), description: b.name, price: b.price, dent: '-', category: b.category });
                    }
                  });
                  setItems(newItems);
                  setSuggestedBundles([]);
                  toast.success("Intelligence appliquée");
                }}
                className="px-6 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl font-black uppercase text-[9px] tracking-[0.2em] hover:bg-primary hover:text-white transition-all"
              >
                Appliquer le Pack
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 🦷 Assistant Odontogramme & Catalogue Split-View */}
      {showOdontoPanoramique && (
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden group">
          <button 
            onClick={() => setIsOdontoOpen(!isOdontoOpen)}
            className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-primary/10 group-hover:text-primary transition-all">
                <LayoutGrid size={20} />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-black text-slate-800 tracking-tight">Studio Clinique Elite</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Odontogramme & Catalogue Ghost</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {groupSelectedTeeth.length > 0 && !isOdontoOpen && (
                <span className="px-4 py-1.5 bg-primary text-white rounded-full text-[9px] font-black uppercase tracking-widest" style={{ backgroundColor: 'var(--primary)' }}>
                  {groupSelectedTeeth.length} Sélectionnée(s)
                </span>
              )}
              {isOdontoOpen ? <ChevronUp size={20} className="text-slate-300" /> : <ChevronDown size={20} className="text-slate-300" />}
            </div>
          </button>

          <AnimatePresence>
            {isOdontoOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="px-4 pb-4"
              >
                <div className="bg-white/60 backdrop-blur-xl rounded-[2.5rem] border border-white/80 shadow-2xl overflow-hidden relative min-h-[450px] flex flex-col">
                  {/* 🛠️ Top Controls : Centered & Clear */}
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white/20">
                    <div className="flex bg-slate-100/50 p-1 rounded-xl border border-slate-100">
                      {(['ADULT', 'PEDIATRIC'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => setOdontogramType(type)}
                          className={cn(
                            "px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                            odontogramType === type ? "bg-white text-slate-900 shadow-sm border border-slate-100" : "text-slate-400 hover:text-slate-600"
                          )}
                        >{type === 'ADULT' ? 'Adulte' : 'Enfant'}</button>
                      ))}
                    </div>

                    <div className="flex bg-slate-100/50 p-1 rounded-xl border border-slate-100">
                      {(['individual', 'group', 'ortho'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => setOdontogramMode(mode)}
                          className={cn(
                            "px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                            odontogramMode === mode ? "bg-white text-slate-900 shadow-sm border border-slate-100" : "text-slate-400 hover:text-slate-600"
                          )}
                        >{mode === 'individual' ? 'Soins Ciblés (1 Dent)' : mode === 'group' ? 'Bridge & Prothèses' : 'Soins Généraux'}</button>
                      ))}
                    </div>

                    <div className="w-24 flex justify-end">
                      <Zap size={14} className="text-primary" />
                    </div>
                  </div>

                  <div className="relative flex-1 flex flex-col p-8 bg-slate-50/20 overflow-hidden">
                    {/* 🧠 Ghost Assistant Tooltip */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
                      <div className="px-5 py-2.5 bg-primary/5 backdrop-blur-md text-primary rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 border border-primary/20 shadow-sm animate-in slide-in-from-top-4">
                        <Brain size={16} className="animate-pulse" />
                        {odontogramMode === 'individual' && "Sélectionnez une dent pour lui associer un soin"}
                        {odontogramMode === 'group' && "Cliquez sur les piliers et inters pour créer un bridge ou un stellite"}
                        {odontogramMode === 'ortho' && "Sélectionnez un acte s'appliquant à l'ensemble de la cavité buccale"}
                      </div>
                    </div>

                    {/* ODONTOGRAMME (Faded in ortho mode) */}
                    <div className={cn(
                      "flex-1 flex flex-col items-center justify-center relative transition-all duration-700",
                      odontogramMode === 'ortho' ? "opacity-10 pointer-events-none scale-95 blur-sm" : "opacity-100 scale-100 blur-none"
                    )}>
                      <div className="w-full flex justify-center items-center">
                        <OdontogramSVG 
                          type={odontogramType} 
                          teethSurfaces={{}}
                          selectedTooth={activeTooth}
                          selectedSurface={null}
                          onSurfaceClick={() => {}}
                          multiSelectedTeeth={groupSelectedTeeth} 
                          onToothDirectClick={(n) => {
                            handleToothDirectClick(n);
                            if (odontogramMode === 'individual') setActiveTooth(n);
                          }} 
                          showNumbers={false}
                          hideSurfaces={true}
                          className="w-full max-w-[480px] drop-shadow-xl"
                        />
                      </div>

                        {/* 🌍 Panneau Soins Généraux (Mode ortho) */}
                        {odontogramMode === 'ortho' && (
                          <div className="absolute inset-0 z-20 flex items-center justify-center p-6 pointer-events-auto">
                             <div className="bg-white/95 backdrop-blur-md rounded-[2rem] shadow-2xl border border-white/50 p-8 w-full max-w-2xl animate-in zoom-in-95 duration-500">
                               <div className="flex items-center justify-between mb-6">
                                 <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                   <Sparkles className="text-primary"/> Soins Généraux
                                 </h3>
                                 <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Actes Globaux</span>
                               </div>
                               <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                  {[
                                    {name: 'Détartrage & Polissage', price: 400, category: 'PREVENTION'},
                                    {name: 'Bilan Parodontal', price: 600, category: 'PARO'},
                                    {name: 'Surfaçage Radiculaire (Secteur)', price: 1500, category: 'PARO'},
                                    {name: 'Blanchiment Dentaire', price: 2500, category: 'ESTHETIQUE'},
                                    {name: 'Semestre ODF', price: 4500, category: 'ORTHO'},
                                    {name: 'Gouttière de Bruxisme', price: 1500, category: 'PROTHESE'},
                                    {name: 'Fluorisation', price: 300, category: 'PREVENTION'},
                                    {name: 'Consultation Standard', price: 300, category: 'CONSERVATRICE'}
                                  ].map(act => (
                                    <button 
                                      key={act.name} 
                                      onClick={() => {
                                        const price = PriceBrain.suggestPrice(act.name) || act.price;
                                        setItems([...items, { id: Date.now() + Math.random(), description: act.name, dent: 'Global', price, category: act.category }]);
                                        toast.success(`Ajouté : ${act.name}`, {
                                          style: { background: '#fff', color: '#1e293b', fontSize: '10px', fontWeight: 'bold', border: '1px solid #f1f5f9' }
                                        });
                                      }} 
                                      className="p-4 bg-white rounded-2xl hover:bg-slate-50 border border-slate-100 hover:border-primary/30 text-left transition-all group/act flex flex-col gap-2 shadow-sm"
                                    >
                                      <span className="text-xs font-bold text-slate-700 group-hover:text-primary transition-colors">{act.name}</span>
                                      <span className="text-[10px] font-black text-slate-400 group-hover:text-primary/70">{PriceBrain.suggestPrice(act.name) || act.price} MAD</span>
                                    </button>
                                  ))}
                               </div>
                             </div>
                          </div>
                        )}

                        {/* 💎 Floating Group Action Bar */}
                        {odontogramMode === 'group' && (
                          <motion.div 
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6 z-20 pointer-events-auto"
                          >
                             <div className="bg-slate-900/95 backdrop-blur-2xl rounded-[2rem] p-5 border border-white/10 shadow-2xl flex flex-col gap-4">
                               {groupSelectedTeeth.length === 0 ? (
                                 <div className="flex flex-col gap-3">
                                   <div className="flex items-center gap-3 text-white">
                                     <Sparkles className="w-4 h-4 text-primary" /> <span className="text-xs font-black uppercase tracking-widest">Sélection Rapide</span>
                                   </div>
                                   <div className="grid grid-cols-4 gap-2">
                                     {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                                        <button key={q} onClick={() => selectTeethGroup(q as any)} className="py-2 bg-white/10 text-slate-300 hover:bg-white/20 rounded-xl text-[10px] font-black tracking-widest">{q}</button>
                                     ))}
                                   </div>
                                   <div className="grid grid-cols-6 gap-2">
                                     {['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(s => (
                                        <button key={s} onClick={() => selectTeethGroup(s as any)} className="py-1.5 bg-white/10 text-slate-300 hover:bg-white/20 rounded-xl text-[9px] font-black tracking-widest">{s}</button>
                                     ))}
                                   </div>
                                 </div>
                               ) : (
                                 <>
                                   <div className="flex items-center justify-between">
                                     <div className="flex items-center gap-3">
                                       <div className="flex -space-x-2">
                                         {groupSelectedTeeth.slice(0, 4).map(n => (
                                           <div key={n} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-[10px] font-black text-white border-2 border-slate-900">{n}</div>
                                         ))}
                                         {groupSelectedTeeth.length > 4 && (
                                           <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-black text-white border-2 border-slate-900">+{groupSelectedTeeth.length - 4}</div>
                                         )}
                                       </div>
                                       <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{groupSelectedTeeth.length} dents sélectionnées</span>
                                     </div>
                                     <button onClick={() => selectTeethGroup('none')} className="text-[9px] font-black text-rose-400 uppercase tracking-widest hover:text-rose-300">Réinitialiser</button>
                                   </div>

                                   <div className="grid grid-cols-3 gap-2">
                                     {['Bridge', 'Stellite', 'Prothèse Adjointe (PAP)', `Curetage (${detectRegion(groupSelectedTeeth)})`, `Surfaçage (${detectRegion(groupSelectedTeeth)})`, 'Attelle de contention'].map(act => (
                                       <button
                                         key={act}
                                         onClick={() => {
                                           const price = PriceBrain.suggestPrice(act) || 0;
                                           setGroupTreatmentName(act);
                                           setGroupTreatmentPrice(price);
                                           const sorted = [...groupSelectedTeeth].sort((a, b) => a - b);
                                           setItems([...items, { id: Date.now() + Math.random(), description: act, dent: sorted.join('-'), price: Number(price), toothNumbers: sorted }]);
                                           selectTeethGroup('none');
                                           setGroupTreatmentName('');
                                           setGroupTreatmentPrice('');
                                           toast.success(`Ajouté : ${act}`);
                                         }}
                                         className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all text-left truncate bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white"
                                       >{act}</button>
                                     ))}
                                   </div>

                                   <div className="flex gap-2 pt-2 border-t border-white/10">
                                     <input 
                                       type="text"
                                       placeholder="Ou saisir un autre acte..."
                                       className="bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-primary/50 flex-1"
                                       value={groupTreatmentName}
                                       onChange={(e) => setGroupTreatmentName(e.target.value)}
                                     />
                                     <input 
                                       type="number"
                                       placeholder="Prix"
                                       className="bg-white/10 border border-white/10 rounded-xl px-3 py-3 text-xs font-bold text-white outline-none focus:border-primary/50 w-24 text-center"
                                       value={groupTreatmentPrice}
                                       onChange={(e) => setGroupTreatmentPrice(e.target.value === '' ? '' : Number(e.target.value))}
                                     />
                                     <button 
                                       onClick={applyGroupTreatment}
                                       className="px-6 bg-primary text-white rounded-xl hover:bg-primary/80 transition-all shadow-lg shadow-primary/20 text-[10px] font-black uppercase tracking-widest"
                                     >
                                       Appliquer
                                     </button>
                                   </div>
                                 </>
                               )}
                             </div>
                          </motion.div>
                        )}
                    </div>

                    {/* MODALE DE SÉLECTION (TREATMENT SELECTOR INTÉGRÉ) */}
                    <AnimatePresence>
                    {activeTooth && (
                      <TreatmentSelector
                        toothNumber={activeTooth as any}
                        currentTreatments={[]}
                        onConfirm={(treatments, surfaces, notes) => {
                          const newItems = [...items];
                          treatments.forEach(t => {
                            newItems.push({
                              id: Date.now() + Math.random(),
                              description: t.name,
                              dent: activeTooth.toString() + (surfaces.length > 0 ? ` (${surfaces.join('')})` : ''),
                              price: t.price || 0,
                              category: t.category,
                              toothNumbers: [activeTooth]
                            });
                            // Ghost Brain apprend le prix saisi (ou suggéré par défaut)
                            if (t.price && t.price > 0) {
                              PriceBrain.recordAct(t.name, t.price, t.category, t.id);
                            }
                          });
                          setItems(newItems);
                          setActiveTooth(null);
                        }}
                        onCancel={() => setActiveTooth(null)}
                        embedded={false}
                      />
                    )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      
        </div> {/* FIN COLONNE GAUCHE */}

        {/* === PANIER & FACTURATION === */}
        <div className="w-full space-y-6">

      {/* 📊 Elite Table : Détail des actes */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/20 overflow-hidden">
        <div className="px-10 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
             <History className="w-5 h-5 text-slate-400" />
             <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Détail des prestations</h3>
          </div>
          <div className="flex items-center gap-4">
            {isDevis && items.length > 0 && (
               <button
                 onClick={handleAIPhaseSequencing}
                 className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 text-indigo-500 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500/20 transition-all"
               >
                 <Wand2 size={12} /> Séquencer avec l'IA
               </button>
            )}
            <button
              onClick={addEmptyRow}
              className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
            >+ Ligne Manuelle</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-16 text-center">#</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Description de l'acte</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32 text-center">Dent</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-44 text-right">Honoraires (MAD)</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <AnimatePresence mode="popLayout">
                {items.map((item, idx) => (
                  <motion.tr
                    key={item.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="group hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-8 py-4 text-center font-black text-slate-300 text-xs">{idx + 1}</td>
                    <td className="px-8 py-4 relative">
                      <div className="relative group/search">
                         <input
                          type="text"
                          className="w-full bg-white border border-slate-100 focus:border-primary/50 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none transition-all"
                          value={item.description}
                          onChange={(e) => {
                            const val = e.target.value;
                            handleActSearch(val, item.id);
                          }}
                          onBlur={() => setTimeout(() => setActiveActSearchId(null), 200)}
                          placeholder="Rechercher ou saisir un acte..."
                        />
                        {activeActSearchId === item.id && actSuggestions.length > 0 && (
                          <div className="absolute top-full left-0 right-0 z-[100] bg-white border border-slate-100 rounded-2xl shadow-2xl mt-2 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            {actSuggestions.map((act) => (
                              <button
                                key={act.id}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => applyActSuggestion(item.id, act)}
                                className="w-full text-left px-5 py-3.5 hover:bg-slate-50 flex items-center justify-between group/suggest border-b border-slate-50 last:border-0"
                              >
                                <div>
                                  <p className="font-bold text-sm text-slate-800">{act.name}</p>
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{act.category || 'GÉNÉRAL'}</p>
                                </div>
                                <span className="font-black text-primary text-sm">{act.base_price} <span className="text-[9px] opacity-40">MAD</span></span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <input
                        type="text"
                        className="w-full bg-slate-50/50 border border-transparent focus:border-slate-200 rounded-xl px-3 py-3 text-center text-sm font-black text-slate-600 outline-none transition-all"
                        value={item.dent}
                        onChange={(e) => updateItem(item.id, 'dent', e.target.value)}
                        placeholder="--"
                      />
                    </td>
                    <td className="px-8 py-4">
                      <div className="relative">
                        <input
                          type="number"
                          className="w-full bg-slate-50/50 border border-transparent focus:border-primary/30 rounded-xl px-4 py-3 text-right text-sm font-black text-primary outline-none transition-all"
                          style={{ color: 'var(--primary)' }}
                          value={item.price || ''}
                          onChange={(e) => updateItem(item.id, 'price', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </td>
                    <td className="px-8 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        
        {/* Résumé & Boutons d'Action (Nouveau) */}
        <div className="px-10 py-6 border-t border-slate-50 bg-slate-50/30 flex flex-col items-end gap-4">
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Total</span>
            <span className="text-xl font-black text-primary">{items.reduce((acc, it) => acc + (Number(it.price) || 0), 0)} MAD</span>
          </div>
          {!isDevis && (
             <button 
                onClick={() => setIsTreasuryModalOpen(true)}
                className="w-full py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-primary/20 flex justify-center items-center gap-2"
             >
                <Banknote size={20} /> Procéder à l'Encaissement
             </button>
          )}
        </div>
      </div>
      
      </div> {/* FIN GRID SPLIT SCREEN */}

      {/* 💰 Ghost Treasury Hub : Light Glassmorphism -> MODAL */}
      <AnimatePresence>
        {!isDevis && isTreasuryModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="p-6 sm:p-10 bg-white rounded-[2rem] sm:rounded-[3rem] border border-white shadow-2xl space-y-6 sm:space-y-10 relative overflow-hidden max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setIsTreasuryModalOpen(false)}
                className="absolute top-6 right-6 w-10 h-10 bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full flex items-center justify-center transition-all z-20"
              >
                <Plus size={24} className="rotate-45" />
              </button>
              
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between relative z-10 gap-6 sm:gap-0">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-primary/10 text-primary rounded-[1.25rem] flex items-center justify-center border border-primary/20 shadow-inner">
                <Banknote size={28} />
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-800 tracking-tight uppercase">Ghost Treasury</h4>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Flux d'encaissement intelligent</p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
               <div className="flex flex-col items-end gap-2">
                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Comptabiliser CA</span>
                  <button 
                   onClick={() => setIsAccounted(!isAccounted)}
                   className={cn(
                     "relative w-14 h-7 rounded-full transition-all duration-500",
                     isAccounted ? "bg-primary" : "bg-slate-100"
                   )}
                  >
                   <div className={cn(
                     "absolute top-1 w-5 h-5 bg-white rounded-full shadow-lg transition-all duration-500",
                     isAccounted ? "left-8" : "left-1"
                   )} />
                  </button>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 pt-4 relative z-10">
            {/* Statut */}
            <div className="space-y-4">
              <label className={cn(labelClass, "text-slate-400")}>Statut de Règlement</label>
              <div className="flex bg-slate-50/50 p-1.5 rounded-[1.5rem] border border-slate-100 gap-1">
                {[
                  { id: 'EN_ATTENTE', label: 'Attente', color: 'text-amber-600 bg-white shadow-sm border border-slate-100' },
                  { id: 'PARTIEL', label: 'Partiel', color: 'text-blue-600 bg-white shadow-sm border border-slate-100' },
                  { id: 'PAYE', label: 'Réglé', color: 'text-emerald-600 bg-white shadow-sm border border-slate-100' }
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setPaymentStatus(s.id)}
                    className={cn(
                      "flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      paymentStatus === s.id ? s.color : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode */}
            <div className="space-y-4">
              <label className={cn(labelClass, "text-slate-400")}>Mode d'Encaissement</label>
              <div className="flex bg-slate-50/50 p-1.5 rounded-[1.5rem] border border-slate-100 gap-1 overflow-x-auto no-scrollbar">
                {['Espèces', 'Chèque', 'TPE', 'Virement'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMode(m as any)}
                    className={cn(
                      "flex-1 px-4 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                      paymentMode === m ? "bg-white text-slate-800 shadow-sm border border-slate-100" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    {m === 'Espèces' ? 'Cash' : m}
                  </button>
                ))}
              </div>
            </div>

            {/* Type */}
            <div className="space-y-4">
              <label className={cn(labelClass, "text-slate-400")}>Structure de Facturation</label>
              <div className="flex bg-slate-50/50 p-1.5 rounded-[1.5rem] border border-slate-100 gap-1">
                <button
                  onClick={() => setIsGlobalNote(false)}
                  className={cn(
                    "flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    !isGlobalNote ? "bg-white text-indigo-600 shadow-sm border border-slate-100" : "text-slate-400 hover:text-slate-600"
                  )}
                >Unique</button>
                <button
                  onClick={() => setIsGlobalNote(true)}
                  className={cn(
                    "flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    isGlobalNote ? "bg-white text-purple-600 shadow-sm border border-slate-100" : "text-slate-400 hover:text-slate-600"
                  )}
                >Global / Planifié</button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {isGlobalNote && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="p-8 bg-slate-50/50 rounded-[2.5rem] border border-slate-100 border-dashed space-y-6 relative z-10"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                    <History className="w-4 h-4 text-primary" /> Configuration des Échéances
                  </span>
                  <button 
                    onClick={() => setInstallments([...installments, { id: Date.now(), date: new Date().toISOString().split('T')[0], amount: 0, label: `Versement ${installments.length + 1}` }])}
                    className="px-4 py-2 bg-white border border-slate-100 rounded-xl text-[9px] font-black text-slate-600 uppercase tracking-widest transition-all hover:bg-slate-50 shadow-sm"
                  >+ Nouvelle Échéance</button>
                </div>
                
                <div className="space-y-4">
                  {installments.map((inst) => (
                    <div key={inst.id} className="flex flex-col sm:grid sm:grid-cols-12 gap-4 sm:gap-4 items-center bg-white p-4 sm:p-0 rounded-2xl sm:bg-transparent">
                      <div className="w-full sm:col-span-5">
                        <input 
                          type="text" 
                          className="w-full px-5 py-3 bg-white sm:bg-white border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-primary/30 transition-all"
                          value={inst.label}
                          onChange={(e) => setInstallments(installments.map(i => i.id === inst.id ? { ...i, label: e.target.value } : i))}
                        />
                      </div>
                      <div className="w-full sm:col-span-3">
                        <input 
                          type="date" 
                          className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-primary/30 transition-all"
                          value={inst.date}
                          onChange={(e) => setInstallments(installments.map(i => i.id === inst.id ? { ...i, date: e.target.value } : i))}
                        />
                      </div>
                      <div className="w-full sm:col-span-3 relative">
                        <input 
                          type="number" 
                          className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black text-primary outline-none focus:border-primary/50 text-right pr-12"
                          value={inst.amount}
                          onChange={(e) => setInstallments(installments.map(i => i.id === inst.id ? { ...i, amount: Number(e.target.value) } : i))}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-300">MAD</span>
                      </div>
                      <div className="w-full sm:col-span-1 flex justify-end sm:justify-center">
                        <button 
                          onClick={() => setInstallments(installments.filter(i => i.id !== inst.id))}
                          className="p-3 text-slate-300 hover:text-rose-400 transition-all bg-rose-50 sm:bg-transparent rounded-xl sm:rounded-none w-full sm:w-auto"
                        >
                          <Trash2 size={16} className="mx-auto" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions Modale Treasury */}
          <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-4 relative z-10">
             <button 
               onClick={() => setIsTreasuryModalOpen(false)}
               className="w-full sm:w-auto px-8 py-3 bg-slate-100 text-slate-500 rounded-xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all text-xs"
             >Fermer</button>
             <button
               onClick={() => {
                 setIsTreasuryModalOpen(false);
                 setGroupSelectedTeeth([]);
                 setOdontogramMode('individual');
                 setItems([{ id: Date.now(), description: '', dent: '0', price: 0 }]);
               }}
               className="w-full sm:w-auto px-8 py-3 bg-primary text-white rounded-xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-xs"
             >Valider la Caisse</button>
          </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
