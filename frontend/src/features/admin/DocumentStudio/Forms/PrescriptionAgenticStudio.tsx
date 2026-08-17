import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, CheckCircle2, AlertCircle, Zap, RefreshCcw, ChevronRight,
  ShieldCheck, Stethoscope, Loader2, Plus, ChevronDown, Save, Trash2,
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { api } from '../../../../services/api';
import toast from 'react-hot-toast';
import type { ValidationError } from '../useDocumentGenerator';
import { getAgeAwareDosing, estimateWeightFromAge } from '../clinical_rules';

import type { DrugItem } from './prescriptionTypes';
import { FORMES, KIN_PRESET, DEFAULT_MOROCCO_PRESETS, fuzzyMatch } from './prescriptionTypes';
import { DrugRow } from './DrugRow';
import { QuickEntryBar } from './QuickEntryBar';
import { PrescriptionGuideModal } from './PrescriptionGuideModal';

export type { DrugItem };

interface PrescriptionAgenticStudioProps {
  patientId: string;
  drugs: DrugItem[];
  setDrugs: (drugs: DrugItem[]) => void;
  onUpdateDrug: (id: number, field: keyof DrugItem, val: any) => void;
  onRemoveDrug: (id: number) => void;
  onAddDrug: () => void;
  validationErrors: ValidationError[];
  onSaveHabit?: (context: string, drugs: DrugItem[]) => void;
  hasChanges?: boolean;
  coherenceWarnings?: { level: string; message: string }[];
}

function useDebounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; }, [fn]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { fnRef.current(...args); }, delay);
  }, [delay]) as T;
}

