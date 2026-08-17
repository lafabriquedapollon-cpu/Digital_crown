import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle, ChevronDown, ChevronRight, ChevronUp, Microscope, Pill, Trash2,
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import type { DrugItem } from './prescriptionTypes';
import { getFormeIcon } from './prescriptionTypes';
import type { ValidationError } from '../useDocumentGenerator';
import { validatePrescriptionLine } from '../clinical_rules';

export interface DrugRowProps {
  drug: DrugItem;
  idx: number;
  drugsCount: number;
  assessment: any;
  validationErrors: ValidationError[];
  forcedDrugs: number[];
  activeSearchId: { id: number; field: string } | null;
  suggestions: { medications: string[]; dosages: string[]; posologies: string[] };
  highlightedIdx: number;
  medChecks: Record<number, { known: boolean; exists?: boolean; available_mg?: number[]; dci?: string }>;
  onUpdateDrug: (id: number, field: keyof DrugItem, val: any) => void;
  onRemoveDrug: (id: number) => void;
  onMove: (id: number, direction: 'up' | 'down') => void;
  onSearch: (id: number, field: string, val: string) => void;
  onKeyDown: (e: React.KeyboardEvent, id: number, field: string) => void;
  onApplySuggestion: (id: number, field: string, val: string) => void;
  onFormeOpen: (e: React.MouseEvent<HTMLButtonElement>, drugId: number) => void;
  onForceAllergy: (id: number) => void;
  onToggleType: (id: number, type: 'MEDICAMENT' | 'EXAMEN') => void;
}

