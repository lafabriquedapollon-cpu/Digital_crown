import { create } from 'zustand';
import { api } from '../../../services/api';

export interface Medicament {
  id: number;
  name: string;
  dosage?: string;
  forme?: string;
  posologie_default?: string;
  type: string;
  substitution_allergie?: string;
}

export interface ClinicalRule {
  id: number;
  rule_type: string;
  condition: any;
  action: any;
}

export interface DiagnosticTemplate {
  id: number;
  motif: string;
  vitality?: string;
  percussion?: string;
  palpation?: string;
  radiology?: string;
  lesion_duration?: string;
  title: string;
  description?: string;
  protocol: string[];
  treatment_plan: any[];
  warnings: string[];
}

interface ClinicalState {
  medicaments: Medicament[];
  rules: ClinicalRule[];
  diagnosticTemplates: DiagnosticTemplate[];
  isLoading: boolean;
  
  fetchMedicalLibrary: () => Promise<void>;
}

export const useClinicalStore = create<ClinicalState>((set) => ({
  medicaments: [],
  rules: [],
  diagnosticTemplates: [],
  isLoading: false,

  fetchMedicalLibrary: async () => {
    set({ isLoading: true });
    try {
      const [medsRes, rulesRes, diagsRes] = await Promise.all([
        api.get('/medical-library/medicaments'),
        api.get('/medical-library/rules'),
        api.get('/medical-library/diagnostics')
      ]);
      
      set({
        medicaments: medsRes.data,
        rules: rulesRes.data,
        diagnosticTemplates: diagsRes.data,
        isLoading: false
      });
    } catch (error) {
      console.error("Failed to fetch medical library", error);
      set({ isLoading: false });
    }
  }
}));
