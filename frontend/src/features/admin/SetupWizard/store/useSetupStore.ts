import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { IdentityState, HeaderOption, TemplateOption, ContactConfig } from '../types';
import { BRAND_IDENTITIES } from '../constants';

interface SetupState {
  currentStep: number;
  cabinetType: 'PRIVE' | 'CLINIQUE';
  identity: IdentityState;
  selectedSpecialties: string[];
  customSpecialty: { fr: string; ar: string };
  contacts: ContactConfig;
  
  headerOption: HeaderOption;
  selectedTemplate: TemplateOption;
  selectedTheme: 'elite' | 'emerald' | 'rose' | 'prestige';
  selectedIdentity: string;
  selectedFont: string;
  
  margins: { top: number; bottom: number };
  headerScale: number;
  headerFontScale: number;
  headerLogoScale: number;
  headerLineHeight: number;
  footerFontScale: number;
  footerQrScale: number;
  footerLineHeight: number;
  
  qrConfig: {
    enabled: boolean;
    type: 'VCARD' | 'WEBSITE' | 'INSTAGRAM' | 'VALIDATION' | 'PAYMENT' | 'WHATSAPP' | 'LOCATION';
    value: string;
    label: string;
    color: string | null;
    style: string;
  };

  // Actions
  setCurrentStep: (step: number | ((prev: number) => number)) => void;
  setCabinetType: (type: 'PRIVE' | 'CLINIQUE') => void;
  setIdentity: (identity: IdentityState | ((prev: IdentityState) => IdentityState)) => void;
  setSelectedSpecialties: (specs: string[] | ((prev: string[]) => string[])) => void;
  setCustomSpecialty: (spec: { fr: string; ar: string } | ((prev: { fr: string; ar: string }) => { fr: string; ar: string })) => void;
  setContacts: (contacts: ContactConfig | ((prev: ContactConfig) => ContactConfig)) => void;
  setHeaderOption: (option: HeaderOption) => void;
  setSelectedTemplate: (template: TemplateOption) => void;
  setSelectedThemeAndPersist: (theme: 'elite' | 'emerald' | 'rose' | 'prestige' | string) => void;
  setSelectedIdentity: (id: string) => void;
  setSelectedFont: (font: string) => void;
  setMargins: (margins: { top: number; bottom: number } | ((prev: { top: number; bottom: number }) => { top: number; bottom: number })) => void;
  setHeaderScale: (scale: number) => void;
  setHeaderFontScale: (scale: number) => void;
  setHeaderLogoScale: (scale: number) => void;
  setHeaderLineHeight: (scale: number) => void;
  setFooterFontScale: (scale: number) => void;
  setFooterQrScale: (scale: number) => void;
  setFooterLineHeight: (scale: number) => void;
  setQrConfig: (config: any | ((prev: any) => any)) => void;
  reset: () => void;
}

const initialState = {
  currentStep: 1,
  cabinetType: 'PRIVE' as const,
  identity: { nomCabinet: '', nomPraticien: '', nomPraticienAR: '', adresse: '', ice: '', if: '', inpe: '' },
  selectedSpecialties: [],
  customSpecialty: { fr: '', ar: '' },
  contacts: {
    fixe: { enabled: true, value: '' },
    mobile: { enabled: false, value: '' },
    whatsapp: { enabled: false, value: '' },
    instagram: { enabled: false, value: '' },
  },
  headerOption: 'auto' as HeaderOption,
  selectedTemplate: 'swiss' as TemplateOption,
  selectedTheme: (localStorage.getItem('digitalcrown_theme') as any) || 'elite',
  selectedIdentity: BRAND_IDENTITIES[0]?.id || 'dc-blue',
  selectedFont: 'helvetica',
  margins: { top: 3.6, bottom: 3.2 },
  headerScale: 1.1,
  headerFontScale: 1.0,
  headerLogoScale: 1.0,
  headerLineHeight: 1.0,
  footerFontScale: 1.0,
  footerQrScale: 1.0,
  footerLineHeight: 1.0,
  qrConfig: {
    enabled: true,
    type: 'VCARD' as const,
    value: '',
    label: 'Scannez pour me contacter',
    color: null,
    style: 'dots'
  }
};

export const useSetupStore = create<SetupState>()(
  persist(
    (set) => ({
      ...initialState,
      
      setCurrentStep: (val) => set((state) => ({ currentStep: typeof val === 'function' ? val(state.currentStep) : val })),
      setCabinetType: (cabinetType) => set({ cabinetType }),
      setIdentity: (val) => set((state) => ({ identity: typeof val === 'function' ? val(state.identity) : val })),
      setSelectedSpecialties: (val) => set((state) => ({ selectedSpecialties: typeof val === 'function' ? val(state.selectedSpecialties) : val })),
      setCustomSpecialty: (val) => set((state) => ({ customSpecialty: typeof val === 'function' ? val(state.customSpecialty) : val })),
      setContacts: (val) => set((state) => ({ contacts: typeof val === 'function' ? val(state.contacts) : val })),
      setHeaderOption: (headerOption) => set({ headerOption }),
      setSelectedTemplate: (selectedTemplate) => set({ selectedTemplate }),
      setSelectedThemeAndPersist: (selectedTheme) => {
        localStorage.setItem('digitalcrown_theme', selectedTheme);
        set({ selectedTheme: selectedTheme as any });
      },
      setSelectedIdentity: (selectedIdentity) => set({ selectedIdentity }),
      setSelectedFont: (selectedFont) => set({ selectedFont }),
      setMargins: (val) => set((state) => ({ margins: typeof val === 'function' ? val(state.margins) : val })),
      setHeaderScale: (headerScale) => set({ headerScale }),
      setHeaderFontScale: (headerFontScale) => set({ headerFontScale }),
      setHeaderLogoScale: (headerLogoScale) => set({ headerLogoScale }),
      setHeaderLineHeight: (headerLineHeight) => set({ headerLineHeight }),
      setFooterFontScale: (footerFontScale) => set({ footerFontScale }),
      setFooterQrScale: (footerQrScale) => set({ footerQrScale }),
      setFooterLineHeight: (footerLineHeight) => set({ footerLineHeight }),
      setQrConfig: (val) => set((state) => ({ qrConfig: typeof val === 'function' ? val(state.qrConfig) : val })),
      reset: () => set(initialState)
    }),
    {
      name: 'digitalcrown-setup-storage',
      storage: createJSONStorage(() => sessionStorage), // Persist during the browser session only
    }
  )
);
