import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, ArrowRight, ArrowLeft, Check, CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cabinetApi } from '../../../services/templateApi';
import { cn } from '../../../utils/cn';
import {
  SPECIALTIES_DICT, STEPS, CROWN_MESSAGES, BRAND_IDENTITIES,
} from '../constants';
import type {
  IdentityState, HeaderOption, TemplateOption, ContactConfig,
} from '../types';
import { LiveDocumentStudio } from '../components/LiveDocumentStudio';
import { CrownGuide } from '../components/CrownGuide';
import { ArabicKeyboard } from '../components/ArabicKeyboard';

import { Step1Identity } from './steps/Step1Identity';
import { Step2Specialties } from './steps/Step2Specialties';
import { Step3Contacts } from './steps/Step3Contacts';
import { StepQR } from './steps/StepQR';
import { Step5Design } from './steps/Step5Design';
import { Step6Theme } from './steps/Step6Theme';
import { Step7Confirmation } from './steps/Step7Confirmation';
import { useSetupStore } from './store/useSetupStore';

export const SetupWizard: React.FC = () => {
  const navigate = useNavigate();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const letterheadInputRef = useRef<HTMLInputElement>(null);

  const {
    currentStep, setCurrentStep,
    cabinetType, setCabinetType,
    identity, setIdentity,
    selectedSpecialties, setSelectedSpecialties,
    customSpecialty, setCustomSpecialty,
    contacts, setContacts,
    headerOption, setHeaderOption,
    selectedTemplate, setSelectedTemplate,
    selectedTheme, setSelectedThemeAndPersist,
    selectedIdentity, setSelectedIdentity,
    selectedFont, setSelectedFont,
    margins, setMargins,
    headerScale, setHeaderScale,
    headerFontScale, setHeaderFontScale,
    headerLogoScale, setHeaderLogoScale,
    headerLineHeight, setHeaderLineHeight,
    footerFontScale, setFooterFontScale,
    footerQrScale, setFooterQrScale,
    footerLineHeight, setFooterLineHeight,
    qrConfig, setQrConfig,
    reset
  } = useSetupStore();

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [showArKeyboard, setShowArKeyboard] = useState<{ show: boolean; target: 'identity' | 'custom_spec' }>({ show: false, target: 'identity' });

  // Files and UI state (not persisted)
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [letterheadFile, setLetterheadFile] = useState<File | null>(null);
  const [letterheadPreview, setLetterheadPreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  // Confirmation modal for card-import overwrite
  const [confirmOverwriteFile, setConfirmOverwriteFile] = useState<File | null>(null);

  useEffect(() => {
    const brandIdentity = BRAND_IDENTITIES.find(i => i.id === selectedIdentity) || BRAND_IDENTITIES[0];
    const root = document.documentElement;
    root.dataset.theme = selectedTheme === 'elite' ? '' : selectedTheme;
    localStorage.setItem('digitalcrown_theme', selectedTheme);
    root.style.setProperty('--primary', brandIdentity.primary);
    root.style.setProperty('--secondary', brandIdentity.secondary);
    root.style.setProperty('--accent', brandIdentity.accent);
  }, [selectedTheme, selectedIdentity]);

  const doExtraction = async (file: File) => {
    setIsExtracting(true);
    try {
      const data = await cabinetApi.extractCard(file);
      if (data && !data.error) {
        setIdentity(prev => ({
          ...prev,
          nomCabinet: data.nom_cabinet || prev.nomCabinet,
          nomPraticien: data.nom_praticien || prev.nomPraticien,
          nomPraticienAR: data.nom_praticien_ar || prev.nomPraticienAR,
          adresse: data.adresse || prev.adresse,
        }));
        if (data.specialites && Array.isArray(data.specialites)) {
          const matched = SPECIALTIES_DICT.filter(s =>
            data.specialites?.some((ext: string) => ext.toLowerCase().includes(s.fr.toLowerCase()))
          ).map(s => s.id);
          if (matched.length > 0) setSelectedSpecialties(prev => Array.from(new Set([...prev, ...matched])));
        }
      }
    } catch {
      toast.error("Erreur lors de l'extraction de la carte.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleCardImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const hasExistingData = identity.nomCabinet || identity.nomPraticien;
    if (hasExistingData) {
      setConfirmOverwriteFile(file);
    } else {
      doExtraction(file);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.size <= 2 * 1024 * 1024) {
      setLogoFile(file);
      const r = new FileReader();
      r.onloadend = () => setLogoPreview(r.result as string);
      r.readAsDataURL(file);
    }
  };

  const handleLetterheadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.size <= 5 * 1024 * 1024) {
      setLetterheadFile(file);
      const r = new FileReader();
      r.onloadend = () => setLetterheadPreview(r.result as string);
      r.readAsDataURL(file);
    }
  };

  const validateStep = (step: number) => {
    const errs: Record<string, string> = {};
    if (step === 1) {
      if (!identity.nomCabinet) errs.nomCabinet = "Requis";
      if (!identity.nomPraticien) errs.nomPraticien = "Requis";
      if (!identity.adresse) errs.adresse = "Requis";
    }
    if (step === 2 && selectedSpecialties.length === 0) errs.specialties = "Choisissez au moins une spécialité";
    if (step === 3 && !Object.values(contacts).some(c => c.enabled && c.value.trim())) errs.contacts = "Renseignez au moins un contact";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (currentStep === 3 && !Object.values(contacts).some(c => c.enabled && c.value.trim())) {
      setErrors({ contacts: "Activez et renseignez au moins un contact" });
      return;
    }
    if (validateStep(currentStep)) setCurrentStep(prev => Math.min(prev + 1, 7));
  };

  const handleBack = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const specialtyStrings = useMemo(() => {
    const frArr: string[] = [];
    const arArr: string[] = [];
    selectedSpecialties.forEach(id => {
      const s = SPECIALTIES_DICT.find(x => x.id === id);
      if (s) { frArr.push(s.fr); arArr.push(s.ar); }
    });
    if (customSpecialty.fr) frArr.push(customSpecialty.fr);
    if (customSpecialty.ar) arArr.push(customSpecialty.ar);
    return { fr: frArr.join(' - '), ar: arArr.join(' - ') };
  }, [selectedSpecialties, customSpecialty]);

  const contactString = useMemo(() => {
    return (Object.keys(contacts) as Array<keyof ContactConfig>)
      .filter(type => contacts[type].enabled && contacts[type].value.trim())
      .map(type => {
        const icon = type === 'fixe' ? '📞' : type === 'mobile' ? '📱' : type === 'whatsapp' ? '💬' : '📸';
        return `${icon} ${contacts[type].value.trim()}`;
      })
      .join(' | ');
  }, [contacts]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const sanitizedMargins = { top: Math.max(1, Math.min(8, margins.top)), bottom: Math.max(1, Math.min(6, margins.bottom)) };
      const identityData = BRAND_IDENTITIES.find(i => i.id === selectedIdentity) || BRAND_IDENTITIES[0];
      const payload = {
        nom_cabinet: identity.nomCabinet,
        header_lines_fr: [identity.nomPraticien, 'Chirurgien Dentiste', specialtyStrings.fr],
        header_lines_ar: [identity.nomPraticienAR, 'طبيب جراح للأسنان', specialtyStrings.ar],
        footer_address: identity.adresse,
        footer_phones: contactString,
        ice: identity.ice,
        if_: identity.if,
        inpe: identity.inpe,
        cabinet_type: cabinetType,
        specialty_ids: selectedSpecialties,
        custom_specialty_fr: customSpecialty.fr,
        custom_specialty_ar: customSpecialty.ar,
        selected_theme: selectedTheme,
        selected_template: selectedTemplate,
        selected_font: selectedFont,
        primary_color: identityData.primary,
        secondary_color: identityData.secondary,
        accent_color: identityData.accent,
        watermark_enabled: headerOption === 'auto',
        contacts_json: contacts,
        qr_code_enabled: qrConfig.enabled,
        qr_code_type: qrConfig.type,
        qr_code_value: qrConfig.value,
        qr_code_label: qrConfig.label,
        qr_code_color: qrConfig.color || identityData.primary,
        qr_code_style: qrConfig.style,
        margin_top: sanitizedMargins.top,
        margin_bottom: sanitizedMargins.bottom,
        header_scale: headerScale,
        header_font_scale: headerFontScale,
        header_logo_scale: headerLogoScale,
        header_line_height: headerLineHeight,
        footer_font_scale: footerFontScale,
        footer_qr_scale: footerQrScale,
        footer_line_height: footerLineHeight,
      };

      await cabinetApi.create(payload as any);
      if (logoFile) await cabinetApi.uploadLogo(logoFile);
      if (headerOption === 'letterhead' && letterheadFile) {
        await cabinetApi.uploadLetterhead(letterheadFile, sanitizedMargins.top, sanitizedMargins.bottom);
      }
      reset();
      navigate('/dashboard');
    } catch {
      setErrors({ submit: "Échec de l'initialisation. Réessayez." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-outfit text-text-main selection:bg-primary/20 transition-colors duration-500">
      <header className="bg-card/80 backdrop-blur-xl border-b border-border-main sticky top-0 z-[100] transition-colors duration-500">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20"><Building2 className="text-white" size={20} /></div>
            <div><h1 className="font-black text-text-main tracking-tight text-lg uppercase">Digital <span className="text-primary">Crown</span></h1><p className="text-[9px] font-black text-text-muted uppercase tracking-widest leading-none mt-0.5">Setup Wizard v4.0</p></div>
          </div>
          <button onClick={() => navigate('/welcome')} className="text-[10px] font-black text-text-muted hover:text-primary transition-all uppercase tracking-widest flex items-center gap-2"><ArrowLeft size={14} /> Quitter</button>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-8 py-10">
        <div className="flex items-center gap-4 mb-20 max-w-4xl mx-auto">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className="flex flex-col items-center relative group">
                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500", s.id === currentStep ? "bg-primary text-white scale-110 shadow-xl shadow-primary/30" : s.id < currentStep ? "bg-emerald-500 text-white" : "bg-card text-text-muted border border-border-main")}>
                  {s.id < currentStep ? <Check size={20} /> : <s.icon size={20} />}
                </div>
                <span className={cn("absolute -bottom-8 text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap", s.id === currentStep ? "text-primary translate-y-2 opacity-100" : "text-text-muted opacity-60")}>{s.title}</span>
              </div>
              {i < STEPS.length - 1 && <div className={cn("flex-1 h-0.5 rounded-full transition-all duration-1000", s.id < currentStep ? "bg-emerald-500" : "bg-border-main")} />}
            </React.Fragment>
          ))}
        </div>

        <div className={cn("grid grid-cols-1 gap-12 items-start transition-all duration-500", (currentStep >= 3 && currentStep <= 7) ? "lg:grid-cols-12" : "max-w-2xl mx-auto")}>
          <div className={cn("bg-card rounded-[2.5rem] border border-border-main shadow-2xl shadow-primary/5 p-12 relative overflow-hidden transition-all duration-500", (currentStep >= 3 && currentStep <= 7) ? "lg:col-span-7" : "")}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[4rem] pointer-events-none" />

            {currentStep === 1 && <Step1Identity cabinetType={cabinetType} setCabinetType={setCabinetType} identity={identity} setIdentity={setIdentity} errors={errors} setShowArKeyboard={setShowArKeyboard} />}
            {currentStep === 2 && <Step2Specialties handleCardImport={handleCardImport} isExtracting={isExtracting} selectedSpecialties={selectedSpecialties} setSelectedSpecialties={setSelectedSpecialties} customSpecialty={customSpecialty} setCustomSpecialty={setCustomSpecialty} showCustomModal={showCustomModal} setShowCustomModal={setShowCustomModal} errors={errors} setShowArKeyboard={setShowArKeyboard} />}
            {currentStep === 3 && <Step3Contacts contacts={contacts} setContacts={setContacts} identity={identity} setIdentity={setIdentity} errors={errors} />}
            {currentStep === 4 && <StepQR qrConfig={qrConfig} setQrConfig={setQrConfig} />}
            {currentStep === 5 && <Step5Design headerOption={headerOption} setHeaderOption={setHeaderOption} selectedIdentity={selectedIdentity} setSelectedIdentity={setSelectedIdentity} selectedFont={selectedFont} setSelectedFont={setSelectedFont} selectedTemplate={selectedTemplate} setSelectedTemplate={setSelectedTemplate} logoPreview={logoPreview} letterheadPreview={letterheadPreview} logoInputRef={logoInputRef} letterheadInputRef={letterheadInputRef} handleLogoChange={handleLogoChange} handleLetterheadChange={handleLetterheadChange} margins={margins} setMargins={setMargins} headerScale={headerScale} setHeaderScale={setHeaderScale} advanced={{ headerFontScale, setHeaderFontScale, headerLogoScale, setHeaderLogoScale, headerLineHeight, setHeaderLineHeight, footerFontScale, setFooterFontScale, footerQrScale, setFooterQrScale, footerLineHeight, setFooterLineHeight }} />}
            {currentStep === 6 && <Step6Theme selectedTheme={selectedTheme} setSelectedThemeAndPersist={setSelectedThemeAndPersist} />}
            {currentStep === 7 && <Step7Confirmation identity={identity} specialtyStrings={specialtyStrings} contactString={contactString} selectedFont={selectedFont} selectedIdentity={selectedIdentity} selectedTheme={selectedTheme} qrConfig={qrConfig} errors={errors} />}

            <div className="mt-16 pt-10 border-t border-border-main flex items-center justify-between">
              <button onClick={handleBack} disabled={currentStep === 1} className={cn("flex items-center gap-2 px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", currentStep === 1 ? "opacity-0 invisible" : "text-text-muted hover:text-primary hover:bg-primary/5")}>
                <ArrowLeft size={16} /> Retour
              </button>
              {currentStep < 7 ? (
                <button onClick={handleNext} className="bg-primary text-white px-10 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.03] active:scale-95 transition-all flex items-center gap-3">
                  Continuer <ArrowRight size={18} />
                </button>
              ) : (
                <button onClick={handleSubmit} disabled={loading} className={cn("px-10 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center gap-3", loading ? "bg-text-muted/20" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20")}>
                  {loading ? "Chargement..." : <><CheckCircle2 size={18} /> Finaliser l'Installation</>}
                </button>
              )}
            </div>
          </div>

          {(currentStep >= 3 && currentStep <= 7) && (
            <div className="lg:col-span-5 sticky top-28 relative z-[11000] animate-in fade-in slide-in-from-right-12 duration-1000">
              <div className="mb-6 flex items-center justify-between px-4 bg-white/50 backdrop-blur-md p-4 rounded-3xl border border-border-main/40">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Aperçu Live Studio</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      toast.success("Aperçu rafraîchi");
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all"
                  >
                    Actualiser
                  </button>
                  <button 
                    onClick={() => setShowPreview(!showPreview)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 border rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                      showPreview ? "bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white" : "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white"
                    )}
                  >
                    {showPreview ? "Fermer" : "Ouvrir"}
                  </button>
                </div>
              </div>
              
              {showPreview ? (
                <LiveDocumentStudio
                  identity={identity}
                  selectedIdentity={selectedIdentity}
                  selectedTemplate={selectedTemplate}
                  selectedFont={selectedFont}
                  headerOption={headerOption}
                  logoPreview={logoPreview}
                  letterheadPreview={letterheadPreview}
                  margins={margins}
                  cabinetType={cabinetType}
                  specialtyStrings={specialtyStrings}
                  contactString={contactString}
                  qrConfig={qrConfig}
                  headerScale={headerScale}
                />
              ) : (
                <div className="w-full aspect-[1/1.414] bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center text-center p-12">
                   <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4">
                      <Building2 className="text-slate-200" size={32} />
                   </div>
                   <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Aperçu masqué</p>
                   <button onClick={() => setShowPreview(true)} className="mt-4 text-[10px] font-black text-primary underline uppercase tracking-widest">Réactiver l'aperçu</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <CrownGuide message={CROWN_MESSAGES[currentStep]} />

      <ArabicKeyboard
        show={showArKeyboard.show}
        value={showArKeyboard.target === 'identity' ? identity.nomPraticienAR : customSpecialty.ar}
        onChange={(val) => {
          if (showArKeyboard.target === 'identity') {
            setIdentity(prev => ({ ...prev, nomPraticienAR: val }));
          } else {
            setCustomSpecialty(prev => ({ ...prev, ar: val }));
          }
        }}
        onClose={() => setShowArKeyboard(prev => ({ ...prev, show: false }))}
      />

      {/* Overwrite confirmation modal for card import */}
      {confirmOverwriteFile && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full space-y-6 border border-white/20">
            <div>
              <h3 className="text-lg font-black text-slate-900 mb-2">Données existantes détectées</h3>
              <p className="text-sm text-slate-500">Des informations d'identité ont déjà été saisies. Voulez-vous les remplacer par l'extraction IA ?</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmOverwriteFile(null)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-xs font-black hover:bg-slate-50 transition-all">Annuler</button>
              <button
                onClick={() => { const f = confirmOverwriteFile; setConfirmOverwriteFile(null); doExtraction(f); }}
                className="flex-1 py-3 rounded-xl bg-primary text-white text-xs font-black shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
              >
                Remplacer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SetupWizard;
