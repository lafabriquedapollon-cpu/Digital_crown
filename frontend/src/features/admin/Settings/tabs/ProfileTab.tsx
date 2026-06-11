import React, { useState, useCallback } from 'react';
import {
  UserCircle,
  Stethoscope,
  Palette as PaletteIcon,
  ImageIcon,
  Upload,
  Trash2,
  Smartphone,
  Phone,
  MessageCircle,
  Instagram,
  Settings2,
  CheckCircle2,
  Users,
  Save,
  Loader2
} from 'lucide-react';
import { useSettingsStore } from '../hooks/useSettingsStore';
import { SettingsSection, inputClass, labelClass } from '../components/SharedUI';
import { ArabicKeyboard } from '../components/ArabicKeyboard';
import { SPECIALTIES_DICT } from '../../constants';
import { cn } from '../../../../utils/cn';
import { API_BASE } from '../../../../services/api';

const DebouncedInput = ({ name, value, onChange, className, placeholder, onFocus, type = "text" }: any) => {
  const [localVal, setLocalVal] = React.useState(value);
  React.useEffect(() => { setLocalVal(value); }, [value]);
  return (
    <input 
      type={type}
      name={name}
      value={localVal || ''}
      onChange={e => setLocalVal(e.target.value)}
      onBlur={e => {
        if (localVal !== value) onChange({ target: { name, value: localVal } } as any);
      }}
      className={className}
      placeholder={placeholder}
      onFocus={onFocus}
    />
  );
};

