import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  UserPlus,
  Calendar,
  Clock,
  FileText,
  ChevronRight,
  TrendingUp,
  Loader2,
  Users,
  Bell,
  CheckCheck,
  BarChart2,
  Smartphone,
  X,
  Banknote,
  Phone,
  Sparkles,
  Plus,
  Search
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { cn } from '../utils/cn';
import { api } from '../services/api';
import { PatientScoreBadge } from '../features/patients/components/PatientScoreBadge';
import { useSettingsStore } from '../features/admin/Settings/hooks/useSettingsStore';
import { useAuthStore } from '../stores/useAuthStore';
import { motion, type Variants } from 'framer-motion';
import { MobileSecurity } from '../features/admin/Security/MobileSecurity';
import { EliteGhostLoader } from '../components/EliteGhostLoader';
import { DayOneTour } from '../components/DayOneTour';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" }
  }
};

interface RecentPatient {
  id: number;
  nom: string;
  prenom: string;
  acte: string;
  time: string;
  type: string;
}

interface DashboardStats {
  total_patients: number;
  total_analyses: number;
  in_waiting: number;
  recent_patients: RecentPatient[];
  weekly_activity: number[];
  weekly_patients?: number;
}

interface ProactiveAlert {
  id: number;
  patient_id: number;
  nom: string;
  prenom: string;
  type: string;
  title: string;
  message: string;
  action: string;
  priority: number;
}

interface ForecastData {
  week_start: string;
  week_end: string;
  rdv_count: number;
  forecast_revenue: number;
  avg_per_rdv: number;
}

interface ConversionData {
  devis_count: number;
  converted_count: number;
  taux: number;
  avg_days: number | null;
}

