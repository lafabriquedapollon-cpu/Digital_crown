import React, { useEffect } from 'react';
import { Sidebar } from '../Sidebar';
import { Header } from '../Header';
import { LicenseBanner } from '../LicenseBanner';
import { useEliteStore } from '../../stores/useEliteStore';
import { useSettingsStore } from '../../features/admin/Settings/hooks/useSettingsStore';
import { useLocation } from 'react-router-dom';
import { safeStorage } from '../../hooks/useLocalStorage';
import { AnimatedBackground } from '../AnimatedBackground';
import { PREMIUM_FONTS } from '../../features/admin/constants';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Bot, Menu } from 'lucide-react';
import { CrownBotChat } from '../CrownBot/CrownBotChat';

interface LayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<LayoutProps> = ({ children }) => {
  const { fetchPatientIntelligence } = useEliteStore();
  const location = useLocation();
  
  // Détection du patient_id dans l'URL pour rafraîchir l'intelligence
  useEffect(() => {
    const match = location.pathname.match(/\/patients\/(\d+)/);
    if (match && match[1]) {
      fetchPatientIntelligence(parseInt(match[1], 10));
    }
  }, [location.pathname, fetchPatientIntelligence]);

  const { profile, fetchProfile } = useSettingsStore();
  const [animatedBg, setAnimatedBg] = React.useState(() => safeStorage.get('app_background_animated') === 'true');
  
  // Rigueur CTO : Chargement du profil et application du thème au montage du layout
  useEffect(() => {
    if (!profile.nom) {
      fetchProfile();
    }
  }, [profile.nom, fetchProfile]);

  useEffect(() => {
    const handleSettingsUpdate = () => {
      setAnimatedBg(safeStorage.get('app_background_animated') === 'true');
    };
    window.addEventListener('settings_updated', handleSettingsUpdate);
    return () => window.removeEventListener('settings_updated', handleSettingsUpdate);
  }, []);

  const fontClass = PREMIUM_FONTS.find(f => f.id === profile.font_fr)?.class || 'font-sans';
  const [isBotOpen, setIsBotOpen] = useState(false);
  const [ghostUnreadCount, setGhostUnreadCount] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile nav)
  React.useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className={`flex flex-row h-screen overflow-hidden ${fontClass} selection:bg-primary selection:text-white relative bg-medical-pearl`} style={{ color: 'var(--text-main)' }}>
      {animatedBg && <AnimatedBackground />}

      {/* BACKGROUND DYNAMIQUE */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[30%] h-[50%] rounded-full opacity-20 blur-[120px]" style={{ backgroundColor: 'var(--accent)' }} />
      </div>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex-1 flex flex-col relative z-10 overflow-hidden">
        <LicenseBanner />
        {/* Hamburger button — visible only on mobile/tablet */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden fixed top-5 left-4 z-[9998] p-2 rounded-xl bg-card-bg border border-border-main shadow-elite text-text-main hover:text-primary hover:bg-primary/5 transition-all"
          aria-label="Menu"
        >
          <Menu size={22} />
        </button>
        <Header />

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-8 pt-0 flex flex-col custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex-1 rounded-elite border backdrop-blur-xl shadow-elite p-6 transition-elite"
              style={{ 
                backgroundColor: 'var(--glass-bg)',
                borderColor: 'var(--glass-border)'
              }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Bouton Flottant Crown Bot (Desktop) */}
      <div className="fixed bottom-8 right-8 z-50">
        <button
          onClick={() => setIsBotOpen(!isBotOpen)}
          className="w-14 h-14 bg-gradient-to-tr from-primary to-secondary text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all border border-white/20 relative"
        >
          <Bot size={24} />
          {ghostUnreadCount > 0 && !isBotOpen && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 text-slate-900 text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white animate-pulse shadow-lg">
              {ghostUnreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Overlay / Popover Crown Bot */}
      <AnimatePresence>
        {isBotOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-28 right-8 w-[400px] h-[600px] z-50 rounded-[24px] overflow-hidden shadow-2xl border border-white/20 bg-white/5 backdrop-blur-3xl"
          >
            <CrownBotChat onClose={() => setIsBotOpen(false)} onUnreadChange={setGhostUnreadCount} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};