export const ProfileTab: React.FC = () => {
  const {
    profile,
    contacts,
    updateProfile,
    saveProfile,
    toggleContact,
    updateContactValue,
    uploadLogo,
    deleteLogo
  } = useSettingsStore();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // saveProfile shows its own toast
    } finally {
      setSaving(false);
    }
  }, [saveProfile]);
  
  const [showArKeyboard, setShowArKeyboard] = useState<{type: 'header' | 'name' | 'custom_spec', idx?: number} | null>(null);

  const getImageUrl = (path: string | null | undefined) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const cleanPath = path.replace(/^\/+/, '');
    if (cleanPath.startsWith('api/static/') || cleanPath.startsWith('static/uploads/')) {
      return `${API_BASE}/${cleanPath}`;
    }
    return `${API_BASE}/static/uploads/${cleanPath}`;
  };

  const generateHeaders = (nom: string, nomAr: string, specialtyIds: string[], customFr: string, customAr: string) => {
    const linesFr = [];
    const linesAr = [];

    const safeNom = nom || '';
    const safeNomAr = nomAr || '';
    const cleanNom = safeNom.startsWith('Dr.') ? safeNom : `Dr. ${safeNom}`;
    const cleanNomAr = safeNomAr.endsWith(' .د') ? safeNomAr : `${safeNomAr} .د`;
    linesFr.push(cleanNom);
    linesAr.push(cleanNomAr);

    linesFr.push("Chirurgien Dentiste");
    linesAr.push("طبيب جراح للأسنان");

    const selected = SPECIALTIES_DICT.filter(s => specialtyIds.includes(s.id));
    const allFr = selected.map(s => s.fr);
    const allAr = selected.map(s => s.ar);
    if (customFr) allFr.push(customFr);
    if (customAr) allAr.push(customAr);

    for (let i = 0; i < allFr.length; i += 2) {
      const pair = allFr.slice(i, i + 2);
      linesFr.push(pair.join(' - '));
    }
    for (let i = 0; i < allAr.length; i += 2) {
      const pair = allAr.slice(i, i + 2);
      linesAr.push(pair.reverse().join(' - '));
    }

    return { header_lines_fr: linesFr, header_lines_ar: linesAr };
  };

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const newProfile = { ...profile, [name]: value };
    
    if ((name === 'nom' || name === 'nom_praticien_ar' || name === 'custom_specialty_fr' || name === 'custom_specialty_ar') && !profile.header_customized) {
      const { header_lines_fr, header_lines_ar } = generateHeaders(newProfile.nom, newProfile.nom_praticien_ar || '', newProfile.specialty_ids || [], newProfile.custom_specialty_fr || '', newProfile.custom_specialty_ar || '');
      updateProfile({ [name]: value, header_lines_fr, header_lines_ar });
    } else {
      updateProfile({ [name]: value });
    }
  };

  const toggleSpecialty = (id: string) => {
    const current = profile.specialty_ids || [];
    const updated = current.includes(id) 
      ? current.filter(sid => sid !== id) 
      : [...current, id];
    
    if (!profile.header_customized) {
      const { header_lines_fr, header_lines_ar } = generateHeaders(profile.nom, profile.nom_praticien_ar || '', updated, profile.custom_specialty_fr || '', profile.custom_specialty_ar || '');
      updateProfile({ specialty_ids: updated, header_lines_fr, header_lines_ar });
    } else {
      updateProfile({ specialty_ids: updated });
    }
  };

  const loadBenmoussaTemplate = () => {
    updateProfile({
      header_lines_fr: [
        "Dr. Benmoussa Achraf",
        "Chirurgien Dentiste",
        "Soins - Prothèse",
        "Chirurgie - Parodontologie",
        "Blanchiment - Orthodontie"
      ],
      header_lines_ar: [
        "د. أشرف بنموسى",
        "طبيب جراح للأسنان",
        "علاج - تعويض الأسنان",
        "جراحة - أمراض اللثة",
        "تبييض - تقويم الأسنان"
      ]
    });
  };

  return (
    <div className="space-y-12">
      <SettingsSection 
        title="Identité Officielle" 
        subtitle="Ces informations apparaîtront sur vos bilans PDF."
        icon={<UserCircle size={32} />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="md:col-span-2">
            <label className={labelClass}>Type de Structure</label>
            <div className="flex gap-4 mt-2 mb-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="cabinet_type" 
                  value="PRIVE" 
                  checked={profile.cabinet_type === 'PRIVE' || !profile.cabinet_type} 
                  onChange={handleProfileChange} 
                  className="w-4 h-4 text-primary border-slate-300 focus:ring-primary"
                />
                <span className="text-sm font-bold text-slate-700">Cabinet Privé</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="cabinet_type" 
                  value="CLINIQUE" 
                  checked={profile.cabinet_type === 'CLINIQUE'} 
                  onChange={handleProfileChange} 
                  className="w-4 h-4 text-primary border-slate-300 focus:ring-primary"
                />
                <span className="text-sm font-bold text-slate-700">Clinique</span>
              </label>
            </div>
            
            <label className={labelClass}>Nom de la structure (Cabinet / Clinique)</label>
            <DebouncedInput 
              name="nom_cabinet" 
              value={profile.nom_cabinet || ''} 
              onChange={handleProfileChange} 
              className={inputClass} 
              placeholder="Ex: Cabinet Dentaire Benmoussa" 
            />
          </div>
          <div>
            <label className={labelClass}>Nom du Docteur (Français)</label>
            <DebouncedInput 
              name="nom" 
              value={profile.nom} 
              onChange={handleProfileChange} 
              className={inputClass} 
              placeholder="Ex: Benmoussa Achraf" 
            />
            <p className="text-[9px] text-slate-400 mt-2 font-medium italic">Le titre "Dr." sera ajouté automatiquement sur les documents.</p>
          </div>
          <div dir="rtl">
            <label className={labelClass + " text-right"}>اسم الطبيب (بالعربية)</label>
            <div className="relative">
              <DebouncedInput 
                name="nom_praticien_ar" 
                value={profile.nom_praticien_ar} 
                onChange={handleProfileChange} 
                className={inputClass + " text-right font-amiri text-lg"} 
                placeholder="مثال: بنموسى أشرف" 
                onFocus={() => setShowArKeyboard({type: 'name'})}
              />
              {showArKeyboard?.type === 'name' && (
                <div className="absolute top-full right-0 mt-2 z-50">
                  <div className="fixed inset-0" onClick={() => setShowArKeyboard(null)} />
                  <ArabicKeyboard onInput={(char) => {
                    const newVal = (profile.nom_praticien_ar || '') + char;
                    if (!profile.header_customized) {
                      const { header_lines_fr, header_lines_ar } = generateHeaders(profile.nom, newVal, profile.specialty_ids || [], '', '');
                      updateProfile({ nom_praticien_ar: newVal, header_lines_fr, header_lines_ar });
                    } else {
                      updateProfile({ nom_praticien_ar: newVal });
                    }
                  }} />
                </div>
              )}
            </div>
            <p className="text-[9px] text-slate-400 mt-2 font-medium italic text-right">سيتم إضافة لقب ".د" تلقائياً.</p>
          </div>

          <div className="md:col-span-2 bg-primary/5 p-4 rounded-2xl border border-primary/10 flex items-center gap-4">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm">
              <Stethoscope size={20} />
            </div>
            <div>
              <p className="text-xs font-black text-primary uppercase tracking-wider">Titre Professionnel</p>
              <p className="text-sm font-bold text-slate-700">Chirurgien Dentiste / طبيب جراح للأسنان</p>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Expertises & Spécialités Cliniques</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
              {SPECIALTIES_DICT.map(spec => {
                const isSelected = profile.specialty_ids?.includes(spec.id);
                return (
                  <button
                    key={spec.id}
                    onClick={() => toggleSpecialty(spec.id)}
                    className={cn(
                      "flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all group relative overflow-hidden",
                      isSelected 
                        ? "border-primary bg-primary/5 shadow-md scale-[1.02]" 
                        : "border-slate-100 bg-white hover:border-slate-200"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                      isSelected ? "bg-primary text-white shadow-lg" : "bg-slate-50 text-slate-400 group-hover:scale-110"
                    )}>
                      <spec.icon size={20} />
                    </div>
                    <div className="text-center">
                      <span className={cn("block text-xs font-black", isSelected ? "text-primary" : "text-slate-600")}>{spec.fr}</span>
                      <span className={cn("block text-[10px] font-bold font-amiri", isSelected ? "text-primary/70" : "text-slate-400")}>{spec.ar}</span>
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 size={12} className="text-primary" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            
            <div className="mt-6 p-5 bg-slate-50/80 rounded-2xl border border-slate-100">
              <label className="text-xs font-bold text-slate-700 mb-3 block">Spécialité personnalisée (Optionnelle)</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input 
                  type="text" 
                  name="custom_specialty_fr" 
                  value={profile.custom_specialty_fr || ''} 
                  onChange={handleProfileChange} 
                  className={inputClass} 
                  placeholder="Ex: Implantologie exclusive" 
                />
                <div className="relative" dir="rtl">
                  <input 
                    type="text" 
                    name="custom_specialty_ar" 
                    value={profile.custom_specialty_ar || ''} 
                    onChange={handleProfileChange} 
                    className={inputClass + " text-right font-amiri text-lg"} 
                    placeholder="مثال: زراعة الأسنان" 
                    onFocus={() => setShowArKeyboard({type: 'custom_spec'})}
                  />
                  {showArKeyboard?.type === 'custom_spec' && (
                    <div className="absolute top-full right-0 mt-2 z-50">
                      <div className="fixed inset-0" onClick={() => setShowArKeyboard(null)} />
                      <ArabicKeyboard onInput={(char) => {
                        const currentVal = useSettingsStore.getState().profile.custom_specialty_ar || '';
                        const newVal = currentVal + char;
                        handleProfileChange({ target: { name: 'custom_specialty_ar', value: newVal } } as any);
                      }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Adresse complète du Cabinet</label>
            <input type="text" name="adresse" value={profile.adresse} onChange={handleProfileChange} className={inputClass} />
          </div>

          <div className="md:col-span-2 bg-amber-50 p-6 rounded-3xl border border-amber-100">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-amber-600 shadow-sm">
                <PaletteIcon size={20} />
              </div>
              <h4 className="font-black text-amber-900">Logo du Cabinet</h4>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <div 
                className="w-32 h-32 rounded-3xl bg-white border-2 border-dashed border-amber-200 flex items-center justify-center cursor-pointer hover:bg-amber-100/50 transition-all relative group overflow-hidden"
                onClick={() => document.getElementById('logo-input')?.click()}
              >
                {profile.logo_path ? (
                  <>
                    <img 
                      src={getImageUrl(profile.logo_path)} 
                      alt="Logo" 
                      className="w-full h-full object-contain p-4" 
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Upload className="text-white" size={24} />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <ImageIcon className="text-amber-200" size={32} />
                    <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Choisir Logo</span>
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-xs font-bold text-amber-800">Conseil Elite :</p>
                <h5 className="text-sm font-bold text-amber-900 mb-2">Logo Premium (IA)</h5>
                <p className="text-xs text-amber-700/80 leading-relaxed">
                  Importez n'importe quel logo (JPEG/PNG). Notre IA se chargera de <strong>détourer le fond automatiquement</strong>, de le normaliser et de le convertir en format vectoriel (SVG) pour une intégration parfaite sur tous vos documents.
                </p>
                <input id="logo-input" type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                {profile.logo_path && (
                  <button 
                    onClick={deleteLogo}
                    className="mt-4 text-[10px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-2 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 size={12} /> Supprimer le logo
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Numéro INPE</label>
            <input type="text" name="inpe" value={profile.inpe} onChange={handleProfileChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>ICE / IF</label>
            <div className="grid grid-cols-2 gap-4">
               <input type="text" name="ice" value={profile.ice || ''} onChange={handleProfileChange} className={inputClass} placeholder="ICE" />
               <input type="text" name="if" value={profile.if || ''} onChange={handleProfileChange} className={inputClass} placeholder="IF" />
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection 
        title="En-tête Bilingue" 
        subtitle="Configurez vos lignes d'en-tête personnalisées."
        icon={<Users size={20} />}
      >
        <div className="flex justify-end mb-4">
          <button 
            onClick={loadBenmoussaTemplate}
            className="px-4 py-2 bg-primary/5 border border-primary/20 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/10 transition-all flex items-center gap-2"
          >
            <Settings2 size={14} /> Modèle par défaut
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <label className={labelClass}>Français</label>
            <div className="space-y-2">
              {(profile.header_lines_fr || []).map((line, idx) => (
                <div key={`fr-${idx}`} className="flex gap-2">
                  <input 
                    className={cn(inputClass, "py-2 px-3", idx === 0 && "text-primary text-base")} 
                    value={line} 
                    onChange={(e) => {
                      const newLines = [...(profile.header_lines_fr || [])];
                      newLines[idx] = e.target.value;
                      updateProfile({ header_lines_fr: newLines, header_customized: true });
                    }}
                  />
                  <button 
                    onClick={() => updateProfile({ header_lines_fr: profile.header_lines_fr?.filter((_, i) => i !== idx), header_customized: true })}
                    className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                  >×</button>
                </div>
              ))}
              <button onClick={() => updateProfile({ header_lines_fr: [...(profile.header_lines_fr || []), ""], header_customized: true })} className="w-full py-2 border-2 border-dashed border-slate-200 text-slate-400 font-bold text-xs rounded-xl hover:bg-slate-50 transition-all">+ Ligne FR</button>
            </div>
          </div>

          <div className="space-y-4">
            <label className={cn(labelClass, "text-right")}>Arabe</label>
            <div className="space-y-2">
              {(profile.header_lines_ar || []).map((line, idx) => (
                <div key={`ar-${idx}`} className="flex gap-2 relative group">
                  <button onClick={() => updateProfile({ header_lines_ar: profile.header_lines_ar?.filter((_, i) => i !== idx), header_customized: true })} className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors">×</button>
                  <div className="flex-1 relative">
                    <input 
                      className={cn(inputClass, "py-2 px-3 text-right font-arabic", idx === 0 && "text-primary text-base")} 
                      dir="rtl"
                      value={line} 
                      onFocus={() => setShowArKeyboard({type: 'header', idx})}
                      onChange={(e) => {
                        const newLines = [...(profile.header_lines_ar || [])];
                        newLines[idx] = e.target.value;
                        updateProfile({ header_lines_ar: newLines, header_customized: true });
                      }}
                    />
                    {showArKeyboard?.type === 'header' && showArKeyboard.idx === idx && (
                      <div className="absolute top-full right-0 mt-2 z-50">
                        <div className="fixed inset-0" onClick={() => setShowArKeyboard(null)} />
                        <ArabicKeyboard onInput={(char) => {
                          const newLines = [...(profile.header_lines_ar || [])];
                          newLines[idx] = (newLines[idx] || '') + char;
                          updateProfile({ header_lines_ar: newLines });
                        }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={() => updateProfile({ header_lines_ar: [...(profile.header_lines_ar || []), ""], header_customized: true })} className="w-full py-2 border-2 border-dashed border-slate-200 text-slate-400 font-bold text-xs rounded-xl hover:bg-slate-50 transition-all">+ Ligne AR</button>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection 
        title="Contacts & Visibilité" 
        subtitle="Gérez vos numéros de contact en pied de page."
        icon={<Smartphone size={20} />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.keys(contacts).map((type) => {
            const c = contacts[type];
            const Icon = type === 'fixe' ? Phone : type === 'mobile' ? Smartphone : type === 'whatsapp' ? MessageCircle : Instagram;
            const label = type === 'fixe' ? 'Tél. Fixe' : type === 'mobile' ? 'Tél. Mobile' : type === 'whatsapp' ? 'WhatsApp' : 'Instagram';

            return (
              <div key={type} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon size={16} className="text-primary" style={{ color: 'var(--primary)' }} />
                    <span className="text-xs font-black uppercase text-slate-400 tracking-wider">{label}</span>
                  </div>
                  <button 
                    onClick={() => toggleContact(type)}
                    className={cn("w-10 h-5 rounded-full transition-all relative flex items-center px-1", c.enabled ? "bg-emerald-500" : "bg-slate-200")}
                  >
                    <div className={cn("w-3 h-3 bg-white rounded-full transition-all", c.enabled ? "translate-x-5" : "translate-x-0")} />
                  </button>
                </div>
                <input 
                  type="text" 
                  value={c.value} 
                  onChange={(e) => updateContactValue(type, e.target.value)}
                  disabled={!c.enabled}
                  className={cn(inputClass, "py-2 px-3", !c.enabled && "opacity-50 grayscale cursor-not-allowed")}
                  style={{ borderColor: c.enabled ? 'var(--primary)' : undefined }}
                />
              </div>
            );
          })}
        </div>
      </SettingsSection>

      {/* BOUTON SAUVEGARDER */}
      <div className="sticky bottom-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-8 py-3 bg-primary text-white rounded-2xl font-black text-sm shadow-xl shadow-primary/30 hover:bg-primary/90 transition-all disabled:opacity-60"
          style={{ backgroundColor: 'var(--primary)' }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Enregistrement...' : saved ? '✓ Enregistré !' : 'Mettre à jour le profil'}
        </button>
      </div>
    </div>
  );
};