export const PrescriptionAgenticStudio: React.FC<PrescriptionAgenticStudioProps> = ({
  patientId, drugs, setDrugs, onUpdateDrug, onRemoveDrug, onAddDrug,
  validationErrors, coherenceWarnings = [],
}) => {
  const [step, setStep] = useState<'IDLE' | 'RESEARCH' | 'ASSESSMENT' | 'PLANNING'>('IDLE');
  const [assessment, setAssessment] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [activeSearchId, setActiveSearchId] = useState<{ id: number; field: string } | null>(null);
  const [suggestions, setSuggestions] = useState<{ medications: string[]; dosages: string[]; posologies: string[] }>({
    medications: [], dosages: [], posologies: [],
  });
  const [medChecks, setMedChecks] = useState<Record<number, { known: boolean; exists?: boolean; available_mg?: number[]; dci?: string }>>({});
  const [formeDropdownCoords, setFormeDropdownCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [presets, setPresets] = useState<any[]>([]);
  const [showPresets, setShowPresets] = useState(true);
  const [selectedUserPreset, setSelectedUserPreset] = useState('');
  const [savingAsPreset, setSavingAsPreset] = useState(false);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [patientAdvice, setPatientAdvice] = useState('');
  const [showPatientAdvice, setShowPatientAdvice] = useState(false);
  const [forcedDrugs, setForcedDrugs] = useState<number[]>([]);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideWeight, setGuideWeight] = useState(70);
  const [guideAge, setGuideAge] = useState(30);
  const [guideCategory, setGuideCategory] = useState<string>('TOUS');
  const [guideSearch, setGuideSearch] = useState('');
  const [guideNationalResults, setGuideNationalResults] = useState<Array<{ nom: string; dci: string; dosage: string; unite: string; forme: string }>>([]);
  const [guideSearching, setGuideSearching] = useState(false);
  const [quickVal, setQuickVal] = useState('');
  const [quickSuggestions, setQuickSuggestions] = useState<string[]>([]);
  const [quickHighlightedIdx, setQuickHighlightedIdx] = useState(-1);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [quickExpanded, setQuickExpanded] = useState(true);

  // --- Silent clinical assessment ---
  useEffect(() => {
    if (!patientId) return;
    const silentResearch = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/prescriptions/agentic/assessment/${patientId}`);
        setAssessment(res.data);
        if (res.data?.age != null) {
          setGuideAge(res.data.age);
          const w = res.data.weight ?? res.data.poids;
          if (w) setGuideWeight(w);
          else if (res.data.age < 15) setGuideWeight(estimateWeightFromAge(res.data.age));
        }
      } catch (err) {
        console.error('Silent AI Error:', err);
      } finally {
        setLoading(false);
      }
    };
    silentResearch();
  }, [patientId]);

  const designTreatmentPlan = async () => {
    setLoading(true);
    setStep('PLANNING');
    try {
      const res = await api.post(`/prescriptions/agentic/design`, {
        assessment,
        patient_context: { id: patientId },
      });
      setDrugs(res.data.prescriptions.map((p: any, idx: number) => ({
        id: Date.now() + idx,
        name: p.medicament, dosage: p.dosage,
        forme: p.forme, posologie: p.posologie,
        type: 'MEDICAMENT', quantite: 1, non_substituable: false,
      })));
    } catch {
      setStep('ASSESSMENT');
    } finally {
      setLoading(false);
    }
  };

  // --- Presets ---
  const fetchPresets = useCallback(async () => {
    try {
      const res = await api.get('/prescriptions/habits/presets');
      setPresets(res.data);
    } catch (err) {
      console.error('Erreur presets:', err);
    }
  }, []);

  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  const deletePreset = async (actCode: string) => {
    if (!window.confirm(`Supprimer le preset "${actCode}" ?`)) return;
    try {
      await api.delete(`/prescriptions/preferences/${encodeURIComponent(actCode)}`);
      toast.success('Preset supprimé');
      fetchPresets();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const saveCurrentAsPreset = async () => {
    if (!newPresetName.trim()) return;
    const savableDrugs = drugs.filter(d => d.name.trim());
    if (savableDrugs.length === 0) {
      toast.error('Ajoutez au moins une ligne avant d\'enregistrer cette ordonnance.');
      return;
    }
    setSavingAsPreset(true);
    try {
      await api.post('/prescriptions/preferences', {
        act_code: newPresetName.toUpperCase(),
        drugs: savableDrugs.map(d => ({ name: d.name, dosage: d.dosage, forme: d.forme, posologie: d.posologie })),
      });
      setShowSavePresetModal(false);
      setNewPresetName('');
      fetchPresets();
      toast.success(`Preset "${newPresetName}" enregistré !`);
    } catch {
      toast.error("Erreur lors de l'enregistrement du preset.");
    } finally {
      setSavingAsPreset(false);
    }
  };

  // --- Helpers ---
  const getDefaultMedicationDetails = useCallback((name: string) => {
    const upperName = name.trim().toUpperCase();
    if (upperName.includes('KIN')) return KIN_PRESET;
    return DEFAULT_MOROCCO_PRESETS.flatMap(p => p.drugs).find(d => d.name.toUpperCase() === upperName);
  }, []);

  const hydrateMedicationDetails = useCallback(async (drug: DrugItem): Promise<DrugItem> => {
    if (drug.type === 'EXAMEN') return drug;
    const preset = getDefaultMedicationDetails(drug.name);
    let hydrated: DrugItem = preset
      ? { ...drug, name: preset.name, dosage: drug.dosage || preset.dosage, forme: drug.forme || preset.forme, posologie: drug.posologie || preset.posologie }
      : drug;

    const dosing = getAgeAwareDosing(hydrated.name, assessment?.age, assessment?.weight ?? assessment?.poids);
    if (dosing) {
      hydrated = { ...hydrated, dosage: hydrated.dosage || dosing.dosage, posologie: hydrated.posologie || dosing.posology };
    } else {
      try {
        const res = await api.get(`/prescriptions/habits/details?med_name=${encodeURIComponent(hydrated.name)}`);
        hydrated = {
          ...hydrated,
          dosage: hydrated.dosage || res.data.dosages?.[0] || '',
          posologie: hydrated.posologie || res.data.posologies?.[0] || '',
        };
      } catch { /* offline — keep what we have */ }
    }
    return hydrated;
  }, [getDefaultMedicationDetails, assessment]);

  const addDrugAtEnd = useCallback((drug: DrugItem) => {
    // Replace the initial empty placeholder instead of appending behind it
    const hasOnlyEmptyPlaceholder = drugs.length === 1 && !drugs[0].name.trim() && !drugs[0].posologie.trim();
    setDrugs(hasOnlyEmptyPlaceholder ? [drug] : [...drugs, drug]);
    setQuickExpanded(false);
  }, [drugs, setDrugs]);

  const addMolecule = useCallback((molecule: string, forcedDosage?: string, forcedPosology?: string, forme?: string) => {
    const newId = Date.now();
    const newDrug: DrugItem = {
      id: newId, name: molecule, dosage: forcedDosage || '', forme: forme || 'COMPRIMÉS',
      posologie: forcedPosology || '', type: 'MEDICAMENT', quantite: 1, non_substituable: false,
    };
    setDrugs([...drugs, newDrug]);
    if (!forcedDosage || !forcedPosology) {
      api.get(`/prescriptions/habits/details?med_name=${encodeURIComponent(molecule)}`).then(res => {
        if (!forcedDosage && res.data.dosages?.length === 1) onUpdateDrug(newId, 'dosage', res.data.dosages[0]);
        if (!forcedPosology && res.data.posologies?.length === 1) onUpdateDrug(newId, 'posologie', res.data.posologies[0]);
      }).catch(() => {});
    }
  }, [drugs, setDrugs, onUpdateDrug]);

  const moveDrug = useCallback((id: number, direction: 'up' | 'down') => {
    const idx = drugs.findIndex(d => d.id === id);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === drugs.length - 1) return;
    const newDrugs = [...drugs];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    [newDrugs[idx], newDrugs[targetIdx]] = [newDrugs[targetIdx], newDrugs[idx]];
    setDrugs(newDrugs);
  }, [drugs, setDrugs]);

  // --- National med check ---
  const runMedCheck = useDebounce(async (id: number, name: string, dosage: string) => {
    if (!name?.trim()) {
      setMedChecks(prev => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    try {
      const res = await api.get('/medications/validate', { params: { name, dosage: dosage || undefined } });
      setMedChecks(prev => ({ ...prev, [id]: res.data }));
    } catch { /* silent — offline or unknown */ }
  }, 350);

  const searchGuideNational = useDebounce(async (q: string) => {
    if (q.trim().length < 2) { setGuideNationalResults([]); setGuideSearching(false); return; }
    try {
      const res = await api.get('/medications/search', { params: { q } });
      setGuideNationalResults(res.data || []);
    } catch {
      setGuideNationalResults([]);
    } finally {
      setGuideSearching(false);
    }
  }, 300);

  // --- Autocomplete ---
  const fetchSuggestions = useCallback(async (id: number, field: string, val: string) => {
    try {
      if (field === 'name' && val.length >= 1) {
        const res = await api.get(`/prescriptions/habits/suggest?q=${encodeURIComponent(val)}`);
        const data = res.data;
        if (!data.medications || data.medications.length === 0) {
          const pool = [...new Set([
            ...DEFAULT_MOROCCO_PRESETS.flatMap(p => p.drugs.map(d => d.name)),
            'KIN',
          ])];
          const fuzzyHits = pool.filter(n => fuzzyMatch(val, n));
          if (fuzzyHits.length > 0) { setSuggestions({ medications: fuzzyHits, dosages: [], posologies: [] }); return; }
        }
        setSuggestions(data);
      } else if (field === 'dosage' || field === 'posologie') {
        const drug = drugs.find(d => d.id === id);
        if (drug?.name) {
          const res = await api.get(`/prescriptions/habits/details?med_name=${encodeURIComponent(drug.name)}`);
          setSuggestions({ medications: [], ...res.data });
        }
      }
    } catch (err: any) {
      if (err.name === 'CanceledError') return;
      console.error('Fetch suggestions error:', err);
    }
  }, [drugs]);

  const debouncedFetch = useDebounce(fetchSuggestions, 250);

  const handleSearch = (id: number, field: string, val: string) => {
    onUpdateDrug(id, field as keyof DrugItem, val);
    setActiveSearchId({ id, field });
    if (val.length >= 1) {
      debouncedFetch(id, field, val);
    } else {
      setSuggestions({ medications: [], dosages: [], posologies: [] });
      setActiveSearchId(null);
    }
    if (field === 'name' || field === 'dosage') {
      const d = drugs.find(x => x.id === id);
      const name = field === 'name' ? val : (d?.name || '');
      const dosage = field === 'dosage' ? val : (d?.dosage || '');
      runMedCheck(id, name, dosage);
    }
  };

  const applySuggestion = useCallback((id: number, field: string, val: string) => {
    onUpdateDrug(id, field as keyof DrugItem, val);
    setSuggestions({ medications: [], dosages: [], posologies: [] });
    setActiveSearchId(null);
    if (field === 'name') {
      const preset = getDefaultMedicationDetails(val);
      if (preset) {
        onUpdateDrug(id, 'dosage', preset.dosage);
        onUpdateDrug(id, 'forme', preset.forme as any);
        onUpdateDrug(id, 'posologie', preset.posologie);
      }
      const age = assessment?.age;
      const weight = assessment?.weight ?? assessment?.poids;
      const dosing = getAgeAwareDosing(val, age, weight);
      if (dosing) {
        onUpdateDrug(id, 'dosage', dosing.dosage);
        onUpdateDrug(id, 'posologie', dosing.posology);
        runMedCheck(id, val, dosing.dosage);
        if (dosing.pediatric) toast(`Posologie pédiatrique appliquée (≈ ${dosing.weight} kg).`, { icon: '👶', duration: 4000 });
      } else {
        runMedCheck(id, val, '');
        api.get(`/prescriptions/habits/details?med_name=${encodeURIComponent(val)}`).then(res => {
          if (!preset && res.data.dosages?.[0]) onUpdateDrug(id, 'dosage', res.data.dosages[0]);
          if (!preset && res.data.posologies?.[0]) onUpdateDrug(id, 'posologie', res.data.posologies[0]);
        }).catch(() => {});
      }
    }
  }, [getDefaultMedicationDetails, onUpdateDrug, assessment]);

  useEffect(() => setHighlightedIdx(-1), [activeSearchId]);

  const getActiveSuggestions = (field: string): string[] => {
    if (field === 'name') return suggestions.medications;
    if (field === 'dosage') return suggestions.dosages;
    if (field === 'posologie') return suggestions.posologies;
    return [];
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: number, field: string) => {
    const list = getActiveSuggestions(field);
    if (!list.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIdx(i => Math.min(i + 1, list.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && highlightedIdx >= 0) { e.preventDefault(); applySuggestion(id, field, list[highlightedIdx]); }
    if (e.key === 'Escape') { setSuggestions({ medications: [], dosages: [], posologies: [] }); setActiveSearchId(null); }
  };

  const handleFormeOpen = (e: React.MouseEvent<HTMLButtonElement>, drugId: number) => {
    e.stopPropagation();
    if (activeSearchId?.id === drugId && activeSearchId?.field === 'forme_dropdown') {
      setActiveSearchId(null);
      setFormeDropdownCoords(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setFormeDropdownCoords({ top: rect.bottom + 8, left: rect.left, width: rect.width });
      setActiveSearchId({ id: drugId, field: 'forme_dropdown' });
    }
  };

  useEffect(() => {
    if (!formeDropdownCoords) return;
    const close = () => { setActiveSearchId(null); setFormeDropdownCoords(null); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [formeDropdownCoords]);

  // --- Preset application with safety ---
  const checkLocalSafetyConstraints = useCallback((antecedents: string): { blocked: boolean; reason: string } => {
    const history = (antecedents || '').toUpperCase();
    const PENICILLIN_KEYWORDS = ['PENICILLINE', 'PENICILLIN', 'AMOXICILLINE', 'CLAMOXYL', 'AUGMENTIN', 'BETA-LACTAMINE'];
    const isAllergicToPenicillin = history.includes('ALLERGI') && PENICILLIN_KEYWORDS.some(k => history.includes(k));
    const PREGNANCY_KEYWORDS = ['GROSSESSE', 'ENCEINTE', 'PREGNANT', 'TRIMESTRE'];
    const isPregnant = PREGNANCY_KEYWORDS.some(k => history.includes(k));
    return {
      blocked: isAllergicToPenicillin || isPregnant,
      reason: isAllergicToPenicillin
        ? '⚠️ Allergie pénicilline détectée dans les antécédents.'
        : isPregnant ? '⚠️ Grossesse détectée dans les antécédents. Vérifiez les contre-indications.' : '',
    };
  }, []);

  const applyPresetWithSafety = useCallback((presetDrugs: any[], presetLabel?: string) => {
    const isChild = assessment?.age < 15 || assessment?.is_child;
    const history = (assessment?.patient_context?.antecedents || assessment?.antecedents || '').toUpperCase();
    const localSafety = checkLocalSafetyConstraints(history);
    if (localSafety.blocked) toast(localSafety.reason, { icon: '⚠️', duration: 6000 });

    const adaptedDrugs = presetDrugs.map((d: any, i: number) => {
      const drug = { ...d, id: Date.now() + i, type: 'MEDICAMENT' as const, quantite: 1, non_substituable: false };
      if (history.includes('ALLERGIE') && (history.includes('PENICILLINE') || history.includes('CLAMOXYL') || history.includes('AUGMENTIN'))) {
        if (drug.name.includes('CLAMOXYL') || drug.name.includes('AMOXICILLINE') || drug.name.includes('AUGMENTIN')) {
          drug.name = 'RODOGYL';
          drug.dosage = '-';
          drug.posologie = '1 cp x 3 / jour pendant 7 jours (Substitution Allergie)';
        }
      }
      if (isChild) {
        if (drug.name === 'DOLIPRANE' && drug.dosage === '1G') { drug.dosage = '500MG'; drug.posologie = drug.posologie.replace('1 cp', '1/2 cp'); }
        if (drug.name === 'ANTADYS') { drug.name = 'PARACETAMOL'; drug.dosage = '500MG'; }
      }
      return drug;
    });

    const PARACETAMOL_NAMES = ['paracetamol', 'doliprane', 'efferalgan', 'dafalgan', 'perfalgan'];
    const isParacetamol = (name: string) => PARACETAMOL_NAMES.some(n => name.toLowerCase().includes(n));
    const deduplicatedDrugs = adaptedDrugs.reduce((acc: DrugItem[], drug: DrugItem) => {
      if (isParacetamol(drug.name) && acc.find(d => isParacetamol(d.name))) return acc;
      acc.push(drug);
      return acc;
    }, []);

    setDrugs(deduplicatedDrugs);
    setNewPresetName(presetLabel || '');
    setStep('PLANNING');
    if (isChild) toast("Ordonnance adaptée au profil pédiatrique.", { icon: '👶' });
    else toast.success(presetLabel ? `Protocole "${presetLabel}" appliqué.` : "Protocole appliqué.");
  }, [assessment, setDrugs, checkLocalSafetyConstraints]);

  // --- Quick entry parse ---
  const parseQuickEntry = (text: string): DrugItem => {
    const lowerText = text.toLowerCase();
    const parts = text.trim().split(/\s+/);
    const radioKeywords = ['radio', 'télé-radio', 'teleradio', 'conebeam', 'scanner', 'irm', 'panoramique', 'rvg', 'bitewing', 'status', 'dentoscan', 'cbct', 'examen'];
    const isExamen = radioKeywords.some(k => lowerText.includes(k));
    const preset = getDefaultMedicationDetails(parts[0]);
    const drug: DrugItem = {
      id: Date.now(),
      name: (preset?.name || parts[0]).toUpperCase(),
      dosage: preset?.dosage || '',
      forme: isExamen ? '' : (preset?.forme || 'COMPRIMÉS'),
      posologie: preset?.posologie || '',
      type: isExamen ? 'EXAMEN' : 'MEDICAMENT',
      quantite: 1, non_substituable: false,
    };
    if (isExamen) {
      if (parts.length <= 3) { drug.name = text.toUpperCase().trim(); drug.posologie = ''; }
      else { drug.name = parts.slice(0, 2).join(' ').toUpperCase(); drug.posologie = parts.slice(2).join(' ').trim(); }
      return drug;
    }
    const formesMap: Record<string, string> = {
      'sachet': 'SACHETS', 'gelule': 'GÉLULES', 'gélule': 'GÉLULES', 'bain': 'BAIN DE BOUCHE', 'kin': 'BAIN DE BOUCHE',
      'sirop': 'SIROP', 'pommade': 'POMMADE', 'crème': 'CRÈME', 'creme': 'CRÈME', 'goutte': 'GOUTTES',
      'ampoule': 'AMPOULES', 'spray': 'SPRAY', 'comprimé': 'COMPRIMÉS', 'comprime': 'COMPRIMÉS', 'cp': 'COMPRIMÉS',
    };
    let poso = text;
    let formeTextFound = '';
    for (const [key, value] of Object.entries(formesMap)) {
      const m = text.match(new RegExp(`\\b${key}s?\\b`, 'i'));
      if (m) { drug.forme = value; formeTextFound = m[0]; break; }
    }
    let dosageTextFound = '';
    const dosageMatch = text.match(/\b\d+(\s?)(g|mg|mcg|ml|l|ui)\b/i);
    if (dosageMatch) { drug.dosage = dosageMatch[0].toUpperCase().replace(/\s/g, ''); dosageTextFound = dosageMatch[0]; }
    let qtyTextFound = '';
    const qtyMatch = text.match(/(qsp|x|qty|qté|qte)\s*(\d+)/i) || text.match(/\b(\d+)\s*(boite|boîte|pack|unité)s?\b/i);
    if (qtyMatch) { const num = qtyMatch[2] || qtyMatch[1]; drug.quantite = parseInt(num); qtyTextFound = qtyMatch[0]; }
    if (poso.toUpperCase().startsWith(drug.name)) poso = poso.substring(drug.name.length);
    if (dosageTextFound) poso = poso.replace(dosageTextFound, '');
    if (formeTextFound) poso = poso.replace(formeTextFound, '');
    if (qtyTextFound) poso = poso.replace(qtyTextFound, '');
    const parsedPosologie = poso.replace(/\s+/g, ' ').trim();
    if (parsedPosologie) drug.posologie = parsedPosologie;
    return drug;
  };

  const handleQuickSearch = useDebounce(async (val: string) => {
    const searchPart = val.trim().split(' ')[0];
    if (searchPart.length < 1) { setQuickSuggestions([]); return; }
    try {
      const res = await api.get(`/prescriptions/habits/suggest?q=${encodeURIComponent(searchPart)}`);
      setQuickSuggestions(res.data.medications || []);
    } catch { /* silent */ }
  }, 300);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between bg-white/40 p-4 rounded-[2rem] border border-white/60 backdrop-blur-2xl shadow-lg shadow-primary/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-blue-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-primary/30">
            <Brain size={20} className={loading ? 'animate-pulse' : ''} />
          </div>
          <div>
            <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.2em] leading-none mb-1 flex items-center gap-2">
              IAmina Intelligence
              <span className="bg-primary/10 text-primary text-[7px] px-1.5 py-0.5 rounded-full">v4.8</span>
            </h3>
            {drugs.length > 0 && (
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {drugs.length} médicament{drugs.length > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={cn(
            'px-3 py-1.5 rounded-xl border transition-all flex items-center gap-2',
            coherenceWarnings.length === 0
              ? 'bg-emerald-50/50 border-emerald-100 text-emerald-600'
              : 'bg-amber-50/50 border-amber-100 text-amber-600 animate-pulse',
          )}>
            <ShieldCheck size={12} className={coherenceWarnings.length > 0 ? 'hidden' : ''} />
            <AlertCircle size={12} className={coherenceWarnings.length === 0 ? 'hidden' : ''} />
            <span className="text-[8px] font-black uppercase tracking-widest">
              {coherenceWarnings.length === 0 ? 'Cohérence OK' : 'Audit Requis'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 text-primary rounded-xl">
              <RefreshCcw size={12} className="animate-spin" />
              <span className="text-[8px] font-black uppercase tracking-widest">Analyse en cours...</span>
            </div>
          )}
          <button
            onClick={() => setShowGuideModal(true)}
            className="px-3 py-1.5 bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 rounded-xl hover:bg-indigo-500 hover:text-white transition-all flex items-center gap-2 shadow-sm"
          >
            <Stethoscope size={14} />
            <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Médicaments</span>
          </button>
          <button
            onClick={() => { setStep('IDLE'); setAssessment(null); }}
            className="p-2 bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200 transition-all"
          >
            <RefreshCcw size={14} />
          </button>
        </div>
      </div>

      {/* ALLERGY BANNER */}
      {assessment && (assessment?.patient_context?.antecedents || assessment?.antecedents) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 p-4 rounded-[1.5rem] flex items-start gap-3 shadow-sm relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
          <div className="relative z-10">
            <h4 className="text-[11px] font-black text-red-800 uppercase tracking-widest mb-1">Alerte Médicale & Allergies</h4>
            <p className="text-xs font-bold text-red-700">
              {assessment?.patient_context?.antecedents || assessment?.antecedents}
            </p>
          </div>
        </motion.div>
      )}

      {/* QUICK ENTRY */}
      <AnimatePresence initial={false}>
        {quickExpanded ? (
          <motion.div
            key="quick-open"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <QuickEntryBar
              quickVal={quickVal}
              setQuickVal={setQuickVal}
              quickSuggestions={quickSuggestions}
              quickHighlightedIdx={quickHighlightedIdx}
              setQuickHighlightedIdx={setQuickHighlightedIdx}
              onSearchChange={handleQuickSearch}
              onAddDrug={addDrugAtEnd}
              onSetStep={setStep}
              hydrateMedicationDetails={hydrateMedicationDetails}
              parseQuickEntry={parseQuickEntry}
            />
          </motion.div>
        ) : (
          <motion.button
            key="quick-closed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setQuickExpanded(true)}
            className="w-full flex items-center gap-3 px-6 py-3 bg-primary/5 border border-dashed border-primary/20 rounded-[2rem] text-primary/60 hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-all text-[10px] font-black uppercase tracking-widest"
          >
            <Zap size={14} />
            Saisie rapide…
          </motion.button>
        )}
      </AnimatePresence>

      {/* PRESETS BAR */}
      <AnimatePresence>
        {showPresets && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center justify-between px-4 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wide">Protocoles Cliniques</span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span className="text-[8px] font-bold text-slate-300 uppercase italic">Smart Adaptation active</span>
              </div>
              <button onClick={() => setShowPresets(false)} className="text-[9px] font-black text-slate-300 hover:text-slate-500 uppercase tracking-tighter transition-colors">Masquer</button>
            </div>
            <div className="px-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wide block">Protocoles Système</span>
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-white border border-slate-200 rounded-2xl px-4 py-3 pr-8 text-sm font-bold text-slate-700 cursor-pointer hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
                    value=""
                    onChange={e => {
                      const p = DEFAULT_MOROCCO_PRESETS.find(p => p.label === e.target.value);
                      if (p) applyPresetWithSafety(p.drugs, p.label);
                      e.currentTarget.value = '';
                    }}
                  >
                    <option value="" disabled>— Choisir un protocole —</option>
                    {DEFAULT_MOROCCO_PRESETS.map(p => (
                      <option key={p.label} value={p.label}>{p.label} ({p.drugs.length} méd.)</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400"><ChevronDown size={12} /></div>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wide block">Mes Ordonnances</span>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <select
                      className="w-full appearance-none bg-white border border-slate-200 rounded-2xl px-4 py-3 pr-8 text-sm font-bold text-slate-700 cursor-pointer hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      value={selectedUserPreset}
                      disabled={presets.length === 0}
                      onChange={e => {
                        setSelectedUserPreset(e.target.value);
                        const p = presets.find(p => p.act_context === e.target.value);
                        if (p) applyPresetWithSafety(p.drugs, p.act_context);
                      }}
                    >
                      <option value="">{presets.length === 0 ? '— Aucune ordonnance sauvegardée —' : '— Choisir une ordonnance —'}</option>
                      {presets.map(p => (
                        <option key={p.id} value={p.act_context}>{p.act_context}{p.drugs?.length > 0 ? ` (${p.drugs.length})` : ''}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400"><ChevronDown size={12} /></div>
                  </div>
                  {selectedUserPreset && (
                    <button
                      onClick={() => { deletePreset(selectedUserPreset); setSelectedUserPreset(''); }}
                      className="min-w-[44px] min-h-[44px] flex-shrink-0 bg-red-50 border border-red-100 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                      title="Supprimer cette ordonnance enregistrée"
                      aria-label="Supprimer cette ordonnance enregistrée"
                    ><Trash2 size={18} /></button>
                  )}
                </div>
              </div>
            </div>
            <div className="px-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSavePresetModal(true)}
                disabled={!drugs.some(d => d.name.trim())}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-md transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                <Save size={17} /> Enregistrer dans Mes ordonnances
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* STEP VIEWS */}
      <AnimatePresence mode="wait">
        {step === 'RESEARCH' && (
          <motion.div
            key="research"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="p-16 flex flex-col items-center justify-center text-center space-y-8 bg-white/30 rounded-[3rem] border border-dashed border-primary/30 backdrop-blur-sm"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full animate-pulse scale-150" />
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-2xl relative z-10 border border-primary/10">
                <RefreshCcw size={40} className="text-primary animate-spin" style={{ color: 'var(--primary)' }} />
              </div>
            </div>
            <div className="max-w-sm">
              <h4 className="text-xl font-black text-slate-800 mb-3">Analyse du dossier clinique...</h4>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                Apprentissage de vos habitudes, calcul des doses et validation des interactions médicamenteuses.
              </p>
            </div>
          </motion.div>
        )}

        {step === 'ASSESSMENT' && assessment && (
          <motion.div key="assessment" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-white/60 p-8 rounded-[2.5rem] border border-white/60 shadow-xl shadow-slate-200/50 backdrop-blur-xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-emerald-500/10 text-emerald-600 rounded-xl flex items-center justify-center">
                      <ShieldCheck size={22} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Bilan Scientifique</h4>
                      <p className="text-[10px] font-bold text-slate-400">Habits Engine v2.0 (Local)</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {assessment.risques_identifies?.length > 0 ? (
                      <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                        <span className="text-[9px] font-black text-red-600 uppercase tracking-widest block mb-2">Risques Détectés</span>
                        <ul className="space-y-1.5">
                          {assessment.risques_identifies.map((r: string, i: number) => (
                            <li key={i} className="text-[11px] font-bold text-red-700 flex items-start gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3">
                        <CheckCircle2 size={20} className="text-emerald-500" />
                        <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest">Sécurité Clinique Validée</span>
                      </div>
                    )}
                    <div className="p-5 bg-primary/5 rounded-2xl border border-primary/10">
                      <span className="text-[9px] font-black text-primary uppercase tracking-widest block mb-2">Stratégie Thérapeutique</span>
                      <p className="text-xs font-bold text-slate-700 leading-relaxed italic">"{assessment.strategie_globale}"</p>
                      {assessment.dosage_note && <p className="text-[10px] text-primary/60 font-black mt-2 uppercase">{assessment.dosage_note}</p>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 space-y-6">
                <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl shadow-primary/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-12 bg-primary/20 blur-[100px] rounded-full group-hover:scale-150 transition-transform duration-1000" />
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                        <Stethoscope size={20} className="text-blue-300" />
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-widest">Suggestions</h4>
                    </div>
                    <div className="space-y-3 mb-8">
                      {assessment.recommandations_moleculaires?.map((m: any, i: number) => (
                        <button key={i} onClick={() => addMolecule(m.molecule)}
                          className="w-full text-left bg-white/5 p-3 rounded-2xl border border-white/10 hover:bg-primary hover:border-primary hover:shadow-lg hover:shadow-primary/20 transition-all group/sugg"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-black text-blue-300 uppercase group-hover/sugg:text-white transition-colors">{m.molecule}</span>
                            <div className="flex gap-1">
                              {m.noms_commerciaux?.slice(0, 2).map((n: string) => (
                                <span key={n} className="px-1.5 py-0.5 bg-white/10 rounded text-[7px] font-black uppercase group-hover/sugg:bg-white/20">{n}</span>
                              ))}
                            </div>
                          </div>
                          <p className="text-[9px] text-white/40 font-bold leading-tight group-hover/sugg:text-white/70">{m.justification}</p>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={designTreatmentPlan}
                      className="w-full py-4 bg-primary text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/40 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                      style={{ backgroundColor: 'var(--primary)' }}
                    >
                      Établir l'Ordonnance <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {(step === 'PLANNING' || step === 'IDLE' || (step === 'ASSESSMENT' && drugs.some(d => d.name))) && (
          <motion.div key="planning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {step === 'PLANNING' && loading && (
              <div className="p-20 text-center bg-white/40 rounded-[3rem] border border-dashed border-primary/20 flex flex-col items-center gap-6 backdrop-blur-sm">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <Zap size={32} className="text-primary animate-bounce" style={{ color: 'var(--primary)' }} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2">Génération du plan...</h4>
                  <p className="text-[10px] font-bold text-slate-400">Application de vos habitudes et structuration finale.</p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {drugs.map((drug, idx) => (
                <DrugRow
                  key={drug.id}
                  drug={drug}
                  idx={idx}
                  drugsCount={drugs.length}
                  assessment={assessment}
                  validationErrors={validationErrors}
                  forcedDrugs={forcedDrugs}
                  activeSearchId={activeSearchId}
                  suggestions={suggestions}
                  highlightedIdx={highlightedIdx}
                  medChecks={medChecks}
                  onUpdateDrug={onUpdateDrug}
                  onRemoveDrug={onRemoveDrug}
                  onMove={moveDrug}
                  onSearch={handleSearch}
                  onKeyDown={handleKeyDown}
                  onApplySuggestion={applySuggestion}
                  onFormeOpen={handleFormeOpen}
                  onForceAllergy={id => setForcedDrugs(prev => [...prev, id])}
                  onToggleType={(id, type) =>
                    setDrugs(drugs.map(d => d.id === id
                      ? { ...d, type, forme: type === 'MEDICAMENT' ? (d.forme || 'COMPRIMÉS') : '', dosage: type === 'EXAMEN' ? '' : d.dosage, posologie: type === 'EXAMEN' ? '' : d.posologie }
                      : d))
                  }
                />
              ))}
            </div>

            {/* Safety badge */}
            <div className="flex items-center justify-end px-4">
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all cursor-help',
                  coherenceWarnings.length > 0
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-600'
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600',
                )}
                title={coherenceWarnings.length > 0 ? 'Avertissements de sécurité détectés' : 'Validation de sécurité IAmina : OK'}
              >
                {coherenceWarnings.length > 0 ? <AlertCircle size={12} /> : <ShieldCheck size={12} />}
                <span className="text-[8px] font-black uppercase tracking-widest">
                  {coherenceWarnings.length > 0 ? `${coherenceWarnings.length} Alertes` : 'Sécurité Validée'}
                </span>
              </div>
            </div>

            {/* Add line */}
            <div className="flex flex-wrap justify-center gap-4 mt-6">
              <button
                onClick={onAddDrug}
                className="flex-1 min-w-[200px] py-5 border-2 border-dashed border-slate-200 text-slate-400 rounded-[2.5rem] flex items-center justify-center gap-3 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all font-black text-xs uppercase tracking-widest"
              >
                <Plus size={20} /> Ajouter une ligne
              </button>
            </div>

            {/* Patient advice */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowPatientAdvice(v => !v)}
                className="flex items-center gap-2 text-[9px] font-black text-slate-400 hover:text-primary uppercase tracking-widest transition-colors px-2"
              >
                <div className={cn('w-3 h-3 rounded-full border-2 border-current transition-colors', showPatientAdvice ? 'bg-primary border-primary' : 'border-slate-300')} />
                Conseils au Patient
                {patientAdvice.trim() && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[7px]">✓</span>}
              </button>
              <AnimatePresence>
                {showPatientAdvice && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="mt-3 overflow-hidden"
                  >
                    <div className="bg-blue-50/50 border border-blue-100 rounded-[1.5rem] p-4 focus-within:ring-2 focus-within:ring-primary/10 focus-within:border-primary/20 transition-all">
                      <textarea
                        rows={3}
                        className="w-full bg-transparent border-none p-0 text-[11px] font-bold text-slate-600 focus:ring-0 resize-none placeholder:text-slate-300 leading-relaxed"
                        placeholder="Ex : Éviter les aliments durs pendant 48h. Ne pas fumer. Rincer avec le bain de bouche après chaque repas..."
                        value={patientAdvice}
                        onChange={e => setPatientAdvice(e.target.value)}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SAVE PRESET MODAL */}
      <AnimatePresence>
        {showSavePresetModal && (
          <div className="fixed inset-0 z-[30000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => setShowSavePresetModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[3rem] p-10 w-full max-w-md shadow-2xl border border-white/20"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 bg-primary/10 rounded-[1.5rem] flex items-center justify-center text-primary">
                  <Brain size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Mémoriser le Preset</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Intelligence Ghost Elite</p>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 ml-2">Nom de l'Acte (Ex: Implantologie)</label>
                  <input
                    type="text" value={newPresetName}
                    onChange={e => setNewPresetName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary/30 transition-all placeholder:text-slate-300"
                    placeholder="Saisissez le contexte clinique..."
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && saveCurrentAsPreset()}
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={() => setShowSavePresetModal(false)} className="flex-1 py-4 bg-slate-50 text-slate-500 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all">Annuler</button>
                  <button
                    onClick={saveCurrentAsPreset}
                    disabled={savingAsPreset || !newPresetName.trim()}
                    className="flex-1 py-4 bg-primary text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ backgroundColor: 'var(--primary)' }}
                  >
                    {savingAsPreset ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Enregistrer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FORME DROPDOWN (fixed position to escape overflow) */}
      <AnimatePresence>
        {activeSearchId?.field === 'forme_dropdown' && formeDropdownCoords && (() => {
          const activeDrug = drugs.find(d => d.id === activeSearchId.id);
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 8 }}
              style={{ position: 'fixed', top: formeDropdownCoords.top, left: formeDropdownCoords.left, width: Math.max(formeDropdownCoords.width, 208), zIndex: 200 }}
              className="bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden py-2"
            >
              {FORMES.map(f => {
                const Icon = f.icon;
                return (
                  <button
                    key={f.l}
                    onClick={() => { onUpdateDrug(activeSearchId.id, 'forme', f.l === 'AUTRE' ? 'AUTRE: ' : f.l); setActiveSearchId(null); setFormeDropdownCoords(null); }}
                    className={cn(
                      'w-full px-5 py-2.5 text-left text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-colors',
                      activeDrug?.forme.startsWith(f.l) ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:bg-slate-50 hover:text-primary',
                    )}
                  >
                    <Icon size={14} /> {f.l}
                  </button>
                );
              })}
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Overlay to close dropdowns */}
      {(suggestions.medications.length > 0 || suggestions.dosages.length > 0 || suggestions.posologies.length > 0 || activeSearchId?.field === 'forme_dropdown') && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setSuggestions({ medications: [], dosages: [], posologies: [] }); setActiveSearchId(null); setFormeDropdownCoords(null); }}
        />
      )}

      {/* GUIDE MODAL */}
      <PrescriptionGuideModal
        show={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        guideAge={guideAge}
        setGuideAge={setGuideAge}
        guideWeight={guideWeight}
        setGuideWeight={setGuideWeight}
        guideCategory={guideCategory}
        setGuideCategory={setGuideCategory}
        guideSearch={guideSearch}
        setGuideSearch={setGuideSearch}
        guideNationalResults={guideNationalResults}
        guideSearching={guideSearching}
        setGuideSearching={setGuideSearching}
        onNationalSearch={searchGuideNational}
        assessment={assessment}
        onAddMolecule={addMolecule}
      />
    </div>
  );
};
