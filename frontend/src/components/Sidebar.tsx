import React, { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Activity, 
  FileText,
  History,
  Calendar,
  Receipt,
  FlaskConical,
  BookOpen,
  Shield
} from 'lucide-react';
import { cn } from '../utils/cn';
import { authService } from '../services/auth';
import { ClinicalTipBubble } from '../features/clinical_tips/components/ClinicalTipBubble';
import { clinicalTips } from '../data/clinical_tips';
import { useSettingsStore } from '../features/admin/Settings/hooks/useSettingsStore';
import { useAuthStore } from '../stores/useAuthStore';

// --- OFFICIAL ASSET IMPORT (Digital Crown Logo) ---
import Logo from '../assets/logo.png';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
  const { activeCabinetId, cabinets, switchCabinet } = useSettingsStore();
  const { user } = useAuthStore();
  const location = useLocation();

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
  const [isAiActive, setIsAiActive] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [currentTip, setCurrentTip] = useState("");
  const [tipsEnabled, setTipsEnabled] = useState(localStorage.getItem('clinical_tips_enabled') !== 'false');
  
  // Cycle tips with Slingshot physics
  useEffect(() => {
    const triggerTip = () => {
      // Respect user preference globally
      if (localStorage.getItem('clinical_tips_enabled') === 'false') return;

      // 1. Tension / Anticipation
      setIsFlipping(true); 
      
      // 2. Mid-tension (randomize tip)
      setTimeout(() => {
        const randomTip = clinicalTips[Math.floor(Math.random() * clinicalTips.length)];
        setCurrentTip(randomTip);
      }, 400);

      // 3. THE LAUNCH (Snap forward)
      setTimeout(() => {
        setShowTip(true);
      }, 600);

      // 4. Reset states
      setTimeout(() => {
        setIsFlipping(false);
      }, 1200);
    };

    // Initial trigger after 10s, then every 2 minutes
    const initialTimeout = setTimeout(triggerTip, 10000);
    const interval = setInterval(triggerTip, 120000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);
  
  // CTO Rigor: Global event listener for AI animation & Settings changes
  useEffect(() => {
    const handleAiStart = () => setIsAiActive(true);
    const handleAiEnd = () => setIsAiActive(false);
    const handlePrefChange = () => setTipsEnabled(localStorage.getItem('clinical_tips_enabled') !== 'false');
    
    window.addEventListener('ai-generation-start', handleAiStart);
    window.addEventListener('ai-generation-end', handleAiEnd);
    window.addEventListener('clinical-tips-changed', handlePrefChange);
    
    return () => {
      window.removeEventListener('ai-generation-start', handleAiStart);
      window.removeEventListener('ai-generation-end', handleAiEnd);
      window.removeEventListener('clinical-tips-changed', handlePrefChange);
    };
  }, []);


  const pathParts = location.pathname.split('/');
  const isInPatientDossier = Boolean(pathParts[1] === 'patients' && pathParts[2] && pathParts[2] !== 'new');
  const currentPatientId = isInPatientDossier ? pathParts[2] : null;

  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab') || 'admin';

  return (
    <>
      {/* Backdrop overlay for mobile/tablet */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] lg:hidden"
          onClick={onClose}
        />
      )}
      {/* Animation adaptée pour le fond clair */}
      <style>{`
        @keyframes logo-pulse-light {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px var(--primary)); }
          50% { transform: scale(1.02); filter: drop-shadow(0 0 15px var(--primary)); }
        }
        @keyframes logo-slingshot {
          0% { transform: translateX(0) scale(1); filter: brightness(1); }
          30% { transform: translateX(-25px) scale(0.9) skewX(-5deg); filter: brightness(1.1); }
          50% { transform: translateX(30px) scale(1.1) skewX(10deg); filter: brightness(1.3) drop-shadow(0 0 20px var(--primary)); }
          70% { transform: translateX(-5px) scale(1.05); }
          100% { transform: translateX(0) scale(1); filter: brightness(1); }
        }
        .animate-logo-pulse-light { animation: logo-pulse-light 2s ease-in-out infinite; }
        .animate-tooth-slingshot { animation: logo-slingshot 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
      `}</style>
      {/* SIDEBAR : Clinical Premium Elite */}
      <aside className={cn(
        "w-72 bg-sidebar backdrop-blur-2xl border-r border-border-main shadow-elite flex flex-col h-screen fixed lg:relative z-[10000] shrink-0 transition-all duration-300",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        
        {/* PRODUCT IDENTITY: DIGITAL CROWN LOGO (Centered) */}
        <div className="p-6 flex items-center justify-center border-b border-border-main shrink-0 h-28 relative group/logo">
          <Link 
            to="/dashboard" 
            className="transition-elite block w-full hover:opacity-80 flex items-center justify-center"
          >
            <img 
              src={Logo} 
              alt="Digital Crown AI" 
              className={cn(
                "h-auto w-full max-w-[190px] object-contain transition-all duration-700", 
                (isAiActive && tipsEnabled) && "animate-logo-pulse-light",
                (isFlipping && tipsEnabled) && "animate-tooth-slingshot"
              )} 
              style={{ filter: document.body.dataset.theme === 'dark' ? 'brightness(0) invert(1)' : 'none' }}
            />
          </Link>
          
          <ClinicalTipBubble show={showTip} tip={currentTip} onClose={() => setShowTip(false)} />
        </div>

        {/* CABINET SWITCHER SECTION (Premium Glassmorphic Switcher) */}
        <div className="px-6 py-4 border-b border-border-main shrink-0 bg-white/5 backdrop-blur-md">
          <div className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2 px-1">Cabinet Actif</div>
          <div className="relative group">
            <select
              value={activeCabinetId}
              onChange={(e) => switchCabinet(e.target.value)}
              className="w-full bg-card-bg/60 border border-border-main rounded-elite px-3 py-2.5 text-xs font-black tracking-tight text-text-main cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40 transition-elite appearance-none"
              style={{ 
                backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'M6 8l4 4 4-4\'/%3e%3c/svg%3e")',
                backgroundPosition: 'right 0.75rem center',
                backgroundSize: '1.25em 1.25em',
                backgroundRepeat: 'no-repeat',
                paddingRight: '2rem'
              }}
            >
              {cabinets.map(cab => (
                <option key={cab.id} value={cab.id} className="text-black bg-white font-bold">
                  🏢 {cab.nom}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* STACKED NAVIGATION */}
        <nav className="flex-1 p-5 space-y-1.5 overflow-y-auto custom-scrollbar">
          <div className="text-[10px] font-black text-text-muted uppercase tracking-widest px-4 mb-3 mt-2">Intelligence & Gestion</div>
          
          <NavItem to="/dashboard" icon={<LayoutDashboard size={20} />} label="Tableau de bord" />
          <NavItem to="/analytics" icon={<Activity size={20} />} label="Analytics" />
          {hasAccess('agenda') && <NavItem to="/agenda" icon={<Calendar size={20} />} label="Studio Agenda" />}
          {hasAccess('accounting') && <NavItem to="/accounting" icon={<Receipt size={20} />} label="Comptabilité" />}
          {hasAccess('patients') && <NavItem to="/patients" icon={<Users size={20} />} label="Dossiers Patients" />}
          <NavItem to="/labo" icon={<FlaskConical size={20} />} label="Module Labo" />
          <NavItem to="/bibliotheque" icon={<BookOpen size={20} />} label="Bibliothèque Elite" />

          {/* SUPER ADMIN (Hidden for non-admin users) */}
          {user?.email?.toLowerCase() === 'benmoussa.achraf@gmail.com' && (
            <div className="mt-4 pt-4 border-t border-border-main">
              <NavItem to="/super-admin" icon={<Shield size={20} className="text-amber-500" />} label="Gestion des Dentistes" />
            </div>
          )}

          {/* ACTIVE PATIENT NAVIGATION */}
          {currentPatientId && (
            <div className="mt-8 animate-in fade-in slide-in-from-left-4 duration-500">
              <div 
                className="text-[10px] font-black uppercase tracking-widest mx-2 mb-3 shadow-sm flex items-center gap-2 py-2.5 px-4 rounded-elite-sm border transition-elite"
                style={{ 
                  backgroundColor: 'var(--primary-bg, rgba(99, 102, 241, 0.1))', 
                  color: 'var(--primary)',
                  borderColor: 'var(--glass-border)'
                }}
              >
                <div className="w-2 h-2 rounded-full animate-pulse bg-primary" />
                Dossier Actif
              </div>
              
              {hasAccess('cephalo') && (
                <NavItem 
                  to={`/patients/${currentPatientId}?tab=analysis`} 
                  icon={<Activity size={20} />} 
                  label="Studio Céphalométrique"
                  forceActive={isInPatientDossier && currentTab === 'analysis'}
                />
              )}
              
              <NavItem 
                to={`/patients/${currentPatientId}?tab=admin`} 
                icon={<FileText size={20} />} 
                label="Hub Documentaire"
                forceActive={isInPatientDossier && currentTab === 'admin'}
              />

              <NavItem 
                to={`/patients/${currentPatientId}?tab=archives`} 
                icon={<History size={20} />} 
                label="Archives & Historique"
                forceActive={isInPatientDossier && currentTab === 'archives'}
              />
            </div>
          )}

        </nav>
      </aside>
    </>
  );
};

// NavItem Component Adapted for Elite Design System
const NavItem = ({ to, icon, label, forceActive }: { to: string, icon: React.ReactNode, label: string, forceActive?: boolean }) => (
  <NavLink
    to={to}
    className={({ isActive }) => {
      const isActuallyActive = forceActive !== undefined ? forceActive : isActive;
      return cn(
        "flex items-center gap-3 px-4 py-3 rounded-elite-sm transition-elite group relative overflow-hidden cursor-pointer mb-1",
          isActuallyActive 
          ? "shadow-elite border border-border-main" 
          : "text-text-muted hover:bg-primary/5 hover:text-primary"
      );
    }}
    style={({ isActive }) => {
      const isActuallyActive = forceActive !== undefined ? forceActive : isActive;
      return isActuallyActive ? { backgroundColor: 'var(--card-bg)' } : {};
    }}
  >
    {({ isActive }) => {
      const isActuallyActive = forceActive !== undefined ? forceActive : isActive;
      return (
        <>
          {isActuallyActive && (
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full" 
              style={{ backgroundColor: 'var(--primary)' }} 
            />
          )}
          <span 
            className={cn("relative z-10 transition-elite", isActuallyActive ? "scale-110 text-primary" : "group-hover:scale-110")}
            style={isActuallyActive ? { color: 'var(--primary)' } : {}}
          >
            {icon}
          </span>
          <span 
            className={cn("text-sm relative z-10 tracking-tight transition-elite", isActuallyActive ? "font-black" : "font-bold")}
            style={isActuallyActive ? { color: 'var(--primary)' } : {}}
          >
            {label}
          </span>
        </>
      );
    }}
  </NavLink>
);
