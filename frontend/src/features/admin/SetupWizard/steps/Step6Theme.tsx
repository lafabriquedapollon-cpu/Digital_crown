import React from 'react';
import { Sun, Moon, Sparkles, HeartPulse, CheckCircle2 } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import toast from 'react-hot-toast';

interface Props {
  selectedTheme: 'elite' | 'emerald' | 'rose' | 'prestige';
  setSelectedThemeAndPersist: (v: 'elite' | 'emerald' | 'rose' | 'prestige') => void;
}

const THEMES = [
  { id: 'elite' as const, label: 'Lumière Pure', class: 'bg-card border-border-main', desc: 'Clarté & Pro', icon: Sun, iconColor: 'text-amber-500' },
  { id: 'emerald' as const, label: 'Escale Zen', class: 'bg-emerald-500/5 border-emerald-500/20', desc: 'Sérénité', icon: Sparkles, iconColor: 'text-emerald-500' },
  { id: 'rose' as const, label: 'Rose Prestige', class: 'bg-rose-500/5 border-rose-500/20', desc: 'Esthétique', icon: HeartPulse, iconColor: 'text-rose-500' },
  { id: 'prestige' as const, label: 'Nuit Intense', class: 'bg-card border-border-main text-text-main', desc: 'Luxe', icon: Moon, iconColor: 'text-primary' },
] as const;

export const Step6Theme: React.FC<Props> = ({ selectedTheme, setSelectedThemeAndPersist }) => (
  <div className="space-y-6 animate-in fade-in duration-300">
    <div className="text-center mb-8">
      <h2 className="text-2xl font-black text-text-main">Atmosphère Élite</h2>
      <p className="text-sm text-text-muted">Choisissez l'univers visuel qui vous ressemble.</p>
    </div>

    <div className="grid grid-cols-2 gap-4">
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => setSelectedThemeAndPersist(t.id)}
          className={cn(
            "flex flex-col items-center gap-4 p-6 rounded-[2rem] border-2 transition-all group relative overflow-hidden",
            t.class,
            selectedTheme === t.id ? "ring-4 ring-primary/20 border-primary scale-[1.05] shadow-xl shadow-primary/10" : "opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
          )}
        >
          <div className={cn("inline-flex w-16 h-16 rounded-[1.5rem] items-center justify-center transition-transform group-hover:rotate-12", t.id === 'prestige' ? 'bg-white/10' : 'bg-white shadow-inner')}>
            <t.icon size={32} className={t.iconColor} />
          </div>
          <div className="text-center">
            <span className="block text-[10px] font-black uppercase tracking-[0.2em] mb-1">{t.label}</span>
            <span className="text-[9px] opacity-60 font-medium">{t.desc}</span>
          </div>
          {selectedTheme === t.id && (
            <div className="absolute top-4 right-4 animate-bounce"><CheckCircle2 size={20} className="text-primary" /></div>
          )}
        </button>
      ))}
    </div>

    <div className="mt-8 p-6 rounded-3xl bg-primary/5 border border-primary/10 space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Sparkles size={18} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setSelectedThemeAndPersist('elite')} className="px-3 py-1.5 rounded-lg text-[10px] font-black hover:bg-slate-100 transition-colors">ANNULER</button>
          <button
            onClick={() => toast.success('Thème confirmé !')}
            className="px-3 py-1.5 rounded-lg bg-primary text-white text-[10px] font-black shadow-lg shadow-primary/20"
          >
            CONFIRMER
          </button>
        </div>
      </div>
    </div>
  </div>
);
