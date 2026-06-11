import { create } from 'zustand';
import { cephaloRepository } from '../cephaloRepository';
import { 
  buildPayload, computeMcNamaraProjections, initializeDefaultApexes, 
  calcDDMCephalo, computeLocalImpa 
} from '../cephaloUtils';
import type { Landmark, SyncState, ImageFilters, UIMode, VTOSettings, StepId } from '../cephaloShared';
import type { LocalState, DDMState, DiagnosticTexts, DonneesEtape2, DonneesEtape3, PhotoUpload } from '../cephaloTypes';

interface OrthoState {
  // Global
  patientId: number | null;
  patientName: string;
  analysisId: number | undefined;
  
  // Imagerie & IA
  imageSrc: string | undefined;
  local: LocalState;
  activePointId: string | null;
  imgFilters: ImageFilters;
  imgDim: { w: number; h: number };
  mode: UIMode;
  magnifierEnabled: boolean;
  performanceMode: boolean;
  isStep1Fullscreen: boolean;
  vtoSettings: VTOSettings;
  activeMorphing: 'none' | 'T1' | 'T2';
  anglesData: Record<string, any>;
  visionMetadata: any;
  
  // Calibration
  isCalibrated: boolean;
  mmPerPixel: number | null;
  showCalibration: boolean;
  calibrationClickPoints: { x: number; y: number }[];
  calibrationDistance: string;
  calibrationStep: 'selecting' | 'entering';
  autoCalibMessage: string | null;

  // Données Cliniques
  ddm: DDMState;
  diag: DiagnosticTexts;
  etape2Data: DonneesEtape2;
  etape3Data: DonneesEtape3;
  // UI Status
  step: StepId;
  completedSteps: Set<number>;
  uploadError: string | null;
  isUploading: boolean;
  isSaving: boolean;
  isPrinting: boolean;
  previewPdfUrl: string | null;
  isPreviewLoading: boolean;
  syncState: SyncState;

  // Photos & Documents
  photos: PhotoUpload[];
  dateConsultation: string;
  sexePatient: 'M' | 'F';

