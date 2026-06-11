import { create } from 'zustand';
import type { DrugItem } from '../DocumentStudio/Forms/PrescriptionAgenticStudio';
import type { DocumentType } from '../DocumentHub';

interface DocumentState {
  activeTab: DocumentType;
  docDate: string;
  
  // Ordonnance
  drugs: DrugItem[];
  
  // Certificat
  certifType: string;
  certifDays: number;
  certifCustomMotif: string;

  // LibreForm
  libreTitle: string;
  libreContent: string;
  libreCustomPatient: string;
  libreCustomDate: string;
  libreHideHeader: boolean;
  librePageSize: 'A5' | 'A4';
  libreAlignment: 'left' | 'center' | 'right' | 'justify';

  setActiveTab: (tab: DocumentType) => void;
  setDocDate: (date: string) => void;
  
  setDrugs: (drugs: DrugItem[]) => void;
  
  setCertifType: (type: string) => void;
  setCertifDays: (days: number) => void;
  setCertifCustomMotif: (motif: string) => void;

  setLibreTitle: (title: string) => void;
  setLibreContent: (content: string) => void;
  setLibreCustomPatient: (patient: string) => void;
  setLibreCustomDate: (date: string) => void;
  setLibreHideHeader: (hide: boolean) => void;
  setLibrePageSize: (size: 'A5' | 'A4') => void;
  setLibreAlignment: (alignment: 'left' | 'center' | 'right' | 'justify') => void;
  
  resetDocumentState: () => void;
}

const initialState = {
  activeTab: 'ordonnance' as DocumentType,
  docDate: new Date().toISOString().split('T')[0],
  
  drugs: [{ id: 1, name: '', dosage: '', forme: '', posologie: '', type: 'MEDICAMENT' }] as DrugItem[],
  
  certifType: 'Repos médical',
  certifDays: 5,
  certifCustomMotif: '',

  libreTitle: '',
  libreContent: '',
  libreCustomPatient: '',
  libreCustomDate: '',
  libreHideHeader: false,
  librePageSize: 'A4' as const,
  libreAlignment: 'left' as const,
};

export const useDocumentStore = create<DocumentState>((set) => ({
  ...initialState,
  
  setActiveTab: (tab) => set({ activeTab: tab }),
  setDocDate: (date) => set({ docDate: date }),
  
  setDrugs: (drugs) => set({ drugs }),
  
  setCertifType: (type) => set({ certifType: type }),
  setCertifDays: (days) => set({ certifDays: days }),
  setCertifCustomMotif: (motif) => set({ certifCustomMotif: motif }),
  
  setLibreTitle: (title) => set({ libreTitle: title }),
  setLibreContent: (content) => set({ libreContent: content }),
  setLibreCustomPatient: (patient) => set({ libreCustomPatient: patient }),
  setLibreCustomDate: (date) => set({ libreCustomDate: date }),
  setLibreHideHeader: (hide) => set({ libreHideHeader: hide }),
  setLibrePageSize: (size) => set({ librePageSize: size }),
  setLibreAlignment: (alignment) => set({ libreAlignment: alignment }),
  
  resetDocumentState: () => set({ ...initialState, docDate: new Date().toISOString().split('T')[0] }),
}));
