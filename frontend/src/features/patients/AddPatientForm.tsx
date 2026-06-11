import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Save, User, Phone, Mail, Activity, AlertTriangle, UserCheck, FileDigit, RefreshCw, Search, FolderOpen, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';
import type { Patient } from '../../types';
import { cn } from '../../utils/cn';
import { MotifSelector } from './components/MotifSelector';

// Types pour la gestion des doublons
interface DuplicateInfo {
  has_duplicate: boolean;
  existing_patient?: {
    id: number;
    nom: string;
    prenom: string;
    date_naissance: string;
    created_at: string;
  };
}

export const AddPatientForm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isOrtho, setIsOrtho] = useState(false);
  
  // Gestion des doublons
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null);
  const [forceCreate, setForceCreate] = useState(false);

  const prefillNom = searchParams.get('nom') || '';
  const prefillPrenom = searchParams.get('prenom') || '';

  // État pour la validation du numéro de dossier
  const [dossierStatus, setDossierStatus] = useState<{ status: 'idle' | 'checking' | 'available' | 'taken', owner?: string }>({ status: 'idle' });

  const [formData, setFormData] = useState<any>({
    numero_dossier: '',
    nom: prefillNom,
    prenom: prefillPrenom,
    date_naissance: '',
    sexe: 'F', 
    telephone: '',
    telephone_2: '',
    telephone_3: '',
    email: '',
    adresse: '',
    assurance: 'AUCUNE',
    assurance_privee_nom: '',
    assurance_complementaire: false,
    assurance_complementaire_nom: '',
    antecedents_medicaux: '',
    motif_consultation: [] as string[]
  });

  const [showPhone2, setShowPhone2] = useState(false);
  const [showPhone3, setShowPhone3] = useState(false);

  const fetchNextDossierNumber = async () => {
    try {
      const response = await api.get('/patients/next-dossier-number');
      if (!formData.numero_dossier) {
        setFormData((prev: any) => ({ ...prev, numero_dossier: response.data.next_number }));
      }
    } catch (err) {
      console.error("Erreur lors de la récupération du prochain numéro:", err);
    }
  };

  // Charger le prochain numéro de dossier disponible au chargement
  useEffect(() => {
     
    fetchNextDossierNumber();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check availability when numero_dossier changes
  useEffect(() => {
    if (!formData.numero_dossier || formData.numero_dossier.length < 2) {
       
      setDossierStatus({ status: 'idle' });
      return;
    }

    const timer = setTimeout(async () => {
      setDossierStatus({ status: 'checking' });
      try {
        const res = await api.get(`/patients/check-dossier/${formData.numero_dossier}`);
        if (res.data.exists) {
          setDossierStatus({ status: 'taken', owner: res.data.patient_name });
        } else {
          setDossierStatus({ status: 'available' });
        }
      } catch (err) {
        setDossierStatus({ status: 'available' }); // Fallback silent
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.numero_dossier]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (name === 'nom') {
      finalValue = value.toUpperCase();
    }
    
    setFormData({ 
      ...formData, 
      [name]: finalValue 
    });
    if (errors[name]) setErrors({ ...errors, [name]: '' });
    // Réinitialiser le modal doublon si modif
    if (showDuplicateModal) {
      setShowDuplicateModal(false);
      setForceCreate(false);
    }
  };

  const handleNumeroDossierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().trim();
    setFormData({ ...formData, numero_dossier: value });
    if (errors.numero_dossier) setErrors({ ...errors, numero_dossier: '' });
  };

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.nom) newErrors.nom = "Le nom est requis.";
    if (!formData.prenom) newErrors.prenom = "Le prénom est requis.";
    if (!formData.date_naissance) {
      newErrors.date_naissance = "La date de naissance est obligatoire.";
    } else {
      const bDate = new Date(formData.date_naissance);
      const minDate = new Date('1900-01-01');
      const maxDate = new Date();
      if (isNaN(bDate.getTime()) || bDate < minDate || bDate > maxDate) {
        newErrors.date_naissance = "Date invalide (doit être entre 1900 et aujourd'hui).";
      }
    }
    // Téléphone, email et adresse sont optionnels
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Format d'email invalide.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Vérification préalable des doublons
  const checkDuplicate = async (): Promise<boolean> => {
    try {
      const response = await api.post('/patients/check-duplicate', {
        numero_dossier: formData.numero_dossier || null,
        nom: formData.nom,
        prenom: formData.prenom,
        date_naissance: formData.date_naissance,
        sexe: formData.sexe,
        telephone: formData.telephone || null,
        email: formData.email || null,
        adresse: formData.adresse || null,
        antecedents_medicaux: formData.antecedents_medicaux || null
      });
      
      const data: DuplicateInfo = response.data;
      
      if (data.has_duplicate && data.existing_patient) {
        setDuplicateInfo(data);
        setShowDuplicateModal(true);
        return true; // Doublon trouvé
      }
      
      return false; // Pas de doublon
    } catch (err) {
      console.error("Erreur vérification doublon:", err);
      return false; // En cas d'erreur, on continue (le backend vérifiera aussi)
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Si pas encore vérifié, faire la pré-vérification
    if (!forceCreate && !showDuplicateModal) {
      setLoading(true);
      const hasDuplicate = await checkDuplicate();
      setLoading(false);
      if (hasDuplicate) return; // Arrêter ici, attendre la décision de l'utilisateur
    }

    await performSubmit(forceCreate);
  };

  const performSubmit = async (isForced: boolean) => {
    setLoading(true);

    // Sanitization
    const payload = {
      ...formData,
      is_ortho_active: isOrtho,
      email: formData.email === '' ? null : formData.email,
      adresse: formData.adresse === '' ? null : formData.adresse,
      telephone: formData.telephone === '' ? null : formData.telephone,
      telephone_2: formData.telephone_2 === '' ? null : formData.telephone_2,
      telephone_3: formData.telephone_3 === '' ? null : formData.telephone_3,
      assurance_privee_nom: formData.assurance_privee_nom === '' ? null : formData.assurance_privee_nom,
      assurance_complementaire_nom: formData.assurance_complementaire_nom === '' ? null : formData.assurance_complementaire_nom,
      antecedents_medicaux: formData.antecedents_medicaux === '' ? null : formData.antecedents_medicaux,
      motif_consultation: formData.motif_consultation.length === 0 ? null : JSON.stringify(formData.motif_consultation),
    };

    try {
      // Si isForced est true, on ajoute le paramètre force_create
      const url = isForced ? '/patients/?force_create=true' : '/patients/';
      await api.post(url, payload);
      navigate('/patients');
    } catch (err: any) {
      console.error("❌ ERREUR API:", err);
      
      // Gérer l'erreur 409 (doublon) du backend
      if (err.response?.status === 409) {
        const detail = err.response.data.detail;
        if (detail?.existing_patient) {
          setDuplicateInfo({
            has_duplicate: true,
            existing_patient: detail.existing_patient
          });
          setShowDuplicateModal(true);
          setLoading(false);
          return;
        }
      }
      
      setErrors({ global: "Erreur serveur. Vérifiez la console." });
      setLoading(false);
    }
  };

  const inputClass = "w-full px-5 py-4 bg-white/60 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-[#003380]/15 focus:border-[#003380] outline-none transition-all duration-300 shadow-sm text-slate-800 font-medium";
  const labelClass = "text-[11px] font-black text-slate-500 uppercase tracking-widest block mb-2 ml-1";

  // Formatage de la date pour affichage
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR');
  };

  return (
    <div className="max-w-4xl mx-auto p-10">
      <div className="bg-white/70 backdrop-blur-xl rounded-[2.5rem] shadow-[0_20px_60px_rgba(0,0,0,0.05)] border border-white/80 overflow-hidden">
        
        {/* Header Premium */}
        <div className="bg-[#003380] px-10 py-8 flex justify-between items-center relative overflow-hidden">
          <div className="flex items-center gap-5 relative z-10">
            <div className="p-4 bg-white/10 rounded-2xl border border-white/20 backdrop-blur-md">
              <User className="text-white w-8 h-8" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-white tracking-tight">Nouveau Patient</h2>
              <p className="text-blue-200 text-sm font-medium mt-1">Digital Crown — Vérification anti-doublon activée</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-10">
          {errors.global && (
            <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 flex items-center gap-2 font-bold text-sm">
              <Activity className="w-5 h-5" /> {errors.global}
            </div>
          )}
          
          {/* Info pré-remplissage depuis recherche */}
          {(prefillNom || prefillPrenom) && (
            <div className="p-4 bg-blue-50 text-[#003380] rounded-2xl border border-blue-100 flex items-center gap-3 text-sm">
              <Search className="w-5 h-5" />
              <span className="font-medium">
                Patient "<strong>{prefillNom} {prefillPrenom}</strong>" introuvable. 
                Vérifiez les informations et complétez le formulaire ci-dessous.
              </span>
            </div>
          )}

          {/* Section Numéro de Dossier */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Numéro de Dossier</span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
            </div>

            {/* Champ Numéro de dossier Unique */}
            <div className="relative">
              <label className={labelClass}>Numéro de dossier (Code Patient)</label>
              <div className="relative">
                <FileDigit className={cn(
                  "absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5",
                  dossierStatus.status === 'taken' ? "text-red-500" : "text-[#003380]"
                )} />
                <input 
                  type="text" 
                  name="numero_dossier" 
                  value={formData.numero_dossier || ''} 
                  onChange={handleNumeroDossierChange}
                  className={cn(
                    inputClass, 
                    "pl-14 font-mono text-lg tracking-wider",
                    dossierStatus.status === 'taken' && "border-red-400 focus:ring-red-100",
                    dossierStatus.status === 'available' && "border-emerald-400 focus:ring-emerald-100"
                  )}
                  placeholder="P-XXXXXX"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {dossierStatus.status === 'checking' && <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />}
                  {dossierStatus.status === 'taken' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                  {dossierStatus.status === 'available' && <UserCheck className="w-4 h-4 text-emerald-500" />}
                </div>
              </div>
              
              {dossierStatus.status === 'taken' && (
                <p className="text-red-500 text-[10px] font-black uppercase tracking-widest mt-2 ml-1 flex items-center gap-1">
                  <AlertTriangle size={12} /> Ce numéro appartient déjà à : <span className="underline">{dossierStatus.owner}</span>
                </p>
              )}
              {dossierStatus.status === 'available' && (
                <p className="text-emerald-600 text-[10px] font-black uppercase tracking-widest mt-2 ml-1 flex items-center gap-1">
                  <UserCheck size={12} /> Numéro disponible
                </p>
              )}
            </div>

            {/* Champs Nom et Prénom - nécessaires dans les deux cas */}
            <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
              <div>
                <label className={labelClass}>Nom de famille *</label>
                <input 
                  type="text" 
                  name="nom" 
                  value={formData.nom} 
                  onChange={handleChange}
                  className={cn(inputClass, errors.nom && "border-red-400 focus:border-red-400 focus:ring-red-100")}
                  placeholder="BENMOUSSA"
                />
                {errors.nom && <span className="text-red-500 text-xs mt-1 ml-1">{errors.nom}</span>}
              </div>

              <div>
                <label className={labelClass}>Prénom *</label>
                <input 
                  type="text" 
                  name="prenom" 
                  value={formData.prenom} 
                  onChange={handleChange}
                  className={cn(inputClass, errors.prenom && "border-red-400 focus:border-red-400 focus:ring-red-100")}
                  placeholder="Yazan"
                />
                {errors.prenom && <span className="text-red-500 text-xs mt-1 ml-1">{errors.prenom}</span>}
              </div>
            </div>
          </div>

          {/* Section Identité */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Identité Civile</span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Date de naissance *</label>
                <input 
                  type="date" 
                  name="date_naissance" 
                  value={formData.date_naissance} 
                  onChange={handleChange}
                  className={cn(inputClass, errors.date_naissance && "border-red-400 focus:border-red-400 focus:ring-red-100")}
                />
                {errors.date_naissance && <span className="text-red-500 text-xs mt-1 ml-1">{errors.date_naissance}</span>}
              </div>

              <div>
                <label className={labelClass}>Sexe *</label>
                <select 
                  name="sexe" 
                  value={formData.sexe} 
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="F">Féminin</option>
                  <option value="M">Masculin</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Assurance / Couverture Médicale</label>
                <select 
                  name="assurance" 
                  value={formData.assurance} 
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="AUCUNE">Aucune (Privé)</option>
                  <option value="CNOPS">CNOPS</option>
                  <option value="CNSS">CNSS</option>
                  <option value="MUTUELLE_FAR">Mutuelle de FAR</option>
                  <option value="PRIVEE">Assurance Privée</option>
                </select>
                
                {formData.assurance === 'PRIVEE' && (
                  <div className="mt-3">
                    <label className={labelClass}>Nom de l'Assurance Privée</label>
                    <input 
                      type="text" 
                      name="assurance_privee_nom" 
                      value={formData.assurance_privee_nom} 
                      onChange={handleChange}
                      className={inputClass}
                      placeholder="Ex: Sanlam, Wafa Assurance..."
                    />
                  </div>
                )}
                
                {/* Assurance Complémentaire */}
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <label className="flex items-center gap-3 cursor-pointer mb-3">
                    <div className={cn(
                      "w-10 h-5 rounded-full transition-all duration-300 relative",
                      formData.assurance_complementaire ? "bg-[#003380]" : "bg-slate-300"
                    )}>
                      <div className={cn(
                        "absolute top-1 w-3 h-3 rounded-full bg-white shadow-md transition-all duration-300",
                        formData.assurance_complementaire ? "left-6" : "left-1"
                      )} />
                    </div>
                    <input 
                      type="checkbox" 
                      name="assurance_complementaire"
                      checked={formData.assurance_complementaire} 
                      onChange={handleChange}
                      className="hidden"
                    />
                    <span className="font-bold text-slate-700 text-sm">Assurance Complémentaire</span>
                  </label>
                  
                  {formData.assurance_complementaire && (
                    <div>
                      <label className={labelClass}>Nom de l'Assurance Complémentaire</label>
                      <input 
                        type="text" 
                        name="assurance_complementaire_nom" 
                        value={formData.assurance_complementaire_nom} 
                        onChange={handleChange}
                        className={inputClass}
                        placeholder="Ex: Mutuelle interne..."
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section Contact */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Contact</span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Téléphone Principal</label>
                <div className="relative mb-2">
                  <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="tel" 
                    name="telephone" 
                    value={formData.telephone} 
                    onChange={handleChange}
                    className={cn(inputClass, "pl-14")}
                    placeholder="06 12 34 56 78"
                  />
                </div>
                
                {showPhone2 && (
                  <div className="relative mb-2 mt-2">
                    <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input 
                      type="tel" 
                      name="telephone_2" 
                      value={formData.telephone_2} 
                      onChange={handleChange}
                      className={cn(inputClass, "pl-14 py-3")}
                      placeholder="Téléphone secondaire"
                    />
                  </div>
                )}
                
                {showPhone3 && (
                  <div className="relative mb-2 mt-2">
                    <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input 
                      type="tel" 
                      name="telephone_3" 
                      value={formData.telephone_3} 
                      onChange={handleChange}
                      className={cn(inputClass, "pl-14 py-3")}
                      placeholder="Autre numéro"
                    />
                  </div>
                )}
                
                {(!showPhone2 || !showPhone3) && (
                  <button 
                    type="button" 
                    onClick={() => {
                      if (!showPhone2) setShowPhone2(true);
                      else if (!showPhone3) setShowPhone3(true);
                    }}
                    className="text-xs text-[#003380] font-bold hover:underline"
                  >
                    + Ajouter un numéro
                  </button>
                )}
              </div>

              <div>
                <label className={labelClass}>Email</label>
                <div className="relative">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="email" 
                    name="email" 
                    value={formData.email} 
                    onChange={handleChange}
                    className={cn(inputClass, "pl-14", errors.email && "border-red-400 focus:border-red-400 focus:ring-red-100")}
                    placeholder="yazan.benmoussa@email.com"
                  />
                </div>
                {errors.email && <span className="text-red-500 text-xs mt-1 ml-1">{errors.email}</span>}
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Adresse</label>
                <input 
                  type="text" 
                  name="adresse" 
                  value={formData.adresse} 
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="Avenue Mohammed V, Rabat"
                />
              </div>
            </div>
          </div>

          {/* Section Antécédents Médicaux */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Antécédents Médicaux</span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
            </div>

            <div>
              <label className={labelClass}>Motif(s) de première consultation</label>
              <MotifSelector
                selected={formData.motif_consultation}
                onChange={(ids) => setFormData((prev: any) => ({ ...prev, motif_consultation: ids }))}
              />
            </div>

            <div className="mt-6">
              <label className={labelClass}>Historique médical et allergies</label>
              <textarea 
                name="antecedents_medicaux" 
                value={formData.antecedents_medicaux} 
                onChange={handleChange}
                rows={4}
                className={inputClass}
                placeholder="Ex: Diabète, hypertension, allergie à la pénicilline, traitement en cours..."
              />
            </div>
          </div>

          <div className="p-6 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 rounded-2xl border border-blue-100">
            <div 
              className="flex items-center gap-4 cursor-pointer"
              onClick={() => setIsOrtho(!isOrtho)}
            >
              <div className={cn(
                "w-14 h-8 rounded-full transition-all duration-300 relative",
                isOrtho ? "bg-[#003380]" : "bg-slate-300"
              )}>
                <div className={cn(
                  "absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300",
                  isOrtho ? "left-7" : "left-1"
                )} />
              </div>
              <div>
                <span className="font-bold text-slate-800">Suivi Orthodontique</span>
                <p className="text-xs text-slate-500">Activer le suivi orthodontique pour ce patient</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4 pt-6 border-t border-slate-200">
            <button 
              type="button" 
              onClick={() => navigate('/patients')}
              className="px-8 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-100 transition-all"
            >
              Annuler
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="px-8 py-4 bg-[#003380] text-white rounded-2xl font-bold hover:bg-[#002266] transition-all shadow-lg shadow-blue-900/20 flex items-center gap-3 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Vérification...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Créer le dossier
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Modal de détection de doublon */}
      {showDuplicateModal && duplicateInfo?.existing_patient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-amber-100 rounded-2xl">
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800">Patient similaire trouvé</h3>
                <p className="text-slate-500 text-sm">Un dossier avec les mêmes informations existe déjà.</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 mb-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <UserCheck className="w-5 h-5 text-[#003380]" />
                <span className="font-bold text-slate-800">Dossier existant :</span>
              </div>
              <div className="space-y-2 text-sm">
                <p><span className="text-slate-500">Nom :</span> <span className="font-bold">{duplicateInfo.existing_patient.nom} {duplicateInfo.existing_patient.prenom}</span></p>
                <p><span className="text-slate-500">Né(e) le :</span> <span className="font-bold">{formatDate(duplicateInfo.existing_patient.date_naissance)}</span></p>
                <p><span className="text-slate-500">Créé le :</span> <span className="text-slate-600">{formatDate(duplicateInfo.existing_patient.created_at)}</span></p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => navigate(`/patients/${duplicateInfo.existing_patient!.id}`)}
                className="w-full py-4 bg-[#003380] text-white rounded-2xl font-bold hover:bg-[#002266] transition-all flex items-center justify-center gap-2"
              >
                <FolderOpen className="w-5 h-5" />
                Ouvrir le dossier existant
              </button>

              <button
                onClick={() => {
                  setForceCreate(true);
                  setShowDuplicateModal(false);
                  performSubmit(true);
                }}
                className="w-full py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                Créer quand même (doublon autorisé)
              </button>

              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  setForceCreate(false);
                }}
                className="w-full py-3 text-slate-500 hover:text-slate-700 transition-colors"
              >
                Modifier les informations
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddPatientForm;