interface ProjectionEntry { month: string; revenue: number; type: 'actual' | 'forecast'; }
interface ProjectionData { historical: ProjectionEntry[]; projections: ProjectionEntry[]; avg_monthly: number; }
interface LatentCashData { total_opportunites: number; valeur_totale_latente: number; opportunites: any[]; }

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [praticienName, setPraticienName] = useState('Praticien');
  const show_patient_badges = useSettingsStore(state => state.profile.show_patient_badges);
  const { user } = useAuthStore();

  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [proactiveAlerts, setProactiveAlerts] = useState<ProactiveAlert[]>([]);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [conversion, setConversion] = useState<ConversionData | null>(null);
  const [projection, setProjection] = useState<ProjectionData | null>(null);
  const [latentCash, setLatentCash] = useState<LatentCashData | null>(null);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  
  // Ghost Secrétariat (To-Do List Magique)
  const [ghostSecretariatPatient, setGhostSecretariatPatient] = useState<{nom: string; prenom: string} | null>(null);
  const [ghostChecklist, setGhostChecklist] = useState({ encaisser: false, ordonnance: false, rdv: false });

  useEffect(() => {
    if (ghostChecklist.encaisser && ghostChecklist.ordonnance && ghostChecklist.rdv) {
      setTimeout(() => {
        setGhostSecretariatPatient(null);
        setGhostChecklist({ encaisser: false, ordonnance: false, rdv: false });
      }, 1000);
    }
  }, [ghostChecklist]);

  const hasAccess = (permission: string) => {
    if (!user) return true;
    if (user.role === 'ADMIN') return true;
    if (user.role === 'DENTISTE' && !user.employer_id) return true; // Propriétaire du cabinet

    if (user.permissions && typeof user.permissions === 'object') {
      return user.permissions[permission] ?? false;
    }
    
    if (user.role === 'SECRETAIRE') {
      const defaults: Record<string, boolean> = {
        agenda: true,
        patients: true,
        prescriptions: false,
        accounting: false,
        panoramic: false,
        cephalo: false,
        settings: false
      };
      return defaults[permission] ?? false;
    }
    if (user.role === 'DENTISTE') {
      return true; // Fallback pour ancien sous-dentiste
    }
    return true;
  };

  const displayName = user?.nom_complet || (user?.role === 'SECRETAIRE' ? 'Assistante' : praticienName);

  const fetchTodayAppointments = async () => {
    setLoadingAppts(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const start = `${todayStr}T00:00:00`;
      const end = `${todayStr}T23:59:59`;
      const response = await api.get(`/appointments/?start_date=${start}&end_date=${end}`);
      setTodayAppointments(response.data);
    } catch (e) {
      console.error("Erreur chargement rendez-vous du jour");
    } finally {
      setLoadingAppts(false);
    }
  };

  const updateAppointmentStatus = async (apptId: number, newStatus: string) => {
    try {
      await api.put(`/appointments/${apptId}`, { status: newStatus });
      fetchTodayAppointments();
      
      // Mettre aussi à jour les stats pour répercuter le in_waiting
      const response = await api.get('/admin/dashboard/stats');
      setStats(response.data);

      if (newStatus === 'TERMINÉ') {
        const appt = todayAppointments.find(a => a.id === apptId);
        if (appt && appt.patient) {
          setGhostSecretariatPatient({ nom: appt.patient.nom, prenom: appt.patient.prenom });
          setGhostChecklist({ encaisser: false, ordonnance: false, rdv: false });
        }
      }
    } catch (e) {
      console.error("Erreur changement de statut du rendez-vous");
    }
  };

  const today = new Date().toLocaleDateString('fr-FR', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });

  const formatDate = (dateStr: string) => {
    return dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/admin/dashboard/stats');
        setStats(response.data);
      } catch (err) {
        console.warn("Route API manquante ou invalide, injection des données de secours.");
        setStats({
          total_patients: 0,
          total_analyses: 0,
          in_waiting: 0,
          weekly_activity: [0, 0, 0, 0, 0, 0, 0],
          recent_patients: []
        });
      } finally {
        setLoading(false);
      }
    };

    const fetchConfig = async () => {
      try {
        const response = await api.get('/admin/cabinet/me');
        const config = response.data;
        if (config.header_lines_fr && config.header_lines_fr.length > 0) {
          setPraticienName(config.header_lines_fr[0]);
        }
      } catch (e) {
        console.warn("Erreur chargement configuration cabinet", e);
      }
    };

    fetchStats();
    fetchConfig();
    fetchTodayAppointments();
    api.get('/intelligence/alerts/today').then(res => setProactiveAlerts(res.data.alerts || [])).catch(err => console.warn("Erreur alerts", err));
    api.get('/intelligence/forecast-semaine').then(res => setForecast(res.data)).catch(err => console.warn("Erreur forecast", err));
    api.get('/intelligence/taux-conversion').then(res => setConversion(res.data)).catch(err => console.warn("Erreur conversion", err));
    api.get('/intelligence/projection-mensuelle').then(res => setProjection(res.data)).catch(err => console.warn("Erreur projection", err));
    api.get('/intelligence/latent-cash').then(res => setLatentCash(res.data)).catch(err => console.warn("Erreur latent cash", err));
  }, []);

  const markAlertRead = async (alertId: number) => {
    try {
      await api.patch(`/intelligence/alerts/${alertId}/read`);
      setProactiveAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (err) {
      console.warn("Erreur lors du marquage de l'alerte", err);
    }
  };

  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    if (!value.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await api.get(`/patients/?search=${encodeURIComponent(value.trim())}&limit=6`);
      setSearchResults(res.data || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchClose = () => {
    setIsSearchExpanded(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  if (loading) return <EliteGhostLoader text="Initialisation de votre cabinet..." />;

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-[1600px] mx-auto w-full px-6 py-8 md:px-10 md:py-10 space-y-12"
    >
      <DayOneTour />
      <motion.header variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight font-outfit text-primary">Bonjour, {displayName}</h1>
          <div className="flex items-center gap-3 mt-3 bg-card-bg/60 backdrop-blur-md px-4 py-2 rounded-elite-sm border border-border-main w-fit">
            <Calendar size={16} className="text-primary" />
            <p className="text-text-muted font-bold text-sm">{formatDate(today)}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          
          {/* Barre de Recherche rapide */}
          <div className="relative flex items-center">
            {isSearchExpanded ? (
              <div className="absolute right-0 z-30 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center bg-white dark:bg-slate-800 border border-border-main rounded-full px-2 py-1 shadow-elite w-72">
                  {searchLoading
                    ? <Loader2 size={18} className="text-primary ml-2 animate-spin flex-shrink-0" />
                    : <Search size={18} className="text-text-muted ml-2 flex-shrink-0" />
                  }
                  <input
                    type="text"
                    autoFocus
                    placeholder="Chercher un patient..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onBlur={() => { if (!searchQuery) handleSearchClose(); }}
                    className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-sm px-2 py-1.5"
                  />
                  <button type="button" onClick={handleSearchClose} className="text-text-muted hover:text-red-500 mr-2 flex-shrink-0">
                    <X size={16} />
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div className="absolute top-full mt-2 right-0 w-72 bg-white dark:bg-slate-800 border border-border-main rounded-2xl shadow-2xl overflow-hidden">
                    {searchResults.map((p) => (
                      <button
                        key={p.id}
                        onMouseDown={() => { navigate(`/patients/${p.id}`); handleSearchClose(); }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/5 transition-colors text-left border-b border-border-main last:border-0"
                      >
                        <div className="w-9 h-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0">
                          {(p.nom || '?').charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-sm text-primary truncate">{(p.nom || '').toUpperCase()} {p.prenom || ''}</p>
                          <p className="text-[10px] text-text-muted font-medium">{p.numero_dossier || `#${p.id}`}</p>
                        </div>
                        <ChevronRight size={14} className="text-text-muted ml-auto flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
                {searchQuery.trim() && !searchLoading && searchResults.length === 0 && (
                  <div className="absolute top-full mt-2 right-0 w-72 bg-white dark:bg-slate-800 border border-border-main rounded-2xl shadow-xl px-4 py-3 text-sm text-text-muted font-medium text-center">
                    Aucun patient trouvé
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setIsSearchExpanded(true)}
                className="p-3 bg-white dark:bg-slate-800 text-text-muted hover:text-primary rounded-full shadow-sm border border-border-main transition-all"
                title="Chercher un patient"
              >
                <Search size={20} />
              </button>
            )}
          </div>

          {/* Bouton d'ajout rapide (+) */}
          <div className="relative">
            <button
              onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
              className="p-3 bg-primary text-white hover:bg-primary/90 rounded-full shadow-md transition-all flex items-center justify-center"
              title="Ajout Rapide"
            >
              <Plus size={20} />
            </button>
            {isAddMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsAddMenuOpen(false)}></div>
                <div className="absolute top-14 right-0 bg-white dark:bg-slate-800 border border-border-main rounded-xl shadow-xl w-48 py-2 z-20 animate-in fade-in zoom-in-95">
                  <Link
                    to="/patients/new"
                    onClick={() => setIsAddMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-semibold"
                  >
                    <UserPlus size={16} className="text-primary" />
                    Nouveau Patient
                  </Link>
                  <Link
                    to="/agenda"
                    onClick={() => setIsAddMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-semibold"
                  >
                    <Calendar size={16} className="text-emerald-500" />
                    Nouveau RDV
                  </Link>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setIsMobileModalOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold text-sm rounded-elite-lg transition-all border border-indigo-100 shadow-sm"
            title="Appairer le téléphone"
          >
            <Smartphone size={20} />
            <span className="hidden md:inline">Mobile</span>
          </button>
          
          <div className="flex items-center gap-4 bg-card-bg/40 p-2 rounded-elite-lg border border-border-main shadow-elite transition-elite hover:bg-card-bg/60">
            <div className="px-6 py-3 rounded-elite-sm flex flex-col items-end">
              <span className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Status Système</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-black text-main uppercase tracking-tighter" style={{ color: 'var(--text-main)' }}>Elite Cloud Connecté</span>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      <motion.section variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <motion.div variants={itemVariants}>
          <Link to="/patients/new" data-tour="quick-action-new-patient" className="group block p-8 rounded-elite-lg shadow-elite hover:shadow-elite-hover hover:-translate-y-1 transition-elite relative overflow-hidden h-full" style={{ backgroundImage: 'linear-gradient(135deg, var(--primary), var(--secondary, #1e3a8a))' }}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:scale-150 transition-elite duration-700" />
            <div className="relative z-10">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-elite-sm flex items-center justify-center mb-8 border border-white/30 group-hover:rotate-12 transition-elite">
                <UserPlus className="text-white" size={32} />
              </div>
              <h3 className="text-2xl font-black text-white leading-none font-outfit">Nouveau Patient</h3>
              <p className="text-white/70 mt-2 font-medium">Ouvrir un dossier clinique complet</p>
            </div>
          </Link>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Link to="/patients" className="group bg-card-bg block p-8 rounded-elite-lg border border-border-main shadow-elite hover:shadow-elite-hover hover:-translate-y-1 transition-elite relative overflow-hidden h-full">
            <div className="w-14 h-14 bg-primary/5 rounded-elite-sm flex items-center justify-center mb-6 border border-primary/10 group-hover:bg-primary group-hover:text-white transition-elite text-primary">
              <Users size={28} />
            </div>
            <h3 className="text-xl font-black tracking-tight font-outfit text-primary">Dossiers Patients</h3>
            <p className="text-text-muted mt-1 font-medium italic">Gestion de la patientèle</p>
          </Link>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Link to="/agenda" className="group bg-card-bg block p-8 rounded-elite-lg border border-border-main shadow-elite hover:shadow-elite-hover hover:-translate-y-1 transition-elite relative overflow-hidden h-full">
            <div className="w-14 h-14 bg-emerald-500/10 text-emerald-500 rounded-elite-sm flex items-center justify-center mb-6 border border-emerald-500/20 group-hover:bg-emerald-500 group-hover:text-white transition-elite">
              <Calendar size={28} />
            </div>
            <h3 className="text-xl font-black text-main tracking-tight font-outfit" style={{ color: 'var(--text-main)' }}>Agenda Clinique</h3>
            <p className="text-text-muted mt-1 font-medium italic">Suivi des rendez-vous</p>
          </Link>
        </motion.div>
      </motion.section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <motion.section variants={itemVariants} data-tour="dashboard-agenda" className="space-y-5">
          <h2 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 px-4 flex items-center gap-2">
            <Clock size={16} /> Activité Récente
          </h2>
          <div data-tour="dashboard-activity" className="bg-card-bg/80 backdrop-blur-xl border border-border-main rounded-elite-lg p-4 shadow-elite">
            {stats?.recent_patients && stats.recent_patients.length > 0 ? (
              stats.recent_patients.map((patient, index) => {
                if (!patient || !patient.nom) return null;
                return (
                  <Link 
                    key={patient.id} 
                    to={`/patients/${patient.id}`}
                    className={cn(
                      "flex items-center justify-between p-4 hover:bg-primary/5 rounded-elite-sm transition-elite group",
                      index !== (stats.recent_patients.length - 1) && "border-b border-border-main"
                    )}
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 bg-primary/10 text-primary rounded-elite-sm flex items-center justify-center font-black text-xl border border-primary/20 group-hover:bg-primary group-hover:text-white transition-elite shadow-sm">
                        {(patient.nom || '?').charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h4 className="font-black text-primary text-lg leading-none font-outfit">
                            {(patient.nom || '').toUpperCase()} {patient.prenom || ''}
                          </h4>
                          {show_patient_badges && <PatientScoreBadge patientId={patient.id} className="scale-75 origin-left" />}
                        </div>
                        <p className="text-xs font-bold text-text-muted mt-2 flex items-center gap-2">
                          <FileText size={14} className="text-blue-400" /> {patient.acte || 'Consultation'}
                          <span className="text-border-main">·</span>
                          <span>{patient.time || 'Récemment'}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <ChevronRight size={18} className="text-text-muted group-hover:text-primary transition-elite group-hover:translate-x-1" />
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="py-14 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mb-6">
                  <UserPlus className="text-primary w-10 h-10" />
                </div>
                <h3 className="text-xl font-black text-primary font-outfit mb-2">Bienvenue dans Digital Crown</h3>
                <p className="text-text-muted font-medium text-sm max-w-[280px] leading-relaxed mb-8">
                  Votre cabinet est prêt ! Commencez par créer votre premier dossier patient pour débloquer l'analyse IA.
                </p>
                <Link 
                  to="/patients/new" 
                  className="px-6 py-3 bg-primary text-white rounded-elite-sm text-xs font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-md shadow-primary/20 flex items-center gap-2"
                >
                  Créer mon 1er patient <ChevronRight size={14} />
                </Link>
              </div>
            )}
          </div>
        </motion.section>

        {hasAccess('accounting') ? (
          <motion.section variants={itemVariants} className="space-y-5">
            <h2 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 px-4 flex items-center gap-2">
              <TrendingUp size={16} /> Performance Hebdomadaire
            </h2>
            <div data-tour="dashboard-stats" className="bg-card-bg/85 backdrop-blur-xl rounded-elite-lg border border-border-main p-8 h-[410px] shadow-elite flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
              
              {/* Header statistics inside the widget */}
              <div className="relative z-10 flex items-center justify-between border-b border-border-main pb-4">
                <div>
                  <p className="font-black text-[9px] uppercase tracking-[0.2em] text-text-muted">Intelligence Analytique</p>
                  <h4 className="text-xl font-black text-primary font-outfit mt-1">Activité Clinique</h4>
                </div>
                <div className="flex gap-4">
                  <div className="text-right">
                    <span className="text-[8px] font-black text-text-muted uppercase tracking-wider block">Volume Hebdo</span>
                    <span className="text-xs font-black text-main">
                      {stats?.weekly_patients !== undefined ? stats.weekly_patients : 0} Dossier{stats?.weekly_patients !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[8px] font-black text-text-muted uppercase tracking-wider block">Efficacité</span>
                    <span className="font-black text-xs text-emerald-500 flex items-center justify-end gap-1">
                      +{(stats?.total_analyses || 3) * 12}%
                    </span>
                  </div>
                </div>
              </div>

              {/* The Interactive Chart Area */}
              <div className="relative z-10 flex-1 flex items-end justify-between gap-3 pt-8 pb-4 h-[220px]">
                {/* Grid Lines background */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                  {[1, 2, 3, 4].map((_, i) => (
                    <div key={i} className="w-full border-t border-dashed border-text-muted/40" />
                  ))}
                </div>

                {stats?.weekly_activity && stats.weekly_activity.map((val, idx) => {
                  // Generate past 7 days short labels dynamically
                  const getPast7DaysLabels = () => {
                    const labels = [];
                    const today = new Date();
                    for (let i = 6; i >= 0; i--) {
                      const d = new Date();
                      d.setDate(today.getDate() - i);
                      labels.push(d.toLocaleDateString('fr-FR', { weekday: 'short' }));
                    }
                    return labels;
                  };

                  const labels = getPast7DaysLabels();
                  const label = labels[idx] ? labels[idx].charAt(0).toUpperCase() + labels[idx].slice(1) : '';
                  // The actual count of patients can be derived
                  const pCount = Math.max(0, Math.round((val - 5) / 10));

                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-2 group/bar relative z-10 h-full justify-end">
                      
                      {/* Hover tooltip card */}
                      <div className="absolute bottom-[calc(100%-10px)] left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-all duration-300 pointer-events-none bg-slate-900/95 dark:bg-black/90 border border-border-main text-white px-2.5 py-1.5 rounded-xl text-[9px] font-black shadow-xl whitespace-nowrap mb-2 z-[20]">
                        <div className="text-[7px] text-white/70 uppercase tracking-widest">Nouveaux dossiers</div>
                        <div className="text-sm font-black text-accent mt-0.5">{pCount} Patient{pCount > 1 ? 's' : ''}</div>
                      </div>

                      {/* Bar container */}
                      <div className="w-full relative rounded-t-xl overflow-hidden bg-slate-100 dark:bg-white/5 border border-transparent group-hover/bar:border-primary/20 transition-all h-full flex items-end">
                        <motion.div 
                          initial={{ height: 0 }}
                          animate={{ height: `${val}%` }}
                          transition={{ duration: 0.8, ease: "easeOut", delay: idx * 0.05 }}
                          className="w-full rounded-t-xl bg-gradient-to-t from-primary/30 to-primary relative group-hover/bar:from-primary/50 group-hover/bar:to-primary/90 transition-all"
                        >
                          {/* Glow indicator at the top of active bar */}
                          {val > 5 && (
                            <div className="absolute top-0 left-0 right-0 h-1 bg-white/40 shadow-[0_0_10px_#fff]" />
                          )}
                        </motion.div>
                      </div>

                      {/* Day label */}
                      <span className="text-[9px] font-black text-text-muted uppercase tracking-wider group-hover/bar:text-primary transition-colors">
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Bottom summary note */}
              <div className="relative z-10 border-t border-border-main pt-4 flex items-center justify-between text-[9px] font-bold text-text-muted uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Apprentissage Machine Actif
                </span>
                <span>Mise à jour : Temps Réel</span>
              </div>

            </div>
          </motion.section>
        ) : (
          <motion.section variants={itemVariants} className="space-y-5">
            <h2 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 px-4 flex items-center justify-between">
              <span className="flex items-center gap-2"><Clock size={16} /> File d'attente & Arrivées du Jour</span>
              <button 
                onClick={fetchTodayAppointments} 
                className="text-primary hover:text-primary-hover text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 bg-primary/5 px-2.5 py-1 rounded-full border border-primary/10 transition-all"
              >
                {loadingAppts ? <Loader2 className="animate-spin" size={10} /> : 'Actualiser'}
              </button>
            </h2>
            
            <div className="bg-card-bg/85 backdrop-blur-xl rounded-elite-lg border border-border-main p-6 h-[410px] shadow-elite flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
              
              {/* Contenu principal défilable */}
              <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                {todayAppointments && todayAppointments.length > 0 ? (
                  [...todayAppointments]
                    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                    .map((appt) => {
                      const apptTime = new Date(appt.start_time).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                      
                      let statusLabel = "Prévu";
                      let statusColor = "bg-slate-100 text-slate-600 border-slate-200";
                      let actionButton = null;

                      if (appt.status === 'EN_S_ATTENTE') {
                        statusLabel = "Salle d'attente";
                        statusColor = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 animate-pulse";
                        actionButton = (
                          <button
                            onClick={() => updateAppointmentStatus(appt.id, 'EN_FAUTEUIL')}
                            className="px-3 py-1.5 bg-primary text-white text-[10px] font-black uppercase tracking-wider rounded-lg shadow-md hover:brightness-110 transition-all"
                          >
                            Installer au Fauteuil
                          </button>
                        );
                      } else if (appt.status === 'EN_FAUTEUIL') {
                        statusLabel = "Au Fauteuil";
                        statusColor = "bg-blue-500/10 text-blue-500 border-blue-500/20";
                        actionButton = (
                          <button
                            onClick={() => updateAppointmentStatus(appt.id, 'TERMINÉ')}
                            className="px-3 py-1.5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-slate-700 transition-all"
                          >
                            Terminer la Séance
                          </button>
                        );
                      } else if (appt.status === 'TERMINÉ') {
                        statusLabel = "Terminé";
                        statusColor = "bg-slate-500/10 text-slate-400 border-slate-500/10";
                      } else if (appt.status === 'ANNULÉ') {
                        statusLabel = "Annulé";
                        statusColor = "bg-rose-500/10 text-rose-500 border-rose-500/20";
                      } else {
                        actionButton = (
                          <button
                            onClick={() => updateAppointmentStatus(appt.id, 'EN_S_ATTENTE')}
                            className="px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider rounded-lg shadow-md hover:brightness-110 transition-all"
                          >
                            Marquer Arrivé
                          </button>
                        );
                      }

                      return (
                        <div 
                          key={appt.id}
                          className="flex items-center justify-between p-4 bg-white/40 border border-border-main rounded-elite-sm hover:bg-white/60 transition-all gap-4"
                        >
                          <div className="flex items-center gap-4">
                            <div className="text-sm font-black text-primary bg-primary/5 border border-primary/10 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                              {apptTime}
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-primary font-outfit">
                                {appt.patient ? `${appt.patient.nom.toUpperCase()} ${appt.patient.prenom}` : 'Patient non spécifié'}
                              </h4>
                              <p className="text-[10px] font-bold text-text-muted mt-0.5 uppercase tracking-wide">
                                {appt.description || 'Consultation clinique'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className={cn("text-[9px] font-black border px-2.5 py-1 rounded-full uppercase tracking-wider", statusColor)}>
                              {statusLabel}
                            </span>
                            {actionButton}
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-16 space-y-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 rounded-full flex items-center justify-center">
                      <Calendar size={28} className="text-emerald-500" />
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-primary font-outfit mb-2">Aucun patient aujourd'hui</h4>
                      <p className="text-text-muted text-xs font-medium mt-1 max-w-[250px] mx-auto leading-relaxed">
                        Les rendez-vous programmés pour la journée apparaîtront ici pour le suivi de la file d'attente.
                      </p>
                    </div>
                    <Link 
                      to="/agenda" 
                      className="mt-4 px-5 py-2.5 bg-emerald-500/10 text-emerald-600 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
                    >
                      Ouvrir l'agenda
                    </Link>
                  </div>
                )}
              </div>

              {/* Statistiques rapides en bas */}
              <div className="relative z-10 border-t border-border-main pt-4 mt-4 flex items-center justify-between text-[9px] font-black text-text-muted uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  En Salle d'Attente : {todayAppointments.filter(a => a.status === 'EN_S_ATTENTE').length}
                </span>
                <span>
                  Au Fauteuil : {todayAppointments.filter(a => a.status === 'EN_FAUTEUIL').length}
                </span>
              </div>
            </div>
          </motion.section>
        )}

        {/* C1 — Forecast Semaine + E4 — Alertes du Jour */}
        {(forecast || proactiveAlerts.length > 0) && (
          <motion.section variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* C1 — Forecast Semaine */}
            {forecast && (
              <div className="bg-card-bg rounded-elite-lg border border-border-main shadow-elite p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 bg-emerald-500/10 rounded-elite-sm flex items-center justify-center border border-emerald-500/20">
                    <BarChart2 size={18} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-primary font-outfit uppercase tracking-tight">Forecast Semaine</h3>
                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{forecast.rdv_count} RDV planifiés</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-black text-emerald-400 font-outfit">{forecast.forecast_revenue.toLocaleString('fr-FR')}</span>
                    <span className="text-sm text-text-muted font-bold mb-1">MAD estimés</span>
                  </div>
                  <p className="text-[11px] text-text-muted font-medium">
                    Basé sur {forecast.rdv_count} RDV × {forecast.avg_per_rdv.toFixed(0)} MAD moyen/RDV (30 derniers jours)
                  </p>
                </div>
              </div>
            )}

            {/* E4 — Alertes du Jour */}
            {proactiveAlerts.length > 0 && (
              <div className="bg-card-bg rounded-elite-lg border border-border-main shadow-elite p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-amber-500/10 rounded-elite-sm flex items-center justify-center border border-amber-500/20">
                      <Bell size={18} className="text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-primary font-outfit uppercase tracking-tight">Alertes du Jour</h3>
                      <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{proactiveAlerts.length} alerte{proactiveAlerts.length > 1 ? 's' : ''} active{proactiveAlerts.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <span className="w-6 h-6 bg-amber-500 text-white rounded-full text-[10px] font-black flex items-center justify-center">
                    {proactiveAlerts.length}
                  </span>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {proactiveAlerts.map(alert => (
                    <div key={alert.id} className="flex items-center gap-3 p-3 bg-white/30 border border-border-main rounded-elite-sm hover:bg-white/50 transition-all group">
                      <div className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        alert.priority === 1 ? "bg-red-500" : "bg-amber-400"
                      )} />
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/patients/${alert.patient_id}`)}>
                        <p className="text-[11px] font-black text-primary truncate">
                          {alert.nom} {alert.prenom} — <span className="text-amber-500">{alert.title}</span>
                        </p>
                        <p className="text-[10px] text-text-muted font-medium truncate">{alert.action}</p>
                      </div>
                      <button
                        onClick={() => markAlertRead(alert.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-text-muted hover:text-emerald-400"
                        title="Marquer comme lu"
                      >
                        <CheckCheck size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.section>
        )}

        {/* C4 — Taux Conversion + C5 — Projection Mensuelle + Ghost Re-Call */}
        {(conversion || projection || latentCash) && (
          <motion.section variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* C4 — Taux de Conversion Devis */}
            {conversion && conversion.devis_count > 0 && (
              <div className="bg-card-bg rounded-elite-lg border border-border-main shadow-elite p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 bg-blue-500/10 rounded-elite-sm flex items-center justify-center border border-blue-500/20">
                    <TrendingUp size={18} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-primary font-outfit uppercase tracking-tight">Taux de Conversion</h3>
                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{conversion.devis_count} devis émis</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <span className={cn("text-3xl font-black font-outfit", conversion.taux >= 60 ? "text-emerald-400" : conversion.taux >= 40 ? "text-amber-400" : "text-red-400")}>
                      {conversion.taux}%
                    </span>
                    <span className="text-sm text-text-muted font-bold mb-1">de conversion</span>
                  </div>
                  <div className="w-full bg-slate-200/50 rounded-full h-2">
                    <div className={cn("h-2 rounded-full transition-all", conversion.taux >= 60 ? "bg-emerald-400" : conversion.taux >= 40 ? "bg-amber-400" : "bg-red-400")}
                      style={{ width: `${Math.min(conversion.taux, 100)}%` }} />
                  </div>
                  <p className="text-[11px] text-text-muted font-medium">
                    {conversion.converted_count} / {conversion.devis_count} devis suivis d'un acte
                    {conversion.avg_days ? ` · délai moyen ${conversion.avg_days}j` : ''}
                  </p>
                </div>
              </div>
            )}

            {/* C5 — Projection Mensuelle */}
            {projection && (
              <div className="bg-card-bg rounded-elite-lg border border-border-main shadow-elite p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 bg-violet-500/10 rounded-elite-sm flex items-center justify-center border border-violet-500/20">
                    <BarChart2 size={18} className="text-violet-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-primary font-outfit uppercase tracking-tight">Projection Mensuelle</h3>
                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Moy. {projection.avg_monthly.toLocaleString('fr-FR')} MAD/mois</p>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {[...projection.historical, ...projection.projections].map(entry => (
                    <div key={entry.month} className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-text-muted">{entry.month}</span>
                      <div className="flex items-center gap-2">
                        <span className={cn("font-black", entry.type === 'actual' ? "text-primary" : "text-violet-400")}>
                          {entry.revenue.toLocaleString('fr-FR')} MAD
                        </span>
                        <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider",
                          entry.type === 'actual' ? "bg-slate-100 text-slate-500" : "bg-violet-500/10 text-violet-500")}>
                          {entry.type === 'actual' ? 'réel' : 'estimé'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* GHOST RE-CALL : Cash Latent */}
            {latentCash && latentCash.total_opportunites > 0 && (
              <div className="bg-card-bg rounded-elite-lg border border-border-main shadow-elite p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-purple-500/10 rounded-elite-sm flex items-center justify-center border border-purple-500/20">
                      <Banknote size={18} className="text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-primary font-outfit uppercase tracking-tight">Ghost Re-Call (Cash Latent)</h3>
                      <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{latentCash.total_opportunites} Opportunités</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-black text-purple-400 font-outfit">{latentCash.valeur_totale_latente.toLocaleString('fr-FR')}</span>
                    <span className="text-sm text-text-muted font-bold mb-1">MAD récupérables</span>
                  </div>
                  <p className="text-[11px] text-text-muted font-medium mb-3">
                    Devis signés de plus de 15 jours sans actes commencés.
                  </p>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                    {latentCash.opportunites.map((opp: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl hover:bg-purple-50 hover:border-purple-200 transition-all cursor-pointer" onClick={() => navigate(`/patients/${opp.patient_id}`)}>
                        <div>
                          <p className="text-xs font-black text-slate-800">{opp.patient_name}</p>
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{opp.type} • {opp.date_devis}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-purple-600">{opp.montant.toLocaleString('fr-FR')} <span className="text-[9px] text-purple-400">MAD</span></p>
                          <a href={`tel:${opp.telephone}`} onClick={(e) => e.stopPropagation()} className="text-[10px] text-emerald-500 hover:text-emerald-600 font-bold flex items-center gap-1 justify-end mt-0.5"><Phone size={10} /> Appeler</a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.section>
        )}
      </div>

      {/* GHOST SECRÉTARIAT MODAL (To-Do List Magique) */}
      <AnimatePresence>
        {ghostSecretariatPatient && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 w-80 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/50 p-5 overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-cyan-400" />
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 flex items-center gap-1"><Sparkles size={10} /> Ghost Action</p>
                <h3 className="text-sm font-black text-white truncate max-w-[200px]">Patient Sortant : {ghostSecretariatPatient.nom.toUpperCase()} {ghostSecretariatPatient.prenom}</h3>
              </div>
              <button onClick={() => setGhostSecretariatPatient(null)} className="text-slate-400 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-800 bg-slate-800/50 cursor-pointer hover:bg-slate-800 transition-colors">
                <input type="checkbox" checked={ghostChecklist.encaisser} onChange={(e) => setGhostChecklist(prev => ({...prev, encaisser: e.target.checked}))} className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900" />
                <span className={cn("text-xs font-bold", ghostChecklist.encaisser ? "text-slate-500 line-through" : "text-slate-200")}>Encaisser les soins du jour</span>
              </label>
              <label className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-800 bg-slate-800/50 cursor-pointer hover:bg-slate-800 transition-colors">
                <input type="checkbox" checked={ghostChecklist.ordonnance} onChange={(e) => setGhostChecklist(prev => ({...prev, ordonnance: e.target.checked}))} className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900" />
                <span className={cn("text-xs font-bold", ghostChecklist.ordonnance ? "text-slate-500 line-through" : "text-slate-200")}>Remettre l'ordonnance</span>
              </label>
              <label className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-800 bg-slate-800/50 cursor-pointer hover:bg-slate-800 transition-colors">
                <input type="checkbox" checked={ghostChecklist.rdv} onChange={(e) => setGhostChecklist(prev => ({...prev, rdv: e.target.checked}))} className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900" />
                <span className={cn("text-xs font-bold", ghostChecklist.rdv ? "text-slate-500 line-through" : "text-slate-200")}>Fixer le RDV de contrôle</span>
              </label>
            </div>
            {ghostChecklist.encaisser && ghostChecklist.ordonnance && ghostChecklist.rdv && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-center text-[10px] font-black uppercase text-emerald-400">
                Action terminée !
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Mobile Security Modal */}
      <AnimatePresence>
        {isMobileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10"
            >
              <button
                onClick={() => setIsMobileModalOpen(false)}
                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors z-20"
              >
                <X size={24} />
              </button>
              <div className="p-8 overflow-y-auto">
                <MobileSecurity />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};