  // Actions d'état (Setters)
  setStep: (step: StepId) => void;
  setCompletedSteps: (updater: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  setPhotos: (updater: PhotoUpload[] | ((prev: PhotoUpload[]) => PhotoUpload[])) => void;
  setDateConsultation: (date: string) => void;
  setSexePatient: (sexe: 'M' | 'F') => void;
  setPatientInfo: (id: number, name: string) => void;
  setAnalysisId: (id: number | undefined) => void;
  setImageSrc: (src: string | undefined) => void;
  setLocal: (updater: LocalState | ((prev: LocalState) => LocalState)) => void;
  setActivePointId: (id: string | null) => void;
  setImgFilters: (updater: ImageFilters | ((prev: ImageFilters) => ImageFilters)) => void;
  setImgDim: (dim: { w: number; h: number }) => void;
  setMode: (updater: UIMode | ((prev: UIMode) => UIMode)) => void;
  setMagnifierEnabled: (updater: boolean | ((prev: boolean) => boolean)) => void;
  setPerformanceMode: (enabled: boolean) => void;
  setIsStep1Fullscreen: (updater: boolean | ((prev: boolean) => boolean)) => void;
  setVtoSettings: (updater: VTOSettings | ((prev: VTOSettings) => VTOSettings)) => void;
  setActiveMorphing: (morphing: 'none' | 'T1' | 'T2') => void;
  setAnglesData: (data: Record<string, any>) => void;
  setVisionMetadata: (meta: any) => void;
  
  setIsCalibrated: (calibrated: boolean) => void;
  setMmPerPixel: (mm: number | null) => void;
  setShowCalibration: (updater: boolean | ((prev: boolean) => boolean)) => void;
  setCalibrationClickPoints: (pts: { x: number; y: number }[] | ((prev: { x: number; y: number }[]) => { x: number; y: number }[])) => void;
  setCalibrationDistance: (dist: string | ((prev: string) => string)) => void;
  setCalibrationStep: (step: 'selecting' | 'entering' | ((prev: 'selecting' | 'entering') => 'selecting' | 'entering')) => void;
  setAutoCalibMessage: (msg: string | null) => void;

  setDdm: (updater: DDMState | ((prev: DDMState) => DDMState)) => void;
  setDiag: (updater: DiagnosticTexts | ((prev: DiagnosticTexts) => DiagnosticTexts)) => void;
  setEtape2Data: (updater: DonneesEtape2 | ((prev: DonneesEtape2) => DonneesEtape2)) => void;
  setEtape3Data: (updater: DonneesEtape3 | ((prev: DonneesEtape3) => DonneesEtape3)) => void;

  setUploadError: (err: string | null) => void;
  setIsUploading: (uploading: boolean) => void;
  setIsSaving: (saving: boolean) => void;
  setIsPrinting: (printing: boolean) => void;
  setPreviewPdfUrl: (url: string | null) => void;
  setIsPreviewLoading: (loading: boolean) => void;
  setSyncState: (state: SyncState) => void;
  clearSyncTimer: () => void;

  // Actions API & Logique Métier
  runAnalysis: (file: File) => Promise<void>;
  silentSave: (id?: number) => Promise<void>;
  handleSave: () => Promise<void>;
  applyCalibration: () => Promise<void>;
  updateLandmarksOptimistic: (newLms: Landmark[]) => void;
  handlePreview: () => Promise<void>;
  handlePrint: () => Promise<void>;
  handlePhotoUpload: (id: string, file: File) => void;
  goToStep: (target: StepId) => Promise<void>;
}

let syncTimer: ReturnType<typeof setTimeout> | undefined = undefined;

export const useOrthoStore = create<OrthoState>((set, get) => ({
  patientId: null,
  patientName: '',
  analysisId: undefined,
  
  imageSrc: undefined,
  local: { landmarks: [], version: 0 },
  activePointId: null,
  imgFilters: { brightness: 100, contrast: 110, invert: false },
  imgDim: { w: 800, h: 1000 },
  mode: (typeof document !== 'undefined' && (document.body?.dataset?.theme === 'dark' || document.body?.dataset?.theme === 'prestige')) ? 'dark' : 'light',
  magnifierEnabled: false,
  performanceMode: false,
  isStep1Fullscreen: false,
  vtoSettings: { 
    enabled: false,
    showGhostFace: true,
    showSoftTissue: true,
    u1_offset: { x: 0, y: 0 },
    l1_offset: { x: 0, y: 0 },
    mand_offset: { x: 0, y: 0 }
  },
  activeMorphing: 'none',
  anglesData: {},
  visionMetadata: {},
  
  isCalibrated: false,
  mmPerPixel: null,
  showCalibration: false,
  calibrationClickPoints: [],
  calibrationDistance: '',
  calibrationStep: 'selecting',
  autoCalibMessage: null,

  ddm: { maxillaire: '', mandibulaire: '' },
  diag: {
    analyse_dentaire: '',
    diagnostic_squelettique: '',
    analyse_moulages: '',
    synthese_diagnostique: '',
    strategie_therapeutique: ''
  },
  etape2Data: { 
    occlusal: { molaire_gauche: 'I', molaire_droite: 'I', canine_gauche: 'I', canine_droite: 'I' },
    type_arcade: null
  },
  etape3Data: {
    age: '', cvm: '', date_teles: new Date().toISOString().split('T')[0],
    dentaire: { surplomb: '', recouvrement: '', impa: '', i_francfort: '', inter_incisif: '' },
    osseuse: { angle_tweed: '', decalage_ab: '', situation_a: '', situation_b: '', profondeur_faciale: '', sna: '', snb: '', anb: '' },
    esthetique: { ligne_e_ls: '', ligne_e_li: '', angle_nasolabial: '' },
    ddm_clinique: '', ddm_cephalo: '', division: null, classe_squelettique: '',
    pattern_vertical: '', profil: '', severite_ddm: '', subdivision: false, analyse_moulages_auto: '',
    selectedAnalysis: 'COM',
    denture_type: 'PERMANENTE', preference_technique: 'DAMON'
  },
  step: 1,
  completedSteps: new Set<number>(),
  uploadError: null,
  isUploading: false,
  isSaving: false,
  isPrinting: false,
  previewPdfUrl: null,
  isPreviewLoading: false,
  syncState: 'idle',

  photos: [
    { id: 'radio', type: 'radio', file: null, preview: null, label: 'Radiographie Céphalométrique' },
    { id: 'moulage_max', type: 'moulage_max', file: null, preview: null, label: 'Moulage Maxillaire' },
    { id: 'moulage_mand', type: 'moulage_mand', file: null, preview: null, label: 'Moulage Mandibulaire' },
    { id: 'extra_face', type: 'extra_face', file: null, preview: null, label: 'Photo Extra-orale Face' },
    { id: 'extra_profile', type: 'extra_profile', file: null, preview: null, label: 'Photo Extra-orale Profil' },
    { id: 'extra_sourire', type: 'extra_sourire', file: null, preview: null, label: 'Photo Extra-orale Sourire' },
    { id: 'intra_face', type: 'intra_face', file: null, preview: null, label: 'Photo Intra-orale Face' },
    { id: 'intra_profile', type: 'intra_profile', file: null, preview: null, label: 'Photo Intra-orale Profil' },
  ],
  dateConsultation: new Date().toISOString().split('T')[0],
  sexePatient: 'M',

  // Setters
  setStep: (step) => set({ step }),
  setCompletedSteps: (updater) => set((state) => ({ completedSteps: typeof updater === 'function' ? updater(state.completedSteps) : updater })),
  setPhotos: (updater) => set((state) => ({ photos: typeof updater === 'function' ? updater(state.photos) : updater })),
  setDateConsultation: (date) => set({ dateConsultation: date }),
  setSexePatient: (sexe) => set({ sexePatient: sexe }),
  setPatientInfo: (id, name) => {
    // Si on change de patient, on tente de restaurer les photos/metas du localStorage
    const savedPhotos = localStorage.getItem(`digitalcrown_photos_${id}`);
    const savedMeta = localStorage.getItem(`digitalcrown_etape4_${id}`);
    const savedE2 = localStorage.getItem(`digitalcrown_etape2_${id}`);
    const savedE3 = localStorage.getItem(`digitalcrown_etape3_${id}`);
    
    set({ patientId: id, patientName: name });

    if (savedPhotos) {
      try {
        const parsed = JSON.parse(savedPhotos);
        set(s => ({
          photos: s.photos.map(p => ({ ...p, preview: parsed[p.id] || null }))
        }));
      } catch (err) {
        console.warn("Failed to parse savedPhotos", err);
      }
    }
    if (savedMeta) {
      try {
        const parsed = JSON.parse(savedMeta);
        set({ 
          dateConsultation: parsed.dateConsultation || new Date().toISOString().split('T')[0],
          sexePatient: parsed.sexePatient || 'M'
        });
      } catch (err) {
        console.warn("Failed to parse savedMeta", err);
      }
    }
    if (savedE2) {
      try { set({ etape2Data: JSON.parse(savedE2) }); } catch (err) { console.warn(err); }
    }
    if (savedE3) {
      try { set({ etape3Data: JSON.parse(savedE3) }); } catch (err) { console.warn(err); }
    }
  },
  setAnalysisId: (id) => set({ analysisId: id }),
  setImageSrc: (src) => set({ imageSrc: src }),
  setLocal: (updater) => set((state) => ({ local: typeof updater === 'function' ? updater(state.local) : updater })),
  setActivePointId: (id) => set({ activePointId: id }),
  setImgFilters: (updater) => set((state) => ({ imgFilters: typeof updater === 'function' ? updater(state.imgFilters) : updater })),
  setImgDim: (dim) => set({ imgDim: dim }),
  setMode: (updater) => set((state) => ({ mode: typeof updater === 'function' ? updater(state.mode) : updater })),
  setMagnifierEnabled: (updater) => set((state) => ({ magnifierEnabled: typeof updater === 'function' ? updater(state.magnifierEnabled) : updater })),
  setPerformanceMode: (enabled) => set({ performanceMode: enabled }),
  setIsStep1Fullscreen: (updater) => set((state) => ({ isStep1Fullscreen: typeof updater === 'function' ? updater(state.isStep1Fullscreen) : updater })),
  setVtoSettings: (updater) => set((state) => ({ vtoSettings: typeof updater === 'function' ? updater(state.vtoSettings) : updater })),
  setActiveMorphing: (morphing) => set({ activeMorphing: morphing }),
  setAnglesData: (data) => set({ anglesData: data }),
  setVisionMetadata: (meta) => set({ visionMetadata: meta }),
  setIsCalibrated: (calibrated) => set({ isCalibrated: calibrated }),
  setMmPerPixel: (mm) => set({ mmPerPixel: mm }),
  setShowCalibration: (updater) => set((state) => ({ showCalibration: typeof updater === 'function' ? updater(state.showCalibration) : updater })),
  setCalibrationClickPoints: (updater) => set((state) => ({ calibrationClickPoints: typeof updater === 'function' ? updater(state.calibrationClickPoints) : updater })),
  setCalibrationDistance: (updater) => set((state) => ({ calibrationDistance: typeof updater === 'function' ? updater(state.calibrationDistance) : updater })),
  setCalibrationStep: (updater) => set((state) => ({ calibrationStep: typeof updater === 'function' ? updater(state.calibrationStep) : updater })),
  setAutoCalibMessage: (msg) => set({ autoCalibMessage: msg }),
  setDdm: (updater) => set((state) => ({ ddm: typeof updater === 'function' ? updater(state.ddm) : updater })),
  setDiag: (updater) => set((state) => ({ diag: typeof updater === 'function' ? updater(state.diag) : updater })),
  setEtape2Data: (updater) => {
    set((state) => {
      const next = typeof updater === 'function' ? updater(state.etape2Data) : updater;
      if (state.patientId) localStorage.setItem(`digitalcrown_etape2_${state.patientId}`, JSON.stringify(next));
      return { etape2Data: next };
    });
  },
  setEtape3Data: (updater) => {
    set((state) => {
      const next = typeof updater === 'function' ? updater(state.etape3Data) : updater;
      if (state.patientId) localStorage.setItem(`digitalcrown_etape3_${state.patientId}`, JSON.stringify(next));
      return { etape3Data: next };
    });
  },
  setUploadError: (err) => set({ uploadError: err }),
  setIsUploading: (uploading) => set({ isUploading: uploading }),
  setIsSaving: (saving) => set({ isSaving: saving }),
  setIsPrinting: (printing) => set({ isPrinting: printing }),
  setPreviewPdfUrl: (url) => set({ previewPdfUrl: url }),
  setIsPreviewLoading: (loading) => set({ isPreviewLoading: loading }),
  setSyncState: (s) => set({ syncState: s }),
  clearSyncTimer: () => {
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = undefined; }
  },

  handlePhotoUpload: (id, file) => {
    const url = URL.createObjectURL(file);
    set(s => {
      const next = s.photos.map(p => p.id === id ? { ...p, file, preview: url } : p);
      if (s.patientId) {
        const previews = next.reduce((acc, p) => { acc[p.id] = p.preview; return acc; }, {} as Record<string, string | null>);
        localStorage.setItem(`digitalcrown_photos_${s.patientId}`, JSON.stringify(previews));
      }
      return { photos: next };
    });
  },

  goToStep: async (target) => {
    const s = get();
    // Logique de blocage déjà présente dans CephaloWorkspace, on peut la migrer ici
    if (target >= 2) {
      if (!s.imageSrc) {
        set({ uploadError: 'Veuillez d\'abord uploader une radiographie.' });
        setTimeout(() => set({ uploadError: null }), 4000);
        return;
      }
      if (!s.isCalibrated) {
        set({ showCalibration: true, calibrationClickPoints: [], calibrationDistance: '', calibrationStep: 'selecting' });
        return;
      }
    }
    await s.silentSave();
    set(prev => ({ 
      completedSteps: new Set([...prev.completedSteps, prev.step]),
      step: target 
    }));
  },

  // Actions API
  runAnalysis: async (file: File) => {
    const state = get();
    if (!state.patientId) return;
    set({ uploadError: null, isUploading: true });
    try {
      const data = await cephaloRepository.uploadRadio(state.patientId, file);
      if (data.analysis_id) set({ analysisId: data.analysis_id });
      if (data.file_url) set({ imageSrc: data.file_url });
      if (data.results) {
        set({ anglesData: data.results });
        
        // Auto-remplissage de l'Étape 3 avec les métriques IA
        const m = data.results.metrics;
        if (m) {
          set(s => {
            const e3 = JSON.parse(JSON.stringify(s.etape3Data)); // deep copy
            
            // Dentaire
            if (m.analyse_dentaire) {
              if (m.analyse_dentaire.Surplomb?.valeur !== undefined) e3.dentaire.surplomb = String(m.analyse_dentaire.Surplomb.valeur);
              if (m.analyse_dentaire.Recouvrement?.valeur !== undefined) e3.dentaire.recouvrement = String(m.analyse_dentaire.Recouvrement.valeur);
              if (m.analyse_dentaire.IMPA?.valeur !== undefined) e3.dentaire.impa = String(m.analyse_dentaire.IMPA.valeur);
              if (m.analyse_dentaire.I_Francfort?.valeur !== undefined) e3.dentaire.i_francfort = String(m.analyse_dentaire.I_Francfort.valeur);
              if (m.analyse_dentaire.Inter_Incisif?.valeur !== undefined) e3.dentaire.inter_incisif = String(m.analyse_dentaire.Inter_Incisif.valeur);
            }
            
            // Osseuse
            if (m.analyse_osseuse) {
              if (m.analyse_osseuse.Angle_de_Tweed?.valeur !== undefined) {
                const fma = m.analyse_osseuse.Angle_de_Tweed.valeur;
                e3.osseuse.angle_tweed = String(fma);
                // Déduction du pattern vertical
                e3.pattern_vertical = fma > 30 ? 'HYPERDIVERGENT' : (fma < 22 ? 'HYPODIVERGENT' : 'NORMODIVERGENT');
              }
              if (m.analyse_osseuse.Decalage_A_B?.valeur !== undefined) e3.osseuse.decalage_ab = String(m.analyse_osseuse.Decalage_A_B.valeur);
              if (m.analyse_osseuse.Situation_A?.valeur !== undefined) e3.osseuse.situation_a = String(m.analyse_osseuse.Situation_A.valeur);
              if (m.analyse_osseuse.Situation_B?.valeur !== undefined) e3.osseuse.situation_b = String(m.analyse_osseuse.Situation_B.valeur);
              if (m.analyse_osseuse.Profondeur_Faciale?.valeur !== undefined) e3.osseuse.profondeur_faciale = String(m.analyse_osseuse.Profondeur_Faciale.valeur);
              if (m.analyse_osseuse.SNA?.valeur !== undefined) e3.osseuse.sna = String(m.analyse_osseuse.SNA.valeur);
              if (m.analyse_osseuse.SNB?.valeur !== undefined) e3.osseuse.snb = String(m.analyse_osseuse.SNB.valeur);
              if (m.analyse_osseuse.ANB?.valeur !== undefined) {
                const anb = m.analyse_osseuse.ANB.valeur;
                e3.osseuse.anb = String(anb);
                // Déduction Classe Squelettique
                e3.classe_squelettique = anb > 4 ? 'CLASSE II' : (anb < 0 ? 'CLASSE III' : 'CLASSE I');
                // Déduction Profil
                e3.profil = anb > 4 ? 'CONVEXE' : (anb < 0 ? 'CONCAVE' : 'DROIT');
              }
            }
            
            // Esthétique (Ricketts, etc.)
            if (m.analyse_esthetique) {
              if (m.analyse_esthetique.Ligne_E_Ls?.valeur !== undefined) e3.esthetique.ligne_e_ls = String(m.analyse_esthetique.Ligne_E_Ls.valeur);
              if (m.analyse_esthetique.Ligne_E_Li?.valeur !== undefined) e3.esthetique.ligne_e_li = String(m.analyse_esthetique.Ligne_E_Li.valeur);
              if (m.analyse_esthetique.Angle_Nasolabial?.valeur !== undefined) e3.esthetique.angle_nasolabial = String(m.analyse_esthetique.Angle_Nasolabial.valeur);
            }
            
            return { etape3Data: e3 };
          });
        }
      }
      if (data.results?.vision_metadata) set({ visionMetadata: data.results.vision_metadata });
      
      if (data.is_calibrated !== undefined) {
        set({ isCalibrated: data.is_calibrated, mmPerPixel: data.mm_per_pixel || null });
        if (data.is_calibrated && data.mm_per_pixel) {
          set({ autoCalibMessage: `Auto-calibration réussie : ${data.mm_per_pixel.toFixed(4)} mm/px` });
          setTimeout(() => set({ autoCalibMessage: null }), 8000);
        }
      }
      if (data.landmarks) {
        set({ local: { landmarks: data.landmarks, version: 1 } });
      }
      if (data.results?.ai_narrative) {
        const n = data.results.ai_narrative;
        set(s => ({
          diag: {
            ...s.diag,
            diagnostic_squelettique: s.diag.diagnostic_squelettique || n.diagnostic_squelettique || '',
            analyse_moulages: s.diag.analyse_moulages || n.analyse_moulages || '',
            synthese_diagnostique: s.diag.synthese_diagnostique || n.synthese_diagnostique || '',
            strategie_therapeutique: s.diag.strategie_therapeutique || n.strategie_therapeutique || ''
          }
        }));
      }
      set(s => ({ completedSteps: new Set([...s.completedSteps, 1]) }));
    } catch (e: any) {
      const raw = e?.response?.data?.detail;
      set({ uploadError: typeof raw === 'string' ? raw : 'Échec de l\'analyse. Vérifiez l\'image.' });
    } finally {
      set({ isUploading: false });
    }
  },

  silentSave: async (id?: number) => {
    const s = get();
    const aid = id ?? s.analysisId;
    if (!aid) return;
    
    const max = s.ddm.maxillaire === '' ? null : Number(s.ddm.maxillaire);
    const mand = s.ddm.mandibulaire === '' ? null : Number(s.ddm.mandibulaire);
    const impa = computeLocalImpa(s.local.landmarks);
    const ceph = calcDDMCephalo(impa);
    const real = (mand !== null && ceph !== null) ? mand + ceph : null; 

    try {
      const projections = computeMcNamaraProjections(s.local.landmarks);
      await cephaloRepository.saveAnalysis(aid, buildPayload(s.local.landmarks, max, mand, real, s.diag, projections, s.mmPerPixel, s.etape2Data, s.etape3Data));
    } catch (err) {
      console.warn("Silent save failed:", err);
    }
  },

  handleSave: async () => {
    const s = get();
    if (!s.analysisId) return;
    set({ isSaving: true });
    try {
      const max = s.ddm.maxillaire === '' ? null : Number(s.ddm.maxillaire);
      const mand = s.ddm.mandibulaire === '' ? null : Number(s.ddm.mandibulaire);
      const impa = computeLocalImpa(s.local.landmarks);
      const ceph = calcDDMCephalo(impa);
      const real = (mand !== null && ceph !== null) ? mand + ceph : null;
      const projections = computeMcNamaraProjections(s.local.landmarks);

      await cephaloRepository.saveAnalysis(s.analysisId, buildPayload(s.local.landmarks, max, mand, real, s.diag, projections, s.mmPerPixel, s.etape2Data, s.etape3Data));
      set({ syncState: 'success' });
      setTimeout(() => set({ syncState: 'idle' }), 1500);
    } catch {
      set({ syncState: 'error' });
      setTimeout(() => set({ syncState: 'idle' }), 2000);
    } finally {
      set({ isSaving: false });
    }
  },

  updateLandmarksOptimistic: (newLms: Landmark[]) => {
    set(s => ({ local: { landmarks: newLms, version: s.local.version + 1 } }));
    const s = get();
    if (!s.analysisId) return;
    
    if (syncTimer) clearTimeout(syncTimer);
    set({ syncState: 'syncing' });
    
    syncTimer = setTimeout(async () => {
      const currentS = get();
      const max = currentS.ddm.maxillaire === '' ? null : Number(currentS.ddm.maxillaire);
      const mand = currentS.ddm.mandibulaire === '' ? null : Number(currentS.ddm.mandibulaire);
      const impa = computeLocalImpa(newLms);
      const ceph = calcDDMCephalo(impa);
      const real = (mand !== null && ceph !== null) ? mand + ceph : null;

      try {
        const projections = computeMcNamaraProjections(newLms);
        await cephaloRepository.saveAnalysis(currentS.analysisId!, buildPayload(newLms, max, mand, real, currentS.diag, projections, currentS.mmPerPixel, currentS.etape2Data, currentS.etape3Data));
        set({ syncState: 'success' });
        setTimeout(() => set({ syncState: 'idle' }), 1500);
      } catch {
        set({ syncState: 'error' });
        setTimeout(() => set({ syncState: 'idle' }), 2500);
      }
    }, 600);
  },

  applyCalibration: async () => {
    const s = get();
    if (!s.analysisId || s.calibrationClickPoints.length !== 2 || !s.calibrationDistance) return;
    const p1 = s.calibrationClickPoints[0];
    const p2 = s.calibrationClickPoints[1];
    const distPixels = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    const distMm = parseFloat(s.calibrationDistance);
    if (distMm <= 0 || distPixels <= 0) return;
    const ratio = distMm / distPixels;
    
    try {
      await cephaloRepository.calibrate(s.analysisId, p1, p2, distMm);
      set({
        mmPerPixel: ratio,
        isCalibrated: true,
        showCalibration: false,
        calibrationClickPoints: [],
        calibrationDistance: '',
        calibrationStep: 'selecting'
      });
      const updatedData = await cephaloRepository.saveAnalysis(s.analysisId, {
        landmarks: s.local.landmarks,
        mm_per_pixel: ratio
      });
      if (updatedData.results) set({ anglesData: updatedData.results });
    } catch (e) {
      console.error('Erreur calibration:', e);
    }
  },

  handlePreview: async () => {
    const s = get();
    if (!s.analysisId || !s.patientId) return;
    set({ isPreviewLoading: true, previewPdfUrl: null });
    await s.silentSave();
    
    try {
      const max = s.ddm.maxillaire === '' ? null : Number(s.ddm.maxillaire);
      const mand = s.ddm.mandibulaire === '' ? null : Number(s.ddm.mandibulaire);
      const impa = computeLocalImpa(s.local.landmarks);
      const ceph = calcDDMCephalo(impa);
      const real = (mand !== null && ceph !== null) ? mand + ceph : null;
      
      const data = await cephaloRepository.generatePDF(s.patientId, {
        ai_diagnostic: {
          diagnostic_squelettique: s.diag.diagnostic_squelettique || '',
          analyse_moulages: s.diag.analyse_moulages || '',
          synthese_diagnostique: s.diag.synthese_diagnostique || '',
          strategie_therapeutique: s.diag.strategie_therapeutique || '',
        },
        clinical_data: {
          ddm_maxillaire: { espace_disponible: 0, espace_necessaire: 0, calcul_ddm: max ?? 0 },
          ddm_mandibulaire: { espace_disponible: 0, espace_necessaire: 0, calcul_ddm: mand ?? 0 },
          ddm_reelle: real ?? 0,
          plan_traitement: s.diag.strategie_therapeutique || '',
          denture_type: s.etape3Data.denture_type,
          preference_technique: s.etape3Data.preference_technique,
        },
        archive: false,
      });
      
      const blob = new Blob([data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      set({ previewPdfUrl: url, isPreviewLoading: false });
    } catch (e) {
      console.error('[Preview] Erreur:', e);
      set({ isPreviewLoading: false });
    }
  },

  handlePrint: async () => {
    const s = get();
    if (!s.analysisId || !s.patientId) return;
    set({ isPrinting: true });
    await s.silentSave();
    
    try {
      const max = s.ddm.maxillaire === '' ? null : Number(s.ddm.maxillaire);
      const mand = s.ddm.mandibulaire === '' ? null : Number(s.ddm.mandibulaire);
      const impa = computeLocalImpa(s.local.landmarks);
      const ceph = calcDDMCephalo(impa);
      const real = (mand !== null && ceph !== null) ? mand + ceph : null;

      const data = await cephaloRepository.generatePDF(s.patientId, {
        ai_diagnostic: {
          diagnostic_squelettique: s.diag.diagnostic_squelettique || '',
          analyse_moulages: s.diag.analyse_moulages || '',
          synthese_diagnostique: s.diag.synthese_diagnostique || '',
          strategie_therapeutique: s.diag.strategie_therapeutique || '',
        },
        clinical_data: {
          ddm_maxillaire: { espace_disponible: 0, espace_necessaire: 0, calcul_ddm: max ?? 0 },
          ddm_mandibulaire: { espace_disponible: 0, espace_necessaire: 0, calcul_ddm: mand ?? 0 },
          ddm_reelle: real ?? 0,
          plan_traitement: s.diag.strategie_therapeutique || '',
          denture_type: s.etape3Data.denture_type,
          preference_technique: s.etape3Data.preference_technique,
        },
        archive: true,
      });

      const blob = new Blob([data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const userChoice = window.confirm(
        'Le PDF a été généré avec succès.\n\n' +
        '• OK = Ouvrir dans un nouvel onglet (pour imprimer)\n' +
        '• Annuler = Télécharger le fichier'
      );
      
      if (userChoice) {
        window.open(url, '_blank');
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = `Bilan_COM_${s.patientName.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (e) {
      console.error('[Print] Erreur:', e);
    } finally {
      set({ isPrinting: false });
    }
  }

}));
