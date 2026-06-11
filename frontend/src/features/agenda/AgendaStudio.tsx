import React, { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, LayoutGrid, CalendarDays, ListFilter, UploadCloud, Ticket } from 'lucide-react';
import { cn } from '../../utils/cn';
import { DailyView } from './DailyView';
import { WeeklyView } from './WeeklyView';
import { MonthlyView } from './MonthlyView';
import { GoogleImportModal } from './GoogleImportModal';
import { api } from '../../services/api';
import { Ghost, Settings } from 'lucide-react';

export type AgendaViewMode = 'day' | 'week' | 'month';

export const AgendaStudio: React.FC = () => {
  const [viewMode, setViewMode] = useState<AgendaViewMode>('week');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [upcomingHolidays, setUpcomingHolidays] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    api.get('/upcoming-holidays').then(res => setUpcomingHolidays(res.data)).catch(console.error);
    api.get('/agenda/settings').then(res => setSettings(res.data)).catch(console.error);
  }, []);

  const handlePrev = () => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'day') newDate.setDate(newDate.getDate() - 1);
    else if (viewMode === 'week') newDate.setDate(newDate.getDate() - 7);
    else if (viewMode === 'month') newDate.setMonth(newDate.getMonth() - 1);
    setSelectedDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'day') newDate.setDate(newDate.getDate() + 1);
    else if (viewMode === 'week') newDate.setDate(newDate.getDate() + 7);
    else if (viewMode === 'month') newDate.setMonth(newDate.getMonth() + 1);
    setSelectedDate(newDate);
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  const renderView = () => {
    // On passe une clé pour forcer le rafraîchissement des vues enfants (Daily, Weekly, etc)
    switch (viewMode) {
      case 'day': return <DailyView key={`day-${refreshKey}`} selectedDate={selectedDate} />;
      case 'week': return <WeeklyView key={`week-${refreshKey}`} selectedDate={selectedDate} />;
      case 'month': return <MonthlyView key={`month-${refreshKey}`} selectedDate={selectedDate} />;
      default: return <DailyView key={`day-${refreshKey}`} selectedDate={selectedDate} />;
    }
  };

  const handleBlockHoliday = async () => {
    if (upcomingHolidays.length === 0) return;
    const hol = upcomingHolidays[0];
    try {
      await api.post('/agenda/exceptions', {
        start_date: hol.date,
        end_date: hol.date,
        reason: hol.name,
        is_recurring: false
      });
      // Optionally reload or show a success message
      setUpcomingHolidays(prev => prev.slice(1));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      
      {/* GHOST CALENDRIER */}
      {upcomingHolidays.length > 0 && (
        <div className="bg-primary text-white p-4 rounded-2xl shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-white/20 rounded-xl">
              <Ghost size={24} className="animate-pulse" />
            </div>
            <div>
              <h3 className="font-black text-lg">Ghost Calendrier</h3>
              <p className="text-white/80 text-sm">
                Prochain jour férié : <strong>{upcomingHolidays[0].name}</strong> le {new Date(upcomingHolidays[0].date).toLocaleDateString('fr-FR')}
              </p>
            </div>
          </div>
          <button 
            onClick={handleBlockHoliday}
            className="bg-white text-primary px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors"
          >
            Bloquer l'agenda
          </button>
        </div>
      )}

      {/* GLOBAL CONTROLS HEADER */}
      <div data-tour="agenda-header" className="flex flex-col lg:flex-row justify-between items-center gap-6 bg-white/40 backdrop-blur-2xl border border-white/60 p-6 rounded-[2.5rem] shadow-2xl">
        
        {/* Left: Branding & Date Navigation */}
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 transform hover:scale-105 transition-transform">
            <Calendar size={28} />
          </div>
          
          <div className="space-y-1">
            <h1 className="text-3xl font-black text-primary tracking-tight">Studio Agenda</h1>
            <div className="flex items-center gap-3">
              <button onClick={handlePrev} className="p-1.5 hover:bg-white/60 rounded-full transition-colors text-primary">
                <ChevronLeft size={20} />
              </button>
              <span className="text-sm font-black text-slate-600 min-w-[140px] text-center uppercase tracking-wider">
                {viewMode === 'month' 
                  ? selectedDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                  : selectedDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <button onClick={handleNext} className="p-1.5 hover:bg-white/60 rounded-full transition-colors text-primary">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Right: View Switching & Actions */}
        <div data-tour="agenda-view-switcher" className="flex items-center gap-4 bg-slate-100/50 p-1.5 rounded-2xl border border-slate-200/50 backdrop-blur-md">
          {settings?.use_tickets && (
            <button 
              className="flex items-center gap-2 px-4 py-2.5 text-amber-600 hover:bg-amber-100 font-bold text-sm rounded-xl transition-all"
              title="Générer un ticket"
            >
              <Ticket size={18} />
              <span className="hidden xl:inline">Nouveau Ticket</span>
            </button>
          )}

          <button 
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-primary hover:brightness-110 hover:bg-primary/10 font-bold text-sm rounded-xl transition-all"
            title="Importer depuis Google Agenda"
          >
            <UploadCloud size={18} />
            <span className="hidden xl:inline">Importer</span>
          </button>
          
          <div className="w-px h-6 bg-slate-200 mx-1" />

          <button 
            onClick={() => setViewMode('day')}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all",
              viewMode === 'day' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-primary hover:bg-white/40"
            )}
          >
            <CalendarDays size={18} /> Jour
          </button>
          <button 
            onClick={() => setViewMode('week')}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all",
              viewMode === 'week' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-primary hover:bg-white/40"
            )}
          >
            <ListFilter size={18} /> Semaine
          </button>
          <button 
            onClick={() => setViewMode('month')}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all",
              viewMode === 'month' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-primary hover:bg-white/40"
            )}
          >
            <LayoutGrid size={18} /> Mois
          </button>
          <div className="w-px h-6 bg-slate-200 mx-1" />
          <button 
            onClick={handleToday}
            className="px-5 py-2.5 bg-white text-slate-700 font-bold text-sm rounded-xl hover:bg-slate-50 transition-all border border-slate-200 shadow-sm"
          >
            Aujourd'hui
          </button>
        </div>
      </div>

      {/* RENDER ACTIVE VIEW */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {renderView()}
      </div>

      <GoogleImportModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          // Force le rafraichissement de la vue active
          setRefreshKey(prev => prev + 1);
        }}
      />

    </div>
  );
};
