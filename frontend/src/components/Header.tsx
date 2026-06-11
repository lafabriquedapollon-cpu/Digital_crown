import { useState, useEffect, useRef } from 'react';
import { Bell, UserCircle, Settings, LogOut, Calculator, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cabinetApi } from '../services/templateApi';
import { api } from '../services/api';
import { safeStorage } from '../hooks/useLocalStorage';
import { useAuthStore } from '../stores/useAuthStore';
import { authService } from '../services/auth';

export const Header = () => {
  const [cabinetName, setCabinetName] = useState('Chargement...');
  const [praticienName, setPraticienName] = useState('Praticien');
  const [treasuryCount, setTreasuryCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { user } = useAuthStore();
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const activeId = localStorage.getItem('active_cabinet_id') || 'benmoussa';
    if (activeId === 'benmoussa') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCabinetName('Centre Dentaire Benmoussa');
       
      setPraticienName('Dr. Benmoussa');
    }

    const fetchData = async () => {
      try {
        const config = await cabinetApi.getMine();
        if (!localStorage.getItem('active_cabinet_id')) {
          setCabinetName(config.nom_cabinet || 'Mon Cabinet');
          if (config.header_lines_fr && config.header_lines_fr.length > 0) {
            setPraticienName(config.header_lines_fr[0]);
          }
        }
      } catch (error) {
        console.error("Erreur header config:", error);
      }
    };

    // Ref pour arrêter le polling depuis l'intérieur du callback
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchTreasury = async () => {
      try {
        const res = await api.get('/accounting/treasury-hub');
        setTreasuryCount(res.data.pending_count || 0);
      } catch (e: any) {
        const status = e?.response?.status;
        // 401 (token expiré) ou 402 (licence) → arrêter le polling,
        // l'intercepteur api.ts gère déjà le refresh/redirect
        if (status === 401 || status === 402) {
          if (intervalId !== null) clearInterval(intervalId);
        }
        // Autres erreurs (réseau, 500...) : on ignore et on réessaie au prochain tick
      }
    };

    fetchData();
    fetchTreasury();

    const handleCabinetChange = (e: any) => {
      const { cabinet } = e.detail;
      setCabinetName(cabinet.nom);
      setPraticienName(cabinet.specialty);
    };
    window.addEventListener('cabinet-changed', handleCabinetChange);

    intervalId = setInterval(fetchTreasury, 60000);
    return () => {
      if (intervalId !== null) clearInterval(intervalId);
      window.removeEventListener('cabinet-changed', handleCabinetChange);
    };
  }, []);

  const handleLogout = async () => {
    safeStorage.remove('appMode');
    await authService.logout();
    window.location.href = '/welcome'; 
  };


  return (
    <header className="h-20 bg-transparent flex items-center justify-end gap-6 px-8 shrink-0 relative z-[1000]">
      
      {/* SETTINGS, AI, GUIDE & NOTIFS */}
      <div className="flex items-center gap-2">
        {user?.email?.toLowerCase() === 'benmoussa.achraf@gmail.com' && (
          <Link 
            to="/super-admin" 
            className="hidden sm:flex items-center gap-2 px-3 py-2 bg-amber-400/10 text-amber-500 hover:bg-amber-400/20 rounded-elite-sm font-black text-xs transition-elite border border-amber-400/20 mr-2"
          >
            Gestion des Dentistes
          </Link>
        )}
        
        {/* Mobile SuperAdmin Button (Icon only) */}
        {user?.email?.toLowerCase() === 'benmoussa.achraf@gmail.com' && (
          <Link 
            to="/super-admin" 
            className="flex sm:hidden p-2.5 text-amber-500 bg-amber-400/10 hover:bg-amber-400/20 rounded-elite-sm transition-elite border border-amber-400/20"
            title="Gestion des Dentistes"
          >
            <Shield size={20} />
          </Link>
        )}

        <Link to="/settings" className="p-2.5 text-text-muted hover:text-primary hover:bg-primary/5 rounded-elite-sm transition-elite" title="Réglages">
          <Settings size={20} />
        </Link>
        <div className="relative" ref={notifRef}>
          <button 
            onClick={() => setShowNotifs(!showNotifs)}
            className="p-2.5 text-text-muted hover:text-primary hover:bg-primary/5 rounded-elite-sm transition-elite relative group"
          >
            <Bell size={20} className="group-hover:scale-110 transition-elite" />
            {treasuryCount > 0 && (
              <span className="absolute top-2.5 right-2.5 w-3 h-3 bg-red-500 text-white text-[7px] font-black rounded-full border-2 border-card-bg flex items-center justify-center animate-pulse">
                {treasuryCount}
              </span>
            )}
          </button>


          {showNotifs && (
            <div className="absolute top-full right-0 mt-2 w-72 bg-card-bg border border-border-main rounded-3xl shadow-elite p-4 animate-in slide-in-from-top-2 duration-300 z-50 backdrop-blur-xl">
               <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-3 px-2">Alertes Ghost Treasury</h4>
               {treasuryCount > 0 ? (
                 <Link 
                   to="/accounting?tab=treasury" 
                   onClick={() => setShowNotifs(false)}
                   className="flex items-center gap-4 p-3 hover:bg-primary/5 rounded-2xl transition-all border border-transparent hover:border-primary/10"
                 >
                   <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                     <Calculator size={18} />
                   </div>
                   <div>
                     <p className="text-xs font-black text-main leading-tight" style={{ color: 'var(--text-main)' }}>Relances en attente</p>
                     <p className="text-[10px] text-primary font-bold mt-0.5">{treasuryCount} dossiers à encaisser</p>
                   </div>
                 </Link>
               ) : (
                 <div className="text-center py-6">
                    <p className="text-[10px] font-bold text-text-muted italic">Trésorerie saine. Aucune alerte.</p>
                 </div>
               )}
               <div className="mt-3 pt-3 border-t border-border-main">
                  <Link to="/accounting" className="block text-center text-[9px] font-black text-text-muted hover:text-primary uppercase tracking-tighter transition-colors">
                    Voir toute la comptabilité
                  </Link>
               </div>
            </div>
          )}
        </div>
      </div>

      <div className="hidden md:block w-px h-6 bg-border-main mx-2" />

      {/* USER PROFILE */}
      <div className="flex items-center gap-4">
        <div className="text-right hidden lg:block">
          <p className="text-sm font-black text-primary leading-none tracking-tight font-outfit">{cabinetName}</p>
          <p className="text-[10px] font-bold text-text-muted mt-1 uppercase tracking-tighter">
            {user?.nom_complet || (user?.role === 'SECRETAIRE' ? 'Assistante' : 'Praticien')}
          </p>
        </div>
        <div className="w-11 h-11 rounded-elite-sm bg-card-bg border border-border-main flex items-center justify-center text-primary shadow-elite transition-elite hover:scale-105">
          <UserCircle size={24} />
        </div>
      </div>

      {/* LOGOUT */}
      <button 
        onClick={() => setShowLogoutConfirm(true)} 
        className="ml-2 p-2.5 text-text-muted hover:text-red-600 hover:bg-red-500/10 rounded-elite-sm transition-elite group"
        title="Déconnexion"
      >
        <LogOut size={20} className="group-hover:scale-110 transition-elite" /> 
      </button>

      {/* LOGOUT CONFIRMATION MODAL */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card-bg border border-border-main rounded-3xl p-6 shadow-elite max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-4">
                <LogOut size={32} />
              </div>
              <h3 className="text-xl font-black text-main mb-2">Déconnexion</h3>
              <p className="text-sm font-bold text-text-muted mb-6">
                Êtes-vous sûr de vouloir vous déconnecter de votre session ?
              </p>
              <div className="flex w-full gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-3 rounded-xl border border-border-main font-bold text-text-muted hover:text-main hover:bg-main/5 transition-elite"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    handleLogout();
                  }}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black shadow-lg shadow-red-500/20 hover:bg-red-600 transition-elite"
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </header>
  );
};
