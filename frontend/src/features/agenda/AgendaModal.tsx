import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Clock, User, FileText, Search, Plus, Check, MessageCircle, Calendar, Sparkles, AlertCircle, ArrowRight, Trash2, Ghost } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import type { AppointmentStatus } from './DailyView';
import { cn } from '../../utils/cn';
export type SchedulingType = 'EXACT_TIME' | 'MORNING' | 'AFTERNOON' | 'FULL_DAY';

import { useClinicalRef } from '../clinical-ref/useClinicalRef';
import { ClinicalRefSidebar } from '../clinical-ref/ClinicalRefSidebar';
import { useEliteStore } from '../../stores/useEliteStore';

interface Patient {
  id: number;
  nom: string;
  prenom: string;
  numero_dossier?: string;
}

interface ClinicalAct {
  id: number;
  name: string;
  base_price: number;
}

interface AgendaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  selectedDate: Date | null;
  initialTime?: string;
  editingAppointment?: any;
}

export const AgendaModal: React.FC<AgendaModalProps> = ({ isOpen, onClose, onSaved, selectedDate, initialTime, editingAppointment }) => {
  const navigate = useNavigate();
  const { fetchPatientIntelligence, fetchSuggestedAppointment, suggestedAppointment, isLoading: isLoadingSuggested } = useEliteStore();
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientsList, setPatientsList] = useState<Patient[]>([]);
  const [showPatientResults, setShowPatientResults] = useState(false);

  
  const [actSearch, setActSearch] = useState('');
  const [selectedAct, setSelectedAct] = useState<ClinicalAct | null>(null);
  const [actsList, setActsList] = useState<ClinicalAct[]>([]);
  const [showActResults, setShowActResults] = useState(false);

  const [motif, setMotif] = useState('');
  const [time, setTime] = useState(initialTime || '09:00');
  const [duration, setDuration] = useState(30);
  const [status, setStatus] = useState<AppointmentStatus>('PRÉVU');
  const [schedulingType, setSchedulingType] = useState<SchedulingType>('EXACT_TIME');
  const [loading, setLoading] = useState(false);
  const [dateValue, setDateValue] = useState('');
  const [smartIntel, setSmartIntel] = useState<any>(null);
  const [loadingIntel, setLoadingIntel] = useState(false);
  const [showGhostPanel, setShowGhostPanel] = useState(false);
  
  const protocol = useClinicalRef(selectedAct?.name || actSearch);
  const [showClinicalRef, setShowClinicalRef] = useState(false);

  useEffect(() => {
    if (!isOpen) setShowGhostPanel(false);
  }, [isOpen]);

  useEffect(() => {
    if (protocol) {
      setShowClinicalRef(true);
    } else {
      setShowClinicalRef(false);
    }
  }, [protocol]);


  useEffect(() => {
    if (isOpen) {
      if (editingAppointment) {
        const d = new Date(editingAppointment.datetime_start);
        setDateValue(d.toISOString().split('T')[0]);
        setTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
        setDuration(editingAppointment.duration_minutes);
        setMotif(editingAppointment.motif || '');
        setActSearch(editingAppointment.motif || '');
        setStatus(editingAppointment.status);
        if (editingAppointment.patient_id) {
           setSelectedPatient({ id: editingAppointment.patient_id, nom: editingAppointment.patient_name?.split(' ')[0] || '', prenom: editingAppointment.patient_name?.split(' ')[1] || '' });
        }
      } else {
        setDateValue(selectedDate ? selectedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
        setTime(initialTime || '09:00');
        setDuration(30);
        setMotif('');
        setActSearch('');
        setSelectedPatient(null);
        setStatus('PRÉVU');
        setSchedulingType('EXACT_TIME');
      }
    }
  }, [isOpen, editingAppointment, initialTime, selectedDate]);


  const patientRef = useRef<HTMLDivElement>(null);
  const actRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (patientSearch.length > 1 && !selectedPatient) {
      const fetchPatients = async () => {
        try {
          const res = await api.get('/patients/', { params: { limit: 10, search: patientSearch } });
          const filtered = res.data.filter((p: Patient) => 
            `${p.nom} ${p.prenom}`.toLowerCase().includes(patientSearch.toLowerCase()) ||
            p.numero_dossier?.toLowerCase().includes(patientSearch.toLowerCase())
          );
          setPatientsList(filtered.length > 0 ? filtered : res.data);
          setShowPatientResults(true);
        } catch (e) {
          console.error(e);
        }
      };
      fetchPatients();
    } else {
      setShowPatientResults(false);
    }
  }, [patientSearch, selectedPatient]);

  useEffect(() => {
    if (selectedPatient && showGhostPanel) {
      setLoadingIntel(true);
      api.get(`/patients/${selectedPatient.id}/appointment-intel`)
        .then(res => setSmartIntel(res.data))
        .catch(e => console.error(e))
        .finally(() => setLoadingIntel(false));
      fetchPatientIntelligence(selectedPatient.id).catch(e => console.error(e));
      fetchSuggestedAppointment(selectedPatient.id).catch(e => console.error(e));
    } else if (!selectedPatient) {
      setSmartIntel(null);
      setShowGhostPanel(false);
    }
  }, [selectedPatient, showGhostPanel, fetchPatientIntelligence, fetchSuggestedAppointment]);

  const applySmartIntel = () => {
    if (smartIntel) {
      setMotif(smartIntel.suggestion);
      setDuration(smartIntel.duration);
      if (!selectedAct) {
          setActSearch(smartIntel.suggestion);
      }
    }
  };

  const applyClinicalSuggestion = () => {
    if (suggestedAppointment) {
      setMotif(suggestedAppointment.motif || '');
      setDuration(suggestedAppointment.duration_minutes || 30);
      setActSearch(suggestedAppointment.motif || '');
      if (suggestedAppointment.motif) {
        api.get('/actes/catalog/search', { params: { q: suggestedAppointment.motif } })
          .then(res => {
            if (res.data && res.data.length > 0) {
              const exactMatch = res.data.find((a: any) => a.name.toLowerCase() === suggestedAppointment.motif.toLowerCase());
              if (exactMatch) {
                setSelectedAct(exactMatch);
              }
            }
          })
          .catch(e => console.error(e));
      }
    }
  };

  const openWhatsApp = () => {
    if (!selectedPatient) return;
    const dateStr = selectedDate?.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const msg = `Bonjour ${selectedPatient.prenom}, votre rendez-vous pour ${motif || actSearch || 'votre soin'} est confirmé pour le ${dateStr} à ${time}. À bientôt !`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };


  useEffect(() => {
    const fetchActs = async () => {
      try {
        const res = await api.get('/actes/catalog/search', { params: { q: actSearch } });
        setActsList(res.data);
      } catch (e) {
        console.error(e);
      }
    };
    if (isOpen && !selectedAct) {
      fetchActs();
    }
  }, [actSearch, selectedAct, isOpen]);

  useEffect(() => {
    const actName = selectedAct ? selectedAct.name : actSearch;
    if (actName && actName.trim().length > 1) {
      const fetchRecommendedDuration = async () => {
        try {
          const res = await api.get('/actes/duration', { params: { q: actName } });
          if (res.data && res.data.duration) {
            setDuration(res.data.duration);
          }
        } catch (e) {
          console.error(e);
        }
      };
      const timer = setTimeout(() => {
        fetchRecommendedDuration();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [selectedAct, actSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (patientRef.current && !patientRef.current.contains(event.target as Node)) setShowPatientResults(false);
      if (actRef.current && !actRef.current.contains(event.target as Node)) setShowActResults(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  const handleDelete = async () => {
    if (!editingAppointment) return;
    if (!window.confirm('Supprimer ce rendez-vous ?')) return;
    try {
      await api.delete(`/appointments/${editingAppointment.id}`);
      onSaved();
      onClose();
    } catch (err) {
      alert('Erreur lors de la suppression.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) return;
    
    setLoading(true);
    try {
      const [hours, minutes] = time.split(':').map(Number);
      const startDateTime = new Date(dateValue);
      startDateTime.setHours(hours, minutes, 0, 0);

      const payload = {
        patient_id: selectedPatient?.id || null,
        patient_name: selectedPatient ? `${selectedPatient.nom} ${selectedPatient.prenom}` : patientSearch,
        motif: selectedAct ? selectedAct.name : (motif || actSearch),
        datetime_start: startDateTime.toISOString(),
        duration_minutes: duration,
        status: status,
        scheduling_type: schedulingType
      };

      if (editingAppointment) {
          await api.put(`/appointments/${editingAppointment.id}`, payload);
      } else {
          await api.post('/appointments/', payload);
      }

      toast.success(editingAppointment ? 'Rendez-vous modifié.' : 'Rendez-vous créé.');
      onSaved();
      onClose();
      setPatientSearch('');
      setSelectedPatient(null);
      setActSearch('');
      setSelectedAct(null);
      setMotif('');
      setTime('09:00');
      setDuration(30);
      setStatus('PRÉVU');
      setSchedulingType('EXACT_TIME');
    } catch (err) {
      console.error("Erreur saving appt", err);
      toast.error("Erreur lors de la sauvegarde du rendez-vous.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-4 animate-in fade-in duration-300">
      <div className="bg-white/90 backdrop-blur-2xl rounded-[1.5rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white flex flex-col max-h-[95vh]">
        
        <div className="flex justify-between items-center p-4 sm:p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              {editingAppointment ? <Clock size={24} /> : <Plus size={24} />}
            </div>
            <div>
              <h2 className="text-2xl font-black text-[#003380] tracking-tight">
                  {editingAppointment ? "Modifier le Rendez-vous" : "Nouveau Rendez-vous"}
              </h2>
              <p className="text-slate-500 text-sm font-bold">Planification clinique</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 bg-white text-slate-400 hover:text-rose-500 rounded-full shadow-sm border border-slate-100 transition-all hover:rotate-90">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-6 sm:space-y-8 flex-1 overflow-y-auto custom-scrollbar">
          <div className="space-y-6">
            
            {/* PATIENT SEARCH */}
            <div className="relative" ref={patientRef}>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 ml-1">Patient</label>
              <div className="relative group">
                {selectedPatient ? (
                  <div className="w-full flex items-center justify-between pl-12 pr-4 py-4 bg-blue-50/50 border-2 border-blue-500 rounded-2xl text-sm font-black text-[#003380]">
                    <div className="flex items-center gap-2">
                      <User className="absolute left-4 text-blue-500" size={20} />
                      <span>{selectedPatient.nom} {selectedPatient.prenom}</span>
                      <span className="text-[10px] bg-blue-200 px-1.5 py-0.5 rounded text-blue-700">{selectedPatient.numero_dossier}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => { onClose(); navigate(`/patients/${selectedPatient.id}/edit`); }} className="text-[9px] font-black text-blue-400 hover:text-blue-600 uppercase tracking-widest transition-colors">Modifier</button>
                      <button type="button" onClick={() => setSelectedPatient(null)} className="text-blue-400 hover:text-rose-500 transition-colors">
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                    <input 
                      type="text" 
                      required
                      placeholder="Rechercher ou saisir un nom..."
                      value={patientSearch}
                      onChange={e => setPatientSearch(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all"
                    />
                  </>
                )}
              </div>
              
              {showPatientResults && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[110] max-h-60 overflow-y-auto animate-in slide-in-from-top-2 duration-200">
                  {patientsList.length > 0 ? patientsList.map(p => (
                    <button 
                      key={p.id}
                      type="button"
                      onClick={() => { setSelectedPatient(p); setShowPatientResults(false); }}
                      className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                    >
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-black">{p.nom[0]}</div>
                      <div className="text-left">
                        <div className="text-sm font-black text-slate-700">{p.nom} {p.prenom}</div>
                        <div className="text-[10px] font-bold text-slate-400">Dossier: {p.numero_dossier}</div>
                      </div>
                      <Check className="ml-auto text-emerald-500 opacity-0 group-hover:opacity-100" size={18} />
                    </button>
                  )) : (
                    <div className="p-6 text-center">
                      <p className="text-sm text-slate-400 font-bold mb-2">Aucun patient trouvé</p>
                      <button type="button" onClick={() => { setShowPatientResults(false); onClose(); navigate('/patients/new'); }} className="text-xs text-blue-500 font-black uppercase tracking-widest">Créer Patient Externe</button>
                    </div>
                  )}
                </div>
              )}
              {/* BOUTON GHOST INTELLIGENCE - ON DEMAND */}
              {selectedPatient && !showGhostPanel && (
                <button
                  type="button"
                  onClick={() => setShowGhostPanel(true)}
                  className="mt-3 flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest"
                >
                  <Ghost size={13} /> Ghost Intelligence
                </button>
              )}

              {/* SMART INTEL CARD (GHOST ELITE INTELLIGENCE HUB) */}
              {(selectedPatient && showGhostPanel && (smartIntel || suggestedAppointment || loadingIntel || isLoadingSuggested)) && (
                <div className="mt-6 p-5 bg-gradient-to-br from-slate-50 to-blue-50/20 border border-slate-100 rounded-[2rem] shadow-sm animate-in slide-in-from-top-4 duration-300">
                  <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2 text-[#003380]">
                      <div className="w-7 h-7 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/10">
                        <Sparkles size={14} className={cn((loadingIntel || isLoadingSuggested) && "animate-pulse")} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {(loadingIntel || isLoadingSuggested) ? "Analyse en cours..." : "Ghost Intelligence"}
                      </span>
                    </div>
                    {smartIntel?.solde_attente > 0 && (
                      <span className="flex items-center gap-1.5 bg-rose-50 border border-rose-100 text-rose-600 px-3 py-1 rounded-xl text-[10px] font-black tracking-tight">
                        <AlertCircle size={12} />
                        RESTE À PAYER : {smartIntel.solde_attente} MAD
                      </span>
                    )}
                  </div>
                  
                  {(loadingIntel || isLoadingSuggested) ? (
                    <div className="py-6 flex items-center justify-center">
                        <div className="flex gap-1.5">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></div>
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        </div>
                    </div>
                  ) : (
                    <div className="space-y-3 animate-in fade-in duration-200">
                      
                      {/* OPTION CLINIQUE - SMART BOOKING (PLAN DE TRAITEMENT) */}
                      {suggestedAppointment && (
                        <div className="bg-white/80 border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-blue-200 transition-all group">
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-[9px] font-black uppercase tracking-wider">
                              Plan Clinique Actif
                            </span>
                            <p className="text-sm font-black text-slate-800 tracking-tight group-hover:text-blue-900 transition-colors">
                              {suggestedAppointment.motif}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 font-bold">
                              <span className="flex items-center gap-1 text-slate-500">
                                <Clock size={12} className="text-blue-500" />
                                {suggestedAppointment.duration_minutes} min
                              </span>
                              {suggestedAppointment.notes && (
                                <span className="text-slate-400 italic">
                                  — {suggestedAppointment.notes}
                                </span>
                              )}
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={applyClinicalSuggestion}
                            className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black rounded-xl transition-all shadow-sm flex items-center justify-center gap-1 hover:scale-[1.02] active:scale-[0.98]"
                          >
                            Planifier <ArrowRight size={12} />
                          </button>
                        </div>
                      )}

                      {/* OPTION ADMINISTRATIVE (DEVIS / OPPORTUNITÉ LOCALE) */}
                      {smartIntel && smartIntel.suggestion && (!suggestedAppointment || smartIntel.suggestion !== suggestedAppointment.motif) && (
                        <div className="bg-white/80 border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-emerald-200 transition-all group">
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-wider">
                              Proposition Devis
                            </span>
                            <p className="text-sm font-black text-slate-800 tracking-tight group-hover:text-emerald-950 transition-colors">
                              {smartIntel.suggestion}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 font-bold">
                              <span className="flex items-center gap-1 text-slate-500">
                                <Clock size={12} className="text-emerald-500" />
                                {smartIntel.duration} min
                              </span>
                              <span className="text-slate-400">
                                — Basé sur l'historique administratif
                              </span>
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={applySmartIntel}
                            className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-xl transition-all shadow-sm flex items-center justify-center gap-1 hover:scale-[1.02] active:scale-[0.98]"
                          >
                            Appliquer <ArrowRight size={12} />
                          </button>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              )}

            </div>


            {/* ACT / MOTIF SEARCH */}
            <div className="relative" ref={actRef}>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 ml-1">Acte / Motif</label>
              <div className="relative group">
                {selectedAct ? (
                  <div className="w-full flex items-center justify-between pl-12 pr-4 py-4 bg-emerald-50/50 border-2 border-emerald-500 rounded-2xl text-sm font-black text-emerald-700">
                    <div className="flex items-center gap-2">
                      <FileText className="absolute left-4 text-emerald-500" size={20} />
                      <span>{selectedAct.name}</span>
                    </div>
                    <button type="button" onClick={() => setSelectedAct(null)} className="text-emerald-400 hover:text-rose-500 transition-colors">
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                    <input 
                      type="text" 
                      required
                      placeholder="Saisir l'acte ou rechercher dans le catalogue..."
                      value={actSearch}
                      onChange={e => setActSearch(e.target.value)}
                      onFocus={() => setShowActResults(true)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all"
                    />
                  </>
                )}
              </div>
              
              {showActResults && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[110] max-h-60 overflow-y-auto animate-in slide-in-from-top-2 duration-200">
                  {actsList.map(act => (
                    <button 
                      key={act.id}
                      type="button"
                      onClick={() => { setSelectedAct(act); setShowActResults(false); }}
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                    >
                      <div className="text-left">
                        <div className="text-sm font-black text-slate-700">{act.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 ml-1">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="date" 
                    required
                    value={dateValue}
                    onChange={e => setDateValue(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-[#003380] outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 ml-1">Type de Planification</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(['EXACT_TIME', 'MORNING', 'AFTERNOON', 'FULL_DAY'] as SchedulingType[]).map(t => {
                  const labels: Record<string, string> = {
                    'EXACT_TIME': '🕒 Heure Précise', 'MORNING': '🌅 Matin', 'AFTERNOON': '🌆 Après-Midi', 'FULL_DAY': '📅 Toute la journée'
                  };
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSchedulingType(t)}
                      className={cn(
                        "py-3 px-2 rounded-xl text-[10px] font-black tracking-tight transition-all border flex items-center justify-center gap-1.5",
                        schedulingType === t
                          ? "bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/20"
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      {labels[t]}
                    </button>
                  );
                })}
              </div>
            </div>

            {schedulingType === 'EXACT_TIME' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 ml-1">Début</label>
                  <div className="relative">
                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="time" 
                      required
                      value={time}
                      onChange={e => setTime(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-[#003380] outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 ml-1">Durée Prévue</label>
                  <select 
                    value={duration} 
                    onChange={e => setDuration(Number(e.target.value))}
                    className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all appearance-none"
                  >
                    <option value={15}>15 min (Contrôle)</option>
                    <option value={30}>30 min (Standard)</option>
                    <option value={45}>45 min</option>
                    <option value={60}>1 heure (Soin long)</option>
                    <option value={90}>1h30 (Chirurgie)</option>
                    <option value={120}>2 heures</option>
                  </select>
                </div>
              </div>
            )}


            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 ml-1">Statut Initial</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {(['PRÉVU', 'EN_S_ATTENTE', 'EN_FAUTEUIL', 'TERMINÉ', 'ANNULÉ'] as AppointmentStatus[]).map(s => {
                  const labels: Record<string, string> = {
                    'PRÉVU': 'Prévu', 'EN_S_ATTENTE': 'Attente', 'EN_FAUTEUIL': 'Fauteuil',
                    'TERMINÉ': 'Terminé', 'ANNULÉ': 'Annulé',
                  };
                  const colors: Record<string, string> = {
                    'PRÉVU': 'bg-[#003380] border-[#003380] shadow-blue-900/20',
                    'EN_S_ATTENTE': 'bg-amber-500 border-amber-500 shadow-amber-500/20',
                    'EN_FAUTEUIL': 'bg-emerald-600 border-emerald-600 shadow-emerald-600/20',
                    'TERMINÉ': 'bg-slate-500 border-slate-500 shadow-slate-500/20',
                    'ANNULÉ': 'bg-rose-500 border-rose-500 shadow-rose-500/20',
                  };
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={cn(
                        "py-2.5 px-1 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all border",
                        status === s
                          ? `${colors[s]} text-white shadow-lg`
                          : "bg-white text-slate-500 border-slate-100 hover:border-slate-300"
                      )}
                    >
                      {labels[s]}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          <div className="pt-6 sm:pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-slate-100">
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
              {selectedPatient && (
                <button
                  type="button"
                  onClick={openWhatsApp}
                  className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-black text-xs transition-colors"
                >
                  <MessageCircle size={16} /> Rappel WhatsApp
                </button>
              )}
              {editingAppointment && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex items-center gap-2 text-rose-500 hover:text-rose-700 font-black text-xs transition-colors"
                >
                  <Trash2 size={16} /> Supprimer
                </button>
              )}
            </div>
            <div className="flex w-full sm:w-auto gap-4">
                <button type="button" onClick={onClose} className="w-1/2 sm:w-auto px-6 sm:px-8 py-3 sm:py-4 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-2xl font-black transition-all">
                Annuler
                </button>
                <button 
                type="submit" 
                disabled={loading} 
                className="w-1/2 sm:w-auto px-6 sm:px-10 py-3 sm:py-4 bg-gradient-to-r from-[#003380] to-[#0055d4] text-white rounded-2xl font-black hover:shadow-2xl hover:shadow-blue-900/30 hover:-translate-y-1 transition-all flex items-center justify-center gap-2 sm:gap-3 disabled:opacity-50 text-xs sm:text-base"
                >
                {loading ? (
                    <> <Clock className="animate-spin" size={20} /> Création... </>
                ) : (
                    <> <Check size={20} /> {editingAppointment ? "Modifier le RDV" : "Confirmer le RDV"} </>
                )}
                </button>
            </div>
          </div>

        </form>
      </div>

      {protocol && (
        <ClinicalRefSidebar 
          protocol={protocol} 
          isOpen={showClinicalRef} 
          onClose={() => setShowClinicalRef(false)} 
        />
      )}
    </div>
  );
};