export const DrugRow: React.FC<DrugRowProps> = ({
  drug, idx, drugsCount, assessment, validationErrors, forcedDrugs,
  activeSearchId, suggestions, highlightedIdx, medChecks,
  onUpdateDrug, onRemoveDrug, onMove, onSearch, onKeyDown,
  onApplySuggestion, onFormeOpen, onForceAllergy, onToggleType,
}) => {
  const fieldError = validationErrors.find(e => e.field === `drug_${idx}`);
  const isRadio = drug.type === 'EXAMEN';

  const history = (assessment?.patient_context?.antecedents || assessment?.antecedents || '').toUpperCase();
  const isPenicillinAllergic =
    history.includes('ALLERGIE') &&
    (history.includes('PENICILLINE') || history.includes('CLAMOXYL') || history.includes('AUGMENTIN'));
  const isAllergen = drug.name?.toUpperCase().match(/AUGMENTIN|CLAMOXYL|AMOXICILLINE|PENICILLINE/);
  const isBlockedByAllergy = isPenicillinAllergic && isAllergen && !forcedDrugs.includes(drug.id);

  const dosageCheck = !isRadio && drug.name
    ? validatePrescriptionLine(drug.name, drug.dosage, assessment?.age, history)
    : null;

  const medCheck = medChecks[drug.id];
  const fmtMg = (mg: number) => (mg < 1000 ? `${mg}mg` : `${mg / 1000}g`);
  const nationalMsg =
    medCheck && medCheck.known && medCheck.exists === false && medCheck.available_mg?.length
      ? `Dosage non répertorié au Maroc${medCheck.dci ? ` (${medCheck.dci})` : ''} — existant : ${medCheck.available_mg.map(fmtMg).join(', ')}.`
      : null;

  const ghostMessages = [...(dosageCheck?.messages || [])];
  if (nationalMsg) ghostMessages.push(nationalMsg);
  const ghostDanger = dosageCheck?.level === 'danger';

  // Le parent (PrescriptionAgenticStudio) affiche un overlay plein écran en
  // `fixed z-40` pour fermer les suggestions au clic extérieur. Cette ligne a
  // `position: relative` sans z-index propre, donc son dropdown à z-[100] reste
  // scopé au stacking context local de la ligne (créé par le `transform` de
  // framer-motion) : il perd face au z-40 de l'overlay, qui capte alors le clic
  // à la place du bouton de suggestion (invisible car l'overlay est transparent
  // — d'où "je clique sur une suggestion et rien ne se passe"). On élève
  // uniquement la ligne dont le dropdown nom est ouvert au-dessus de l'overlay.
  const isNameSuggestOpen =
    activeSearchId?.id === drug.id && activeSearchId?.field === 'name' && suggestions.medications.length > 0;

  return (
    <motion.div
      key={drug.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'bg-white/60 p-4 rounded-[1.8rem] border transition-all group relative backdrop-blur-xl',
        fieldError ? 'border-red-200 bg-red-50/10' : 'border-white/80 hover:bg-white hover:shadow-xl hover:shadow-slate-200/20',
        isRadio && 'border-amber-100 bg-amber-50/5',
        isBlockedByAllergy && 'border-red-500 bg-red-50 overflow-hidden',
        isNameSuggestOpen && 'z-50',
      )}
    >
      {isBlockedByAllergy && (
        <div className="absolute inset-0 z-50 bg-red-500/10 backdrop-blur-md flex flex-col items-center justify-center rounded-[1.8rem] border-2 border-red-500 shadow-inner">
          <div className="bg-white px-6 py-4 rounded-2xl shadow-2xl flex flex-col items-center text-center max-w-sm">
            <AlertCircle size={32} className="text-red-500 mb-2 animate-bounce" />
            <h4 className="text-sm font-black text-red-600 uppercase tracking-widest mb-1">Alerte Vitale : Allergie</h4>
            <p className="text-xs font-bold text-slate-600 mb-4">
              Le patient est allergique à la Pénicilline. L'ajout de{' '}
              <span className="text-red-500">{drug.name}</span> est bloqué par sécurité.
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => onRemoveDrug(drug.id)}
                className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 transition-colors"
              >
                Retirer
              </button>
              <button
                onClick={() => onForceAllergy(drug.id)}
                className="flex-1 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-[10px] font-black uppercase hover:bg-red-500 hover:text-white transition-colors"
                title="Sous votre responsabilité"
              >
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
              onClick={() => onMove(drug.id, 'up')}
              disabled={idx === 0}
              className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all disabled:opacity-0 active:scale-90"
              title="Monter"
            >
              <ChevronUp size={16} strokeWidth={3} />
            </button>
            <div className="w-1 h-1 rounded-full bg-slate-200 mx-auto my-0.5 group-hover:bg-primary/30" />
            <button
              onClick={() => onMove(drug.id, 'down')}
              disabled={idx === drugsCount - 1}
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
            onClick={() => onToggleType(drug.id, 'MEDICAMENT')}
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
            onClick={() => onToggleType(drug.id, 'EXAMEN')}
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
            <div className={cn('space-y-2', isRadio ? 'col-span-10' : 'col-span-4')}>
              <input
                type="text"
                className="w-full bg-transparent border-none px-0 py-2.5 focus:ring-0 font-black text-slate-800 text-sm uppercase placeholder:text-slate-400 tracking-tight"
                placeholder={isRadio ? "DÉTAILS DE L'EXAMEN RADIOLOGIQUE..." : 'NOM DU MÉDICAMENT...'}
                value={drug.name}
                onChange={e => onSearch(drug.id, 'name', e.target.value.toUpperCase())}
                onFocus={() => { if (drug.name.length >= 1) onSearch(drug.id, 'name', drug.name); }}
                onKeyDown={e => onKeyDown(e, drug.id, 'name')}
                onBlur={() => setTimeout(() => {}, 200)}
              />

              {!isRadio && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                  <button
                    type="button"
                    onClick={e => onFormeOpen(e, drug.id)}
                    className="bg-white/80 px-3 py-2 rounded-xl text-xs font-black text-primary uppercase tracking-wide border border-slate-100 hover:border-primary/20 hover:shadow-sm transition-all flex items-center gap-1.5"
                    style={{ color: 'var(--primary)' }}
                  >
                    {getFormeIcon(drug.forme)}
                    {drug.forme.startsWith('AUTRE') ? 'AUTRE' : (drug.forme || 'FORME')}
                  </button>

                  {drug.forme.startsWith('AUTRE') && (
                    <input
                      type="text"
                      className="w-28 bg-white/50 border border-slate-200 px-3 py-2 rounded-xl focus:ring-0 text-xs font-black text-slate-700 uppercase tracking-wide placeholder:text-slate-400 focus:border-primary/40 transition-colors"
                      placeholder="PRÉCISER..."
                      value={drug.forme.includes(':') ? drug.forme.split(':')[1].trim() : ''}
                      onChange={e => onUpdateDrug(drug.id, 'forme', `AUTRE: ${e.target.value}`)}
                    />
                  )}

                  <div className="flex items-center gap-1 bg-white/80 px-2.5 py-2.5 rounded-xl border border-slate-100 shadow-sm">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Dose:</span>
                    <input
                      type="text"
                      className="w-24 bg-transparent border-none p-0 focus:ring-0 text-xs font-black text-slate-700 uppercase tracking-wide placeholder:text-slate-400"
                      placeholder="500MG..."
                      value={drug.dosage}
                      onFocus={() => onSearch(drug.id, 'dosage', drug.dosage)}
                      onChange={e => onSearch(drug.id, 'dosage', e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => onUpdateDrug(drug.id, 'non_substituable', !drug.non_substituable)}
                    className={cn(
                      'px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-wide transition-all select-none',
                      drug.non_substituable
                        ? 'bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-500/20'
                        : 'bg-white/80 text-slate-300 border-slate-100 hover:border-slate-300 hover:text-slate-500',
                    )}
                    title="Non Substituable"
                  >
                    NS
                  </button>
                </div>
              )}
            </div>

            {/* Posologie */}
            {!isRadio && (
              <div className="col-span-6 relative h-full animate-in fade-in slide-in-from-right-2">
                <div className="bg-slate-50/50 px-3 py-3.5 rounded-2xl border border-slate-100 group-hover:bg-white transition-all focus-within:ring-2 focus-within:ring-primary/5 focus-within:border-primary/20 focus-within:shadow-sm">
                  <textarea
                    rows={2}
                    className="w-full bg-transparent border-none p-0 text-sm font-semibold text-slate-700 focus:ring-0 resize-none placeholder:text-slate-400 leading-relaxed min-h-[3rem]"
                    placeholder="ex : 1 gél. × 3/jour pendant 7j"
                    value={drug.posologie}
                    onFocus={() => onSearch(drug.id, 'posologie', drug.posologie)}
                    onChange={e => {
                      onSearch(drug.id, 'posologie', e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Ghost Brain alerts */}
          {ghostMessages.length > 0 && (
            <div
              className={cn(
                'mt-2 flex flex-col gap-1 rounded-xl px-3 py-2 border text-[10px] font-bold',
                ghostDanger
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700',
              )}
            >
              {ghostMessages.map((msg, mi) => (
                <div key={mi} className="flex items-start gap-1.5">
                  <AlertCircle size={12} className="shrink-0 mt-0.5" />
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Autocomplete nom */}
          <AnimatePresence>
            {activeSearchId?.id === drug.id && activeSearchId?.field === 'name' && suggestions.medications.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                className="absolute left-0 top-full mt-2 w-full min-w-[240px] bg-white border border-slate-100 rounded-2xl shadow-2xl z-[100] overflow-hidden py-2 max-h-[300px] overflow-y-auto custom-scrollbar"
              >
                {suggestions.medications.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    onMouseDown={e => {
                      // onMouseDown (pas onClick) : le mousedown précède le blur
                      // de l'input dans l'ordre des événements navigateur.
                      // preventDefault empêche l'input de perdre le focus et le
                      // dropdown de se fermer avant que la sélection ne s'applique.
                      e.preventDefault();
                      onApplySuggestion(drug.id, 'name', m);
                    }}
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
            title="Supprimer cette ligne"
            aria-label="Supprimer cette ligne de l'ordonnance"
          >
            <Trash2 size={18} />
            <span className="ml-2 text-xs font-bold lg:hidden">Supprimer la ligne</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
};
