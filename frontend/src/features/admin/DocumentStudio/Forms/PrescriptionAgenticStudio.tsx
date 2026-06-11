import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, CheckCircle2, AlertCircle, Zap, RefreshCcw, ChevronRight,
  ShieldCheck, Stethoscope, Pill, Trash2, Plus, Microscope,
  Package, Droplets, FlaskConical, Wind, BadgeMinus, Hash, Loader2,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { api } from '../../../../services/api';
import toast from 'react-hot-toast';
import type { ValidationError } from '../useDocumentGenerator';
import { MOROCCAN_CLINICAL_RULES, getPediatricGuide } from '../clinical_rules';

export interface DrugItem {
  id: number;
  name: string;
  dosage: string;
  forme: string;
  posologie: string;
  type?: 'MEDICAMENT' | 'EXAMEN';
  quantite?: number;
  non_substituable?: boolean;
}

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

const FORMES = [
  { l: 'COMPRIMÉS', icon: Pill },
  { l: 'SACHETS', icon: Package },
  { l: 'GÉLULES', icon: Pill },
  { l: 'BAIN DE BOUCHE', icon: Droplets },
  { l: 'AMPOULES', icon: FlaskConical },
  { l: 'SIROP', icon: Droplets },
  { l: 'POMMADE', icon: BadgeMinus },
  { l: 'CRÈME', icon: BadgeMinus },
  { l: 'GOUTTES', icon: Droplets },
  { l: 'SPRAY', icon: Wind },
  { l: 'AUTRE', icon: Hash },
];

function fuzzyMatch(input: string, target: string): boolean {
  const a = input.toLowerCase().trim();
  const b = target.toLowerCase();
  if (b.includes(a)) return true;
  if (a.length < 3) return false;
  let dist = 0, i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; } else { dist++; j++; }
  }
  dist += a.length - i;
  return dist <= 2;
}

const KIN_PRESET = { name: 'KIN', dosage: '-', forme: 'BAIN DE BOUCHE', posologie: '1 rinçage / jour pendant 7 jours' };

const DEFAULT_MOROCCO_PRESETS = [
  {
    label: 'Avulsion Simple',
    color: 'blue',
    drugs: [
      { name: 'DOLIPRANE', dosage: '1G', forme: 'COMPRIMÉS', posologie: '1 cp x 3 / jour pendant 4 jours' },
      { name: 'HEXTRIL', dosage: '-', forme: 'BAIN DE BOUCHE', posologie: '2 rincages / jour pendant 7 jours' }
    ]
  },
  {
    label: 'Extraction Sagesse / Chirurgie',
    color: 'rose',
    drugs: [
      { name: 'CLAMOXYL', dosage: '1G', forme: 'GÉLULES', posologie: '1 gél Matin et Soir pendant 6 jours' },
      { name: 'ANTADYS', dosage: '100MG', forme: 'COMPRIMÉS', posologie: '1 cp Matin et Soir pendant 3 jours (au milieu des repas)' },
      { name: 'DOLIPRANE', dosage: '1G', forme: 'COMPRIMÉS', posologie: '1 cp x 3 / jour si douleur' },
      { name: 'HEXTRIL', dosage: '-', forme: 'BAIN DE BOUCHE', posologie: '2 rincages / jour à partir de demain' }
    ]
  },
  {
    label: 'Abcès / Infection',
    color: 'emerald',
    drugs: [
      { name: 'AUGMENTIN', dosage: '1G', forme: 'SACHETS', posologie: '1 sach Matin et Soir pendant 7 jours' },
      { name: 'DOLIPRANE', dosage: '1G', forme: 'COMPRIMÉS', posologie: '1 cp x 3 / jour si douleur' }
    ]
  },
  {
    label: 'Gingivite / Parodontite',
    color: 'teal',
    drugs: [
      { name: 'BI-RODOGYL', dosage: '-', forme: 'COMPRIMÉS', posologie: '1 cp x 3 / jour pendant 6 jours' },
      { name: 'HEXTRIL', dosage: '-', forme: 'BAIN DE BOUCHE', posologie: '2 rincages / jour pendant 10 jours' },
      { name: 'DOLIPRANE', dosage: '1G', forme: 'COMPRIMÉS', posologie: '1 cp x 3 / jour si douleur' }
    ]
  },
  {
    label: 'Pulpite / Douleur Aiguë',
    color: 'amber',
    drugs: [
      { name: 'ALGODONT', dosage: '-', forme: 'COMPRIMÉS', posologie: '1 cp x 3 / jour' },
      { name: 'SOLUPRED', dosage: '20MG', forme: 'COMPRIMÉS', posologie: '3 cp le matin pendant 3 jours' }
    ]
  },
  {
    label: 'Chirurgie Implantaire',
    color: 'indigo',
    drugs: [
      { name: 'AUGMENTIN', dosage: '1G', forme: 'SACHETS', posologie: '1 sach Matin et Soir pendant 7 jours' },
      { name: 'SOLUPRED', dosage: '20MG', forme: 'COMPRIMÉS', posologie: '3 cp le matin pendant 3 jours' },
      { name: 'ANTADYS', dosage: '100MG', forme: 'COMPRIMÉS', posologie: '1 cp Matin et Soir pendant 3 jours' },
      { name: 'HEXTRIL', dosage: '-', forme: 'BAIN DE BOUCHE', posologie: '2 rincages / jour' }
    ]
  }
];

function getFormeIcon(forme: string) {
  const match = FORMES.find(f => forme.startsWith(f.l) || forme.toUpperCase().startsWith(f.l));
  const Icon = match?.icon || Pill;
  return <Icon size={13} />;
}

function useDebounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; }, [fn]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  return useCallback((...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fnRef.current(...args);
    }, delay);
  }, [delay]) as T;
}


export const PrescriptionAgenticStudio: React.FC<PrescriptionAgenticStudioProps> = ({
  patientId, drugs, setDrugs, onUpdateDrug, onRemoveDrug, onAddDrug,
  validationErrors, onSaveHabit, coherenceWarnings = [],
}) => {
  const [step, setStep] = useState<'IDLE' | 'RESEARCH' | 'ASSESSMENT' | 'PLANNING'>('IDLE');
  const [assessment, setAssessment] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [activeSearchId, setActiveSearchId] = useState<{ id: number; field: string } | null>(null);
  const [suggestions, setSuggestions] = useState<{ medications: string[]; dosages: string[]; posologies: string[] }>({
    medications: [], dosages: [], posologies: [],
  });
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
  const [guideWeight, setGuideWeight] = useState(25);
  const [guideAge, setGuideAge] = useState(8);

  // --- MOVE DRUG LOGIC ---
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

  // --- QUICK ENTRY EVOLVED ---
  const [quickVal, setQuickVal] = useState('');
  const [quickSuggestions, setQuickSuggestions] = useState<string[]>([]);
  const [quickHighlightedIdx, setQuickHighlightedIdx] = useState(-1);

  // --- SILENT CLINICAL ASSESSMENT (Phase 2) ---
  useEffect(() => {
    if (!patientId) return;
    
    const silentResearch = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/prescriptions/agentic/assessment/${patientId}`);
        setAssessment(res.data);
        if (res.data?.age) setGuideAge(res.data.age);
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

  // --- Autocomplete avec debounce (250ms) ---
  const fetchSuggestions = useCallback(async (id: number, field: string, val: string, abortSignal?: AbortSignal) => {
    try {
      if (field === 'name' && val.length >= 1) {
        const res = await api.get(`/prescriptions/habits/suggest?q=${encodeURIComponent(val)}`, { signal: abortSignal });
        const data = res.data;
        // Fuzzy fallback: if API returned nothing, scan presets locally
        if ((!data.medications || data.medications.length === 0)) {
          const allPresetNames = DEFAULT_MOROCCO_PRESETS.flatMap(p => p.drugs.map(d => d.name));
          const kinNames = ['KIN'];
          const pool = [...new Set([...allPresetNames, ...kinNames])];
          const fuzzyHits = pool.filter(n => fuzzyMatch(val, n));
          if (fuzzyHits.length > 0) {
            setSuggestions({ medications: fuzzyHits, dosages: [], posologies: [] });
            return;
          }
        }
        setSuggestions(data);
      } else if ((field === 'dosage' || field === 'posologie')) {
        const drug = drugs.find(d => d.id === id);
        if (drug?.name) {
          const res = await api.get(`/prescriptions/habits/details?med_name=${encodeURIComponent(drug.name)}`, { signal: abortSignal });
          setSuggestions({ medications: [], ...res.data });
        }
      }
    } catch (err: any) {
      if (err.name === 'CanceledError') return;
      console.error('Fetch suggestions error:', err);
    }
  }, [drugs]);
  
  const fetchPresets = useCallback(async () => {
    try {
      const res = await api.get('/prescriptions/habits/presets');
      setPresets(res.data);
    } catch (err) {
      console.error('Erreur presets:', err);
    }
  }, []);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

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
  };

  const handleQuickSearch = useDebounce(async (val: string) => {
    const trimmed = val.trim();
    // On cherche le médicament (le premier mot)
    const searchPart = trimmed.split(' ')[0];
    
    if (searchPart.length < 1) {
      setQuickSuggestions([]);
      return;
    }

    try {
      const res = await api.get(`/prescriptions/habits/suggest?q=${encodeURIComponent(searchPart)}`);
      const meds = res.data.medications || [];
      console.log(`[QuickSearch] Found ${meds.length} meds for "${searchPart}"`);
      setQuickSuggestions(meds);
    } catch (err) {
      console.error('Quick search error:', err);
    }
  }, 300);


  const parseQuickEntry = (text: string): DrugItem => {
    const originalText = text;
    const lowerText = text.toLowerCase();
    const parts = text.trim().split(/\s+/);
    
    // Détection Radio / Examen
    const radioKeywords = ['radio', 'télé-radio', 'teleradio', 'conebeam', 'scanner', 'irm', 'panoramique', 'rvg', 'bitewing', 'status', 'dentoscan', 'cbct', 'examen'];
    const isExamen = radioKeywords.some(k => lowerText.includes(k));

    const drug: DrugItem = {
      id: Date.now(),
      name: parts[0].toUpperCase(),
      dosage: '',
      forme: isExamen ? '' : 'COMPRIMÉS',
      posologie: '',
      type: isExamen ? 'EXAMEN' : 'MEDICAMENT',
      quantite: 1,
      non_substituable: false
    };

    if (isExamen) {
      // Pour les examens, on prend tout le texte comme nom si c'est court, 
      // ou on laisse le premier mot et le reste en posologie (instructions)
      if (parts.length <= 3) {
        drug.name = text.toUpperCase().trim();
        drug.posologie = '';
      } else {
        drug.name = parts.slice(0, 2).join(' ').toUpperCase();
        drug.posologie = parts.slice(2).join(' ').trim();
      }
      return drug;
    }

    // 1. Détection de la forme
    let formeTextFound = '';
    const formesMap: Record<string, string> = {
      'sachet': 'SACHETS',
      'gelule': 'GÉLULES',
      'gélule': 'GÉLULES',
      'bain': 'BAIN DE BOUCHE',
      'kin': 'BAIN DE BOUCHE',
      'sirop': 'SIROP',
      'pommade': 'POMMADE',
      'crème': 'CRÈME',
      'creme': 'CRÈME',
      'goutte': 'GOUTTES',
      'ampoule': 'AMPOULES',
      'spray': 'SPRAY',
      'comprimé': 'COMPRIMÉS',
      'comprime': 'COMPRIMÉS',
      'cp': 'COMPRIMÉS'
    };

    for (const [key, value] of Object.entries(formesMap)) {
      const reg = new RegExp(`\\b${key}s?\\b`, 'i');
      const m = text.match(reg);
      if (m) {
        drug.forme = value;
        formeTextFound = m[0];
        break;
      }
    }

    // 2. Détection du dosage (ex: 1g, 500mg)
    let dosageTextFound = '';
    const dosageMatch = text.match(/\b\d+(\s?)(g|mg|mcg|ml|l|ui)\b/i);
    if (dosageMatch) {
      drug.dosage = dosageMatch[0].toUpperCase().replace(/\s/g, '');
      dosageTextFound = dosageMatch[0];
    }

    // 3. Détection de la quantité
    let qtyTextFound = '';
    const qtyMatch = text.match(/(qsp|x|qty|qté|qte)\s*(\d+)/i) || text.match(/\b(\d+)\s*(boite|boîte|pack|unité)s?\b/i);
    if (qtyMatch) {
      const num = qtyMatch[2] || qtyMatch[1];
      drug.quantite = parseInt(num);
      qtyTextFound = qtyMatch[0];
    }

    // 4. Extraction de la posologie (le reste du texte)
    let poso = originalText;
    
    // On retire le nom s'il est au début
    if (poso.toUpperCase().startsWith(drug.name)) {
      poso = poso.substring(drug.name.length);
    }
    
    // Retrait chirurgical des éléments identifiés pour ne laisser que la posologie
    if (dosageTextFound) poso = poso.replace(dosageTextFound, '');
    if (formeTextFound) poso = poso.replace(formeTextFound, '');
    if (qtyTextFound) poso = poso.replace(qtyTextFound, '');

    drug.posologie = poso.replace(/\s+/g, ' ').trim();
    
    return drug;
  };

  const applySuggestion = useCallback((id: number, field: string, val: string) => {
    onUpdateDrug(id, field as keyof DrugItem, val);
    setSuggestions({ medications: [], dosages: [], posologies: [] });
    setActiveSearchId(null);
    if (field === 'name') {
      // KIN: auto-fill preset directly without API round-trip
      if (val.toUpperCase() === 'KIN') {
        onUpdateDrug(id, 'dosage', KIN_PRESET.dosage);
        onUpdateDrug(id, 'forme', KIN_PRESET.forme as any);
        onUpdateDrug(id, 'posologie', KIN_PRESET.posologie);
        return;
      }
      api.get(`/prescriptions/habits/details?med_name=${encodeURIComponent(val)}`).then(res => {
        if (res.data.dosages?.length === 1) onUpdateDrug(id, 'dosage', res.data.dosages[0]);
        if (res.data.posologies?.length === 1) onUpdateDrug(id, 'posologie', res.data.posologies[0]);
      }).catch(() => {});
    }
  }, [onUpdateDrug]);

  // FIX 3 — Vérification déterministe locale, indépendante de l'assessment IA
  const checkLocalSafetyConstraints = useCallback((
    antecedents: string,
    _isChildAge: boolean
  ): { blocked: boolean; reason: string } => {
    const history = (antecedents || '').toUpperCase();

    // Allergie pénicilline
    const PENICILLIN_KEYWORDS = ['PENICILLINE', 'PENICILLIN', 'AMOXICILLINE', 'CLAMOXYL', 'AUGMENTIN', 'BETA-LACTAMINE'];
    const isAllergicToPenicillin = history.includes('ALLERGI') &&
      PENICILLIN_KEYWORDS.some(k => history.includes(k));

    // Grossesse
    const PREGNANCY_KEYWORDS = ['GROSSESSE', 'ENCEINTE', 'PREGNANT', 'TRIMESTRE'];
    const isPregnant = PREGNANCY_KEYWORDS.some(k => history.includes(k));

    return {
      blocked: isAllergicToPenicillin || isPregnant,
      reason: isAllergicToPenicillin
        ? '⚠️ Allergie pénicilline détectée dans les antécédents.'
        : isPregnant
        ? '⚠️ Grossesse détectée dans les antécédents. Vérifiez les contre-indications.'
        : ''
    };
  }, []);

  const applyPresetWithSafety = useCallback((presetDrugs: any[], presetLabel?: string) => {
    // 1. Détection de l'âge du patient (si dispo dans assessment)
    const isChild = assessment?.age < 15 || assessment?.is_child;
    const history = (assessment?.patient_context?.antecedents || assessment?.antecedents || "").toUpperCase();

    // FIX 3 — Vérification déterministe locale AVANT toute logique IA
    const localSafety = checkLocalSafetyConstraints(
      assessment?.patient_context?.antecedents || assessment?.antecedents || '',
      isChild
    );
    if (localSafety.blocked) {
      toast(localSafety.reason, { icon: '⚠️', duration: 6000 });
    }

    const adaptedDrugs = presetDrugs.map((d: any, i: number) => {
      const drug = { ...d, id: Date.now() + i, type: 'MEDICAMENT' as const, quantite: 1, non_substituable: false };

      // LOGIQUE D'ADAPTATION SMART
      // a. Allergie Pénicilline
      if (history.includes('ALLERGIE') && (history.includes('PENICILLINE') || history.includes('CLAMOXYL') || history.includes('AUGMENTIN'))) {
        if (drug.name.includes('CLAMOXYL') || drug.name.includes('AMOXICILLINE') || drug.name.includes('AUGMENTIN')) {
          drug.name = 'RODOGYL';
          drug.dosage = '-';
          drug.posologie = '1 cp x 3 / jour pendant 7 jours (Substitution Allergie)';
        }
      }

      // b. Ajustement Pédiatrique (Simplifié)
      if (isChild) {
        if (drug.name === 'DOLIPRANE' && drug.dosage === '1G') {
          drug.dosage = '500MG';
          drug.posologie = drug.posologie.replace('1 cp', '1/2 cp');
        }
        if (drug.name === 'ANTADYS') {
          drug.name = 'PARACETAMOL'; // On évite les AINS forts chez le petit enfant par précaution ici
          drug.dosage = '500MG';
        }
      }

      return drug;
    });

    // FIX 1 — Déduplication paracétamol : évite le double dosage pédiatrique
    const PARACETAMOL_NAMES = ['paracetamol', 'doliprane', 'efferalgan', 'dafalgan', 'perfalgan'];
    const isParacetamol = (name: string) =>
      PARACETAMOL_NAMES.some(n => name.toLowerCase().includes(n));

    const deduplicatedDrugs = adaptedDrugs.reduce((acc: DrugItem[], drug: DrugItem) => {
      if (isParacetamol(drug.name)) {
        const existingParacetamol = acc.find(d => isParacetamol(d.name));
        if (existingParacetamol) {
          // Garder la ligne existante, ignorer le doublon
          console.warn(`[Safety] Doublon paracétamol supprimé : ${drug.name}`);
          return acc;
        }
      }
      acc.push(drug);
      return acc;
    }, []);

    setDrugs(deduplicatedDrugs);
    setNewPresetName(presetLabel || '');
    setStep('PLANNING');

    if (isChild) {
      toast("Ordonnance adaptée au profil pédiatrique.", { icon: '👶' });
    } else {
      toast.success(presetLabel ? `Protocole "${presetLabel}" appliqué.` : "Protocole appliqué.");
    }
  }, [assessment, setDrugs, checkLocalSafetyConstraints]);

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
    setSavingAsPreset(true);
    try {
      await api.post('/prescriptions/preferences', {
        act_code: newPresetName.toUpperCase(),
        drugs: drugs.map(d => ({
          name: d.name, dosage: d.dosage, forme: d.forme, posologie: d.posologie
        }))
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

  // Ajouter une molécule depuis les suggestions IA — sans race condition
  const addMolecule = useCallback((molecule: string, forcedDosage?: string, forcedPosology?: string) => {
    const newId = Date.now();
    const newDrug: DrugItem = {
      id: newId, name: molecule, dosage: forcedDosage || '', forme: 'COMPRIMÉS',
      posologie: forcedPosology || '', type: 'MEDICAMENT', quantite: 1, non_substituable: false,
    };
    setDrugs([...drugs, newDrug]);
    // Récupère les détails habituels après que le drug est dans le state seulement si pas de dosage forcé
    if (!forcedDosage || !forcedPosology) {
      api.get(`/prescriptions/habits/details?med_name=${encodeURIComponent(molecule)}`).then(res => {
        if (!forcedDosage && res.data.dosages?.length === 1) onUpdateDrug(newId, 'dosage', res.data.dosages[0]);
        if (!forcedPosology && res.data.posologies?.length === 1) onUpdateDrug(newId, 'posologie', res.data.posologies[0]);
      }).catch(() => {});
    }
  }, [drugs, setDrugs, onUpdateDrug]);



  // Fermeture du dropdown Forme au scroll ou resize
  useEffect(() => {
    if (!formeDropdownCoords) return;
    const close = () => { setActiveSearchId(null); setFormeDropdownCoords(null); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [formeDropdownCoords]);

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

  // Keyboard navigation dans les suggestions
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
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

  return (
    <div className="space-y-6">
      {/* HEADER ELITE CONDENSÉ */}
      <div className="flex items-center justify-between bg-white/40 p-4 rounded-[2rem] border border-white/60 backdrop-blur-2xl shadow-lg shadow-primary/5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-blue-600 text-white rounded-xl flex items-center justify-center relative z-10 shadow-md shadow-primary/30">
              <Brain size={20} className={loading ? 'animate-pulse' : ''} />
            </div>
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
          {/* COHERENCE BADGE COMPACT */}
          <div className={cn(
            "px-3 py-1.5 rounded-xl border transition-all flex items-center gap-2",
            coherenceWarnings.length === 0 
              ? "bg-emerald-50/50 border-emerald-100 text-emerald-600" 
              : "bg-amber-50/50 border-amber-100 text-amber-600 animate-pulse"
          )}>
            <ShieldCheck size={12} className={coherenceWarnings.length > 0 ? "hidden" : ""} />
            <AlertCircle size={12} className={coherenceWarnings.length === 0 ? "hidden" : ""} />
            <span className="text-[8px] font-black uppercase tracking-widest">
              {coherenceWarnings.length === 0 ? "Cohérence OK" : "Audit Requis"}
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
            <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Guide IA</span>
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
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
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

      {/* COMMAND BAR & SPEED-PILLS (Phase 3) */}
      <div className="space-y-4">
          <div className="relative group">
            <div className="absolute inset-y-0 left-6 flex items-center text-primary/40 group-focus-within:text-primary transition-colors">
              <Zap size={18} />
            </div>
            <input
              type="text"
              value={quickVal}
              onChange={(e) => {
                const v = e.target.value;
                setQuickVal(v);
                handleQuickSearch(v);
              }}
              className="w-full bg-white/60 border border-white/80 backdrop-blur-xl rounded-[2rem] pl-16 pr-8 py-5 text-sm font-bold text-slate-800 focus:bg-white focus:border-primary/30 focus:shadow-2xl focus:shadow-primary/5 transition-all outline-none placeholder:text-slate-300"
              placeholder="Saisie Rapide : Taper un médicament, un dosage ou une posologie... (Ex: Augmentin 1g sachet 2x/j)"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setQuickHighlightedIdx(i => Math.min(i + 1, quickSuggestions.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setQuickHighlightedIdx(i => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  let finalVal = quickVal;
                  if (quickHighlightedIdx >= 0) {
                    const sugg = quickSuggestions[quickHighlightedIdx];
                    const parts = quickVal.split(' ');
                    parts[0] = sugg; // On remplace le premier mot par la suggestion
                    finalVal = parts.join(' ');
                  }
                  
                  if (finalVal.trim()) {
                    const newDrug = parseQuickEntry(finalVal);
                    setDrugs([newDrug, ...drugs]);
                    setQuickVal('');
                    setQuickSuggestions([]);
                    setQuickHighlightedIdx(-1);
                    setStep('PLANNING');
                  }
                } else if (e.key === 'Escape') {
                  setQuickSuggestions([]);
                }
              }}
              onBlur={() => setTimeout(() => setQuickSuggestions([]), 200)}
            />
            
            {/* SUGGESTIONS SAISIE RAPIDE */}
            <AnimatePresence>
              {quickSuggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute left-6 right-6 top-full mt-2 bg-white border border-slate-200 rounded-3xl shadow-2xl z-[999] overflow-hidden py-3"

                >
                  <div className="px-6 py-2 border-b border-slate-50 mb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Suggestions de médicaments</span>
                  </div>
                  {quickSuggestions.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => {
                        const parts = quickVal.split(' ');
                        parts[0] = s;
                        const final = parts.join(' ');
                        const newDrug = parseQuickEntry(final);
                        setDrugs([newDrug, ...drugs]);
                        setQuickVal('');
                        setQuickSuggestions([]);
                        setStep('PLANNING');
                      }}
                      className={cn(
                        "w-full px-8 py-3 text-left text-sm font-bold transition-all flex items-center justify-between group",
                        i === quickHighlightedIdx ? "bg-primary text-white" : "text-slate-600 hover:bg-primary/5 hover:text-primary"
                      )}
                    >
                      <span>{s}</span>
                      <ChevronRight size={14} className={cn("transition-transform", i === quickHighlightedIdx ? "translate-x-1" : "opacity-0 group-hover:opacity-100")} />
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest border border-slate-200 px-2 py-1 rounded-lg">↵ ENTER POUR AJOUTER</span>
            </div>
          </div>

      </div>

      {/* PRESETS BAR */}
      <AnimatePresence>
        {showPresets && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center justify-between px-4 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Protocoles Cliniques</span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span className="text-[8px] font-bold text-slate-300 uppercase italic">Smart Adaptation active</span>
              </div>
              <button onClick={() => setShowPresets(false)} className="text-[9px] font-black text-slate-300 hover:text-slate-500 uppercase tracking-tighter transition-colors">Masquer</button>
            </div>

            <div className="px-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* BLOC 1 — Protocoles Système */}
              <div className="space-y-1.5">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Protocoles Système</span>
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-white border border-slate-200 rounded-2xl px-4 py-2.5 pr-8 text-[9px] font-black text-slate-600 uppercase tracking-widest cursor-pointer hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
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
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                    <ChevronDown size={12} />
                  </div>
                </div>
              </div>

              {/* BLOC 2 — Mes Ordonnances (Cabinet) */}
              <div className="space-y-1.5">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Mes Ordonnances</span>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <select
                      className="w-full appearance-none bg-white border border-slate-200 rounded-2xl px-4 py-2.5 pr-8 text-[9px] font-black text-slate-600 uppercase tracking-widest cursor-pointer hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                      <ChevronDown size={12} />
                    </div>
                  </div>
                  {selectedUserPreset && (
                    <button
                      onClick={() => { deletePreset(selectedUserPreset); setSelectedUserPreset(''); }}
                      className="w-9 h-9 flex-shrink-0 bg-red-50 border border-red-100 text-red-400 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-sm font-black"
                      title="Supprimer cette ordonnance"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
          <motion.div
            key="assessment"
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
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
                        <button
                          key={i}
                          onClick={() => addMolecule(m.molecule)}
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
              {drugs.map((drug, idx) => {
                const fieldError = validationErrors.find(e => e.field === `drug_${idx}`);
                const isRadio = drug.type === 'EXAMEN';
                
                // SAFETY CHECK
                const history = (assessment?.patient_context?.antecedents || assessment?.antecedents || "").toUpperCase();
                const isPenicillinAllergic = history.includes('ALLERGIE') && (history.includes('PENICILLINE') || history.includes('CLAMOXYL') || history.includes('AUGMENTIN'));
                const isAllergen = drug.name && drug.name.toUpperCase().match(/AUGMENTIN|CLAMOXYL|AMOXICILLINE|PENICILLINE/);
                const isBlockedByAllergy = isPenicillinAllergic && isAllergen && !forcedDrugs.includes(drug.id);

                return (
                  <motion.div
                    key={drug.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      'bg-white/60 p-4 rounded-[1.8rem] border transition-all group relative backdrop-blur-xl',
                      fieldError ? 'border-red-200 bg-red-50/10' : 'border-white/80 hover:bg-white hover:shadow-xl hover:shadow-slate-200/20',
                      isRadio && 'border-amber-100 bg-amber-50/5',
                      isBlockedByAllergy && 'border-red-500 bg-red-50 overflow-hidden'
                    )}
                  >
                    {isBlockedByAllergy && (
                      <div className="absolute inset-0 z-50 bg-red-500/10 backdrop-blur-md flex flex-col items-center justify-center rounded-[1.8rem] border-2 border-red-500 shadow-inner">
                        <div className="bg-white px-6 py-4 rounded-2xl shadow-2xl flex flex-col items-center text-center max-w-sm">
                          <AlertCircle size={32} className="text-red-500 mb-2 animate-bounce" />
                          <h4 className="text-sm font-black text-red-600 uppercase tracking-widest mb-1">Alerte Vitale : Allergie</h4>
                          <p className="text-xs font-bold text-slate-600 mb-4">Le patient est allergique à la Pénicilline. L'ajout de <span className="text-red-500">{drug.name}</span> est bloqué par sécurité.</p>
                          <div className="flex gap-3 w-full">
                            <button onClick={() => onRemoveDrug(drug.id)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 transition-colors">
                              Retirer
                            </button>
                            <button onClick={() => setForcedDrugs(prev => [...prev, drug.id])} className="flex-1 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-[10px] font-black uppercase hover:bg-red-500 hover:text-white transition-colors" title="Sous votre responsabilité">
                              Forcer (Débloquer)
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-12 gap-3 items-center">
                      {/* MOVE ACTIONS (LEFT) */}
                      <div className="col-span-12 lg:col-span-1 flex flex-col items-center justify-center self-stretch border-r border-slate-100/50 pr-2">
                        <div className="flex flex-col gap-0.5 opacity-40 group-hover:opacity-100 transition-all duration-500">
                          <button
                            onClick={() => moveDrug(drug.id, 'up')}
                            disabled={idx === 0}
                            className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all disabled:opacity-0 active:scale-90"
                            title="Monter"
                          >
                            <ChevronUp size={16} strokeWidth={3} />
                          </button>
                          <div className="w-1 h-1 rounded-full bg-slate-200 mx-auto my-0.5 group-hover:bg-primary/30" />
                          <button
                            onClick={() => moveDrug(drug.id, 'down')}
                            disabled={idx === drugs.length - 1}
                            className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all disabled:opacity-0 active:scale-90"
                            title="Descendre"
                          >
                            <ChevronDown size={16} strokeWidth={3} />
                          </button>
                        </div>
                      </div>

                      {/* Toggle Type */}
                      <div className="col-span-12 lg:col-span-1 flex flex-col items-center gap-1 p-1 bg-slate-50/50 rounded-2xl border border-slate-100/50 self-stretch justify-center">
                        <button
                          type="button"
                          onClick={() => setDrugs(drugs.map(d => d.id === drug.id ? { ...d, type: 'MEDICAMENT', forme: d.forme || 'COMPRIMÉS' } : d))}
                          className={cn(
                            'p-2 rounded-xl transition-all',
                            !isRadio ? 'bg-white text-primary shadow-md shadow-primary/5 ring-1 ring-primary/5' : 'text-slate-300 hover:text-slate-400',
                          )}
                          title="Médicament"
                        >
                          <Pill size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDrugs(drugs.map(d => d.id === drug.id ? { ...d, type: 'EXAMEN', dosage: '', forme: '', posologie: '' } : d))}
                          className={cn(
                            'p-2 rounded-xl transition-all',
                            isRadio ? 'bg-white text-amber-600 shadow-md shadow-amber-500/5 ring-1 ring-amber-500/5' : 'text-slate-300 hover:text-slate-400',
                          )}
                          title="Radio / Examen"
                        >
                          <Microscope size={15} />
                        </button>
                      </div>

                      {/* Main Entry Area */}
                      <div className={cn('relative col-span-12 lg:col-span-9')}>
                        <div className="grid grid-cols-10 gap-4 items-center">
                          {/* Name & Metadata */}
                          <div className={cn("space-y-2", isRadio ? "col-span-10" : "col-span-4")}>
                            <input
                              type="text"
                              className="w-full bg-transparent border-none p-0 focus:ring-0 font-black text-slate-800 text-sm uppercase placeholder:text-slate-400 tracking-tight"
                              placeholder={isRadio ? "DÉTAILS DE L'EXAMEN RADIOLOGIQUE..." : 'NOM DU MÉDICAMENT...'}
                              value={drug.name}
                              onChange={e => handleSearch(drug.id, 'name', e.target.value.toUpperCase())}
                              onFocus={() => { if (drug.name.length >= 1) handleSearch(drug.id, 'name', drug.name); }}
                              onKeyDown={e => handleKeyDown(e, drug.id, 'name')}
                              onBlur={() => setTimeout(() => setActiveSearchId(null), 200)}
                            />

                            {!isRadio && (
                              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                                <button
                                  type="button"
                                  onClick={e => handleFormeOpen(e, drug.id)}
                                  className="bg-white/80 px-2.5 py-1.5 rounded-xl text-[8px] font-black text-primary uppercase tracking-widest border border-slate-100 hover:border-primary/20 hover:shadow-sm transition-all flex items-center gap-1.5"
                                  style={{ color: 'var(--primary)' }}
                                >
                                  {getFormeIcon(drug.forme)}
                                  {drug.forme.startsWith('AUTRE') ? 'AUTRE' : (drug.forme || 'FORME')}
                                </button>
                                
                                {drug.forme.startsWith('AUTRE') && (
                                  <input
                                    type="text"
                                    className="w-24 bg-white/50 border border-slate-200 px-2.5 py-1.5 rounded-xl focus:ring-0 text-[9px] font-black text-slate-700 uppercase tracking-widest placeholder:text-slate-400 focus:border-primary/40 transition-colors"
                                    placeholder="PRÉCISER..."
                                    value={drug.forme.includes(':') ? drug.forme.split(':')[1].trim() : ''}
                                    onChange={e => onUpdateDrug(drug.id, 'forme', `AUTRE: ${e.target.value}`)}
                                  />
                                )}
                                
                                <div className="flex items-center gap-1 bg-white/80 px-2.5 py-1.5 rounded-xl border border-slate-100 shadow-sm">
                                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Dose:</span>
                                  <input
                                    type="text"
                                    className="w-20 bg-transparent border-none p-0 focus:ring-0 text-[9px] font-black text-slate-600 uppercase tracking-widest placeholder:text-slate-400"
                                    placeholder="500MG..."
                                    value={drug.dosage}
                                    onFocus={() => handleSearch(drug.id, 'dosage', drug.dosage)}
                                    onChange={e => handleSearch(drug.id, 'dosage', e.target.value)}
                                  />
                                </div>

                                <button
                                  type="button"
                                  onClick={() => onUpdateDrug(drug.id, 'non_substituable', !drug.non_substituable)}
                                  className={cn(
                                    'px-2.5 py-1.5 rounded-xl border text-[8px] font-black uppercase tracking-widest transition-all select-none',
                                    drug.non_substituable
                                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-500/20'
                                      : 'bg-white/80 text-slate-300 border-slate-100 hover:border-slate-300 hover:text-slate-500'
                                  )}
                                  title="Non Substituable"
                                >
                                  NS
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Posologie (Medicament Only) */}
                          {!isRadio && (
                            <div className="col-span-6 relative h-full animate-in fade-in slide-in-from-right-2">
                              <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100 group-hover:bg-white transition-all focus-within:ring-2 focus-within:ring-primary/5 focus-within:border-primary/20 focus-within:shadow-sm">
                                <textarea
                                  rows={1}
                                  className="w-full bg-transparent border-none p-0 text-[11px] font-bold text-slate-600 focus:ring-0 resize-none placeholder:text-slate-300 leading-tight"
                                  placeholder="ex : 1 gél. × 3/jour pendant 7j"
                                  value={drug.posologie}
                                  onFocus={() => handleSearch(drug.id, 'posologie', drug.posologie)}
                                  onChange={e => {
                                    handleSearch(drug.id, 'posologie', e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = `${e.target.scrollHeight}px`;
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Autocomplete nom (Medicament Only) */}
                        <AnimatePresence>
                          {activeSearchId?.id === drug.id && activeSearchId?.field === 'name' && suggestions.medications.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                              className="absolute left-0 top-full mt-2 w-full min-w-[240px] bg-white border border-slate-100 rounded-2xl shadow-2xl z-[100] overflow-hidden py-2 max-h-[300px] overflow-y-auto custom-scrollbar"
                            >
                              {suggestions.medications.map((m, i) => (
                                <button
                                  key={m}
                                  onClick={() => applySuggestion(drug.id, 'name', m)}
                                  className={cn(
                                    'w-full px-5 py-3 text-left text-[10px] font-black text-slate-600 transition-colors flex items-center justify-between',
                                    i === highlightedIdx ? 'bg-primary/10 text-primary' : 'hover:bg-primary/5 hover:text-primary',
                                  )}
                                >
                                  {m}
                                  <ChevronRight size={12} className="opacity-40" />
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* REMOVE ACTION (RIGHT) */}
                      <div className="col-span-12 lg:col-span-1 flex items-center justify-end">
                        <button
                          onClick={() => onRemoveDrug(drug.id)}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-95"
                          title="Supprimer"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Discreet Safety Status Badge */}
            <div className="flex items-center justify-end px-4">
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all cursor-help",
                coherenceWarnings.length > 0 
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-600" 
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
              )} title={coherenceWarnings.length > 0 ? "Avertissements de sécurité détectés" : "Validation de sécurité IAmina : OK"}>
                {coherenceWarnings.length > 0 ? <AlertCircle size={12} /> : <ShieldCheck size={12} />}
                <span className="text-[8px] font-black uppercase tracking-widest">
                  {coherenceWarnings.length > 0 ? `${coherenceWarnings.length} Alertes` : "Sécurité Validée"}
                </span>
              </div>
            </div>

            {/* Actions bas de formulaire */}
            <div className="flex flex-wrap justify-center gap-4 mt-6">
              <button
                onClick={onAddDrug}
                className="flex-1 min-w-[200px] py-5 border-2 border-dashed border-slate-200 text-slate-400 rounded-[2.5rem] flex items-center justify-center gap-3 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all font-black text-xs uppercase tracking-widest"
              >
                <Plus size={20} /> Ajouter une ligne
              </button>

              {drugs.length > 0 && (
                <button
                  onClick={() => setShowSavePresetModal(true)}
                  className="flex-1 min-w-[200px] py-5 bg-slate-800 text-white rounded-[2.5rem] flex items-center justify-center gap-3 hover:bg-primary transition-all font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-900/10"
                >
                  <ShieldCheck size={20} className="text-blue-400" /> Mémoriser ce Preset
                </button>
              )}
            </div>

            {/* CONSEILS AU PATIENT */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowPatientAdvice(v => !v)}
                className="flex items-center gap-2 text-[9px] font-black text-slate-400 hover:text-primary uppercase tracking-widest transition-colors px-2"
              >
                <div className={cn("w-3 h-3 rounded-full border-2 border-current transition-colors", showPatientAdvice ? "bg-primary border-primary" : "border-slate-300")} />
                Conseils au Patient
                {patientAdvice.trim() && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[7px]">✓</span>}
              </button>
              <AnimatePresence>
                {showPatientAdvice && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
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

      {/* MODALE ENREGISTREMENT PRESET */}
      <AnimatePresence>
        {showSavePresetModal && (
          <div className="fixed inset-0 z-[30000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" 
              onClick={() => setShowSavePresetModal(false)} 
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
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
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary/30 transition-all placeholder:text-slate-300"
                    placeholder="Saisissez le contexte clinique..."
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && saveCurrentAsPreset()}
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => setShowSavePresetModal(false)}
                    className="flex-1 py-4 bg-slate-50 text-slate-500 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all"
                  >
                    Annuler
                  </button>
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

      {/* Dropdown Forme — position: fixed pour échapper aux overflow-y-auto parents */}
      <AnimatePresence>
        {activeSearchId?.field === 'forme_dropdown' && formeDropdownCoords && (() => {
          const activeDrug = drugs.find(d => d.id === activeSearchId.id);
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              style={{
                position: 'fixed',
                top: formeDropdownCoords.top,
                left: formeDropdownCoords.left,
                width: Math.max(formeDropdownCoords.width, 208),
                zIndex: 200,
              }}
              className="bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden py-2"
            >
              {FORMES.map(f => {
                const Icon = f.icon;
                return (
                  <button
                    key={f.l}
                    onClick={() => {
                      onUpdateDrug(activeSearchId.id, 'forme', f.l === 'AUTRE' ? 'AUTRE: ' : f.l);
                      setActiveSearchId(null);
                      setFormeDropdownCoords(null);
                    }}
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

      {/* Overlay fermeture dropdowns */}
      {(suggestions.medications.length > 0 || suggestions.dosages.length > 0 || suggestions.posologies.length > 0 || activeSearchId?.field === 'forme_dropdown') && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setSuggestions({ medications: [], dosages: [], posologies: [] });
            setActiveSearchId(null);
            setFormeDropdownCoords(null);
          }}
        />
      )}

      {/* MODAL GUIDE IA PÉDIATRIQUE */}
      <AnimatePresence>
        {showGuideModal && (
          <div className="fixed inset-0 z-[40000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" 
              onClick={() => setShowGuideModal(false)} 
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2rem] p-6 w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-indigo-500/10 text-indigo-600 rounded-2xl flex items-center justify-center">
                  <Stethoscope size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Guide Pédiatrique & Posologies</h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Intelligence Dosages Maroc</p>
                </div>
                <button onClick={() => setShowGuideModal(false)} className="ml-auto w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full">×</button>
              </div>

              <div className="flex gap-4 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">Âge (ans)</label>
                  <input type="number" min={0} value={guideAge} onChange={e => setGuideAge(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold focus:border-indigo-500 outline-none" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">Poids (kg)</label>
                  <input type="number" min={0} value={guideWeight} onChange={e => setGuideWeight(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold focus:border-indigo-500 outline-none" />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                {Object.values(MOROCCAN_CLINICAL_RULES).map(rule => {
                  const ped = rule.pediatric_calc(guideWeight);
                  return (
                    <div key={rule.molecule} className="p-4 border border-slate-100 rounded-2xl hover:border-indigo-100 hover:bg-indigo-50/30 transition-all flex items-start justify-between group">
                      <div className="space-y-1 pr-4">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-800 text-sm">{rule.molecule}</h4>
                          {guideAge < 15 && <span className="bg-amber-100 text-amber-700 text-[9px] px-2 py-0.5 rounded-full font-black">PÉDIATRIE</span>}
                        </div>
                        {guideAge >= 15 ? (
                          <div className="text-xs text-slate-600">
                            <span className="font-bold text-slate-800">{rule.adult_dose}</span> — {rule.adult_posology}
                          </div>
                        ) : (
                          <div className="text-xs text-indigo-700">
                            <span className="font-bold">{ped.dosage}</span> — {ped.posology}
                          </div>
                        )}
                        <div className="text-[9px] text-rose-500 font-medium uppercase mt-2">
                          Contre-indications: {rule.contraindications.join(' • ')}
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          const dose = guideAge >= 15 ? rule.adult_dose : ped.dosage;
                          const poso = guideAge >= 15 ? rule.adult_posology : ped.posology;
                          addMolecule(rule.molecule, dose, poso);
                          setShowGuideModal(false);
                          toast.success(`${rule.molecule} ajouté.`);
                        }}
                        className="opacity-0 group-hover:opacity-100 w-8 h-8 shrink-0 bg-indigo-500 text-white rounded-xl flex items-center justify-center hover:bg-indigo-600 transition-all shadow-md"
                        title="Ajouter à l'ordonnance"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
