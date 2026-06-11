import React, { useState, useEffect } from 'react';
import { cn } from '../../../../../utils/cn';
import { BRAND_IDENTITIES, PREMIUM_FONTS } from '../../../constants';
import { DENSITY_DEFAULTS } from './presets';
import type { Density } from './types';
import { Upload, Check, QrCode, UserCircle, Link, Instagram, MessageCircle, MapPin, Shield, CreditCard, ChevronDown, ChevronUp } from 'lucide-react';
import { useSettingsStore } from '../../hooks/useSettingsStore';

interface StudioControlsProps {
  profile: any;
  updateProfile: (data: any) => void;
}

export const StudioControls: React.FC<StudioControlsProps> = ({ profile, updateProfile }) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isUploadingLocal, setIsUploadingLocal] = useState(false);
  const { uploadLetterhead } = useSettingsStore();

  useEffect(() => {
    const saved = localStorage.getItem('branding_advanced_open');
    if (saved === '1') setAdvancedOpen(true);
  }, []);

  const toggleAdvanced = () => {
    const next = !advancedOpen;
    setAdvancedOpen(next);
    localStorage.setItem('branding_advanced_open', next ? '1' : '0');
  };

  const handleDensityClick = (d: Density) => {
    updateProfile(DENSITY_DEFAULTS[d]);
  };

  const currentDensity: Density = 
    (profile.margin_top === DENSITY_DEFAULTS.compact.margin_top) ? 'compact' :
    (profile.margin_top === DENSITY_DEFAULTS.etendu.margin_top) ? 'etendu' : 'confort';

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsUploadingLocal(true);
      try {
        await uploadLetterhead(e.target.files[0]);
      } finally {
        setIsUploadingLocal(false);
      }
    }
  };

  const QR_TYPES = [
    { id: 'VCARD', label: 'Contact', icon: <UserCircle size={14}/> },
    { id: 'WEBSITE', label: 'Site Web', icon: <Link size={14}/> },
    { id: 'INSTAGRAM', label: 'Instagram', icon: <Instagram size={14}/> },
    { id: 'WHATSAPP', label: 'WhatsApp', icon: <MessageCircle size={14}/> },
    { id: 'LOCATION', label: 'Maps', icon: <MapPin size={14}/> },
    { id: 'VALIDATION', label: 'Signature', icon: <Shield size={14}/> },
    { id: 'PAYMENT', label: 'Paiement', icon: <CreditCard size={14}/> },
  ];

  return (
    <div className="flex flex-col gap-5">
      
      {/* 1. PALETTE */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-6 transition-shadow hover:shadow-[0_8px_24px_-16px_rgba(11,15,23,0.18)] hover:-translate-y-[2px]">
        <h3 className="font-bold text-[11px] text-[var(--text-muted)] tracking-[0.12em] uppercase mb-2">
          Palette
        </h3>
        <p className="text-[10px] text-slate-400 mb-4">Ces couleurs s'appliquent à l'application et aux documents générés.</p>
        <div className="grid grid-cols-2 gap-3">
          {BRAND_IDENTITIES.map(palette => {
            const isSelected = profile.primary_color === palette.primary;
            return (
              <button
                key={palette.id}
                onClick={() => updateProfile({ primary_color: palette.primary, secondary_color: palette.secondary, accent_color: palette.accent })}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border transition-all text-left group",
                  isSelected ? "border-[var(--text-main)] bg-[var(--bg-medical-pearl)]" : "border-[var(--border-color)] hover:border-[var(--text-muted)]"
                )}
              >
                <div className="flex w-[32px] h-[32px] rounded-md overflow-hidden border border-[var(--border-color)] flex-shrink-0">
                  <div className="flex-1" style={{ backgroundColor: palette.primary }} />
                  <div className="flex-1" style={{ backgroundColor: palette.secondary }} />
                  <div className="flex-1" style={{ backgroundColor: palette.accent }} />
                </div>
                <span className={cn("text-[13px] font-medium leading-tight", isSelected ? "text-[var(--text-main)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-main)]")}>
                  {palette.name}
                </span>
                {isSelected && <Check size={14} className="ml-auto text-[var(--text-main)]" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. TYPOGRAPHIE */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-6 transition-shadow hover:shadow-[0_8px_24px_-16px_rgba(11,15,23,0.18)] hover:-translate-y-[2px]">
        <h3 className="font-bold text-[11px] text-[var(--text-muted)] tracking-[0.12em] uppercase mb-5">
          Typographie
        </h3>
        <div className="flex flex-col gap-2">
          {PREMIUM_FONTS.map(font => {
            const isSelected = profile.font_fr === font.id;
            return (
              <button
                key={font.id}
                onClick={() => updateProfile({ font_fr: font.id })}
                className={cn(
                  "flex items-center justify-between p-4 rounded-xl border transition-all text-left",
                  isSelected ? "border-[var(--text-main)] bg-[var(--bg-medical-pearl)]" : "border-[var(--border-color)] hover:border-[var(--text-muted)]"
                )}
              >
                <div>
                  <div className={cn("text-[16px] text-[var(--text-main)] leading-tight mb-1", font.class)}>
                    {font.name}
                  </div>
                  <div className="text-[13px] text-[var(--text-muted)]">
                    {font.desc}
                  </div>
                </div>
                {isSelected && <div className="w-5 h-5 rounded-full bg-[var(--text-main)] text-white flex items-center justify-center shrink-0"><Check size={12} /></div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. MODÈLES D'ORDONNANCE */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-6 transition-shadow hover:shadow-[0_8px_24px_-16px_rgba(11,15,23,0.18)] hover:-translate-y-[2px]">
        <h3 className="font-bold text-[11px] text-[var(--text-muted)] tracking-[0.12em] uppercase mb-5">
          Modèles d'Ordonnance
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { id: 'swiss', name: 'Swiss Clinic', desc: 'Précision & Clarté' },
            { id: 'royal', name: 'Royal Elite', desc: 'Symétrie Absolue' },
            { id: 'clinical', name: 'Clinical Grid', desc: 'Rigueur Scientifique' },
            { id: 'modern', name: 'Modern Flush', desc: 'Aération Contemporaine' },
            { id: 'heritage', name: 'L\'Héritage', desc: 'Prestige Classique' }
          ].map(tpl => {
            const isSelected = profile.selected_template === tpl.id;
            return (
              <button
                key={tpl.id}
                onClick={() => updateProfile({ selected_template: tpl.id })}
                className={cn(
                  "flex flex-col items-start gap-1 p-3 rounded-xl border transition-all text-left",
                  isSelected ? "border-[var(--text-main)] bg-[var(--bg-medical-pearl)]" : "border-[var(--border-color)] hover:border-[var(--text-muted)]"
                )}
              >
                <span className={cn("text-[13px] font-bold leading-tight", isSelected ? "text-[var(--text-main)]" : "text-[var(--text-main)]")}>
                  {tpl.name}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">{tpl.desc}</span>
                {isSelected && <div className="absolute"><Check size={14} className="text-[var(--text-main)] opacity-0" /></div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. MISE EN PAGE */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-6 transition-shadow hover:shadow-[0_8px_24px_-16px_rgba(11,15,23,0.18)] hover:-translate-y-[2px]">
        <h3 className="font-bold text-[11px] text-[var(--text-muted)] tracking-[0.12em] uppercase mb-5">
          Mise en page
        </h3>
        
        <div className="flex bg-[var(--bg-medical-pearl)] p-1 rounded-xl mb-6">
          {(['compact', 'confort', 'etendu'] as Density[]).map(d => (
            <button
              key={d}
              onClick={() => handleDensityClick(d)}
              className={cn(
                "flex-1 py-2 font-medium text-[13px] rounded-lg transition-all capitalize",
                currentDensity === d ? "bg-white text-[var(--text-main)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              )}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-5">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[13px] text-[var(--text-muted)]">Marge supérieure</label>
              <span className="text-[13px] font-medium text-[var(--text-main)]">{profile.margin_top ?? 4.8}cm</span>
            </div>
            <input type="range" min="1" max="8" step="0.1" value={profile.margin_top ?? 4.8} onChange={e => updateProfile({ margin_top: parseFloat(e.target.value) })} className="w-full h-1.5 bg-[var(--border-color)] rounded-full appearance-none outline-none accent-[var(--text-main)]" />
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-[13px] text-[var(--text-muted)]">Taille du logo</label>
              <span className="text-[13px] font-medium text-[var(--text-main)]">{Math.round((profile.header_logo_scale ?? 1.0) * 100)}%</span>
            </div>
            <input type="range" min="0.5" max="2.0" step="0.05" value={profile.header_logo_scale ?? 1.0} onChange={e => updateProfile({ header_logo_scale: parseFloat(e.target.value) })} className="w-full h-1.5 bg-[var(--border-color)] rounded-full appearance-none outline-none accent-[var(--text-main)]" />
          </div>
        </div>

        <button 
          onClick={toggleAdvanced}
          className="mt-5 flex items-center gap-2 text-[13px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
        >
          Réglages avancés {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {advancedOpen && (
          <div className="mt-5 pt-5 border-t border-[var(--border-color)] flex flex-col gap-5">
            <div>
              <div className="flex justify-between mb-2"><label className="text-[13px] text-[var(--text-muted)]">Police en-tête</label></div>
              <input type="range" min="0.5" max="2.0" step="0.05" value={profile.header_font_scale ?? 1.0} onChange={e => updateProfile({ header_font_scale: parseFloat(e.target.value) })} className="w-full h-1.5 bg-[var(--border-color)] rounded-full appearance-none outline-none accent-[var(--text-main)]" />
            </div>
            <div>
              <div className="flex justify-between mb-2"><label className="text-[13px] text-[var(--text-muted)]">Interligne en-tête</label></div>
              <input type="range" min="0.5" max="2.0" step="0.05" value={profile.header_line_height ?? 1.0} onChange={e => updateProfile({ header_line_height: parseFloat(e.target.value) })} className="w-full h-1.5 bg-[var(--border-color)] rounded-full appearance-none outline-none accent-[var(--text-main)]" />
            </div>
            <div>
              <div className="flex justify-between mb-2"><label className="text-[13px] text-[var(--text-muted)]">Marge inférieure</label></div>
              <input type="range" min="1" max="6" step="0.1" value={profile.margin_bottom ?? 3.2} onChange={e => updateProfile({ margin_bottom: parseFloat(e.target.value) })} className="w-full h-1.5 bg-[var(--border-color)] rounded-full appearance-none outline-none accent-[var(--text-main)]" />
            </div>
            <div>
              <div className="flex justify-between mb-2"><label className="text-[13px] text-[var(--text-muted)]">Police pied de page</label></div>
              <input type="range" min="0.5" max="2.0" step="0.05" value={profile.footer_font_scale ?? 1.0} onChange={e => updateProfile({ footer_font_scale: parseFloat(e.target.value) })} className="w-full h-1.5 bg-[var(--border-color)] rounded-full appearance-none outline-none accent-[var(--text-main)]" />
            </div>
            <div>
              <div className="flex justify-between mb-2"><label className="text-[13px] text-[var(--text-muted)]">Interligne pied de page</label></div>
              <input type="range" min="0.5" max="2.0" step="0.05" value={profile.footer_line_height ?? 1.0} onChange={e => updateProfile({ footer_line_height: parseFloat(e.target.value) })} className="w-full h-1.5 bg-[var(--border-color)] rounded-full appearance-none outline-none accent-[var(--text-main)]" />
            </div>
            <div>
              <div className="flex justify-between mb-2"><label className="text-[13px] text-[var(--text-muted)]">Taille QR Code</label></div>
              <input type="range" min="0.5" max="2.0" step="0.05" value={profile.footer_qr_scale ?? 1.0} onChange={e => updateProfile({ footer_qr_scale: parseFloat(e.target.value) })} className="w-full h-1.5 bg-[var(--border-color)] rounded-full appearance-none outline-none accent-[var(--text-main)]" />
            </div>
          </div>
        )}
      </div>

      {/* 5. FOND DE PAGE (LETTERHEAD) */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-6 transition-shadow hover:shadow-[0_8px_24px_-16px_rgba(11,15,23,0.18)] hover:-translate-y-[2px]">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-[11px] text-[var(--text-muted)] tracking-[0.12em] uppercase">
            Fond de Page (Template Image)
          </h3>
          <button 
            onClick={() => updateProfile({ use_letterhead: !profile.use_letterhead })} 
            className={cn("w-10 h-5 rounded-full relative px-0.5 flex items-center transition-colors", profile.use_letterhead ? "bg-[var(--primary)]" : "bg-[var(--border-color)]")}
          >
            <div className={cn("w-4 h-4 bg-white rounded-full transition-transform", profile.use_letterhead ? "translate-x-5" : "translate-x-0")} />
          </button>
        </div>
        
        {profile.use_letterhead && (
          <div className="flex items-center gap-3">
            <input 
              type="file" 
              accept="image/*" 
              id="letterhead-upload" 
              className="hidden" 
              onChange={handleFileUpload} 
              disabled={isUploadingLocal}
            />
            <label 
              htmlFor="letterhead-upload"
              className={cn(
                "flex items-center justify-center gap-2 flex-1 p-3 rounded-xl border border-dashed text-[13px] font-medium transition-all cursor-pointer",
                isUploadingLocal ? "opacity-50 cursor-not-allowed" : "hover:border-[var(--primary)] hover:text-[var(--primary)] text-[var(--text-muted)]"
              )}
            >
              <Upload size={16} />
              {isUploadingLocal ? "Envoi..." : "Uploader un fond (A5)"}
            </label>
          </div>
        )}
      </div>

      {/* 6. CODE QR */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-6 transition-shadow hover:shadow-[0_8px_24px_-16px_rgba(11,15,23,0.18)] hover:-translate-y-[2px]">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-[11px] text-[var(--text-muted)] tracking-[0.12em] uppercase">
            Code QR
          </h3>
          <button 
            onClick={() => updateProfile({ qr_code_enabled: !profile.qr_code_enabled })} 
            className={cn("w-10 h-5 rounded-full relative px-0.5 flex items-center transition-colors", profile.qr_code_enabled ? "bg-[var(--primary)]" : "bg-[var(--border-color)]")}
          >
            <div className={cn("w-4 h-4 bg-white rounded-full transition-transform", profile.qr_code_enabled ? "translate-x-5" : "translate-x-0")} />
          </button>
        </div>

        {profile.qr_code_enabled && (
          <div className="grid grid-cols-2 gap-3">
            {QR_TYPES.map(t => {
              const isSelected = profile.qr_code_type === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => updateProfile({ qr_code_type: t.id })}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all text-[11px] font-medium",
                    isSelected ? "border-[var(--text-main)] bg-[var(--bg-medical-pearl)] text-[var(--text-main)]" : "border-[var(--border-color)] hover:border-[var(--text-muted)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {profile.qr_code_enabled && ['WEBSITE', 'WHATSAPP', 'INSTAGRAM'].includes(profile.qr_code_type) && (
          <div className="mt-5 flex flex-col gap-4">
             <div>
               <label className="block text-[11px] text-[var(--text-muted)] mb-1">Lien / Numéro / Identifiant</label>
               <input 
                 type="text" 
                 value={profile.qr_code_value || ''}
                 onChange={e => updateProfile({ qr_code_value: e.target.value })}
                 className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-main)] outline-none focus:border-[var(--text-main)]"
                 placeholder="Ex: https://..."
               />
             </div>
             <div>
               <label className="block text-[11px] text-[var(--text-muted)] mb-1">Texte sous le QR Code</label>
               <input 
                 type="text" 
                 value={profile.qr_code_label || ''}
                 onChange={e => updateProfile({ qr_code_label: e.target.value })}
                 className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-main)] outline-none focus:border-[var(--text-main)]"
                 placeholder="Ex: Prenez RDV"
               />
             </div>
          </div>
        )}
      </div>

    </div>
  );
};
