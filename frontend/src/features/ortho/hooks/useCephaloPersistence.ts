import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { cephaloRepository } from '../cephaloRepository';
import { 
  buildPayload, computeMcNamaraProjections, 
  calcDDMCephalo, computeLocalImpa 
} from '../cephaloUtils';
import { type Landmark, type SyncState, type ImageFilters, REQUIRED_LANDMARKS } from '../cephaloShared';
import type { DDMState, DiagnosticTexts, DonneesEtape2, DonneesEtape3, LocalState } from '../cephaloTypes';

export const useCephaloPersistence = (
  patientId: number,
  patientName: string,
  ddm: DDMState,
  diag: DiagnosticTexts,
  etape2Data: DonneesEtape2,
  etape3Data: DonneesEtape3,
  setDiag: React.Dispatch<React.SetStateAction<DiagnosticTexts>>,
  setCompleted: React.Dispatch<React.SetStateAction<Set<number>>>
) => {
  // --- States ---
  const [analysisId, setAnalysisId] = useState<number | undefined>();
  const [imageSrc, setImageSrc] = useState<string | undefined>();
  const [anglesData, setAnglesData] = useState<Record<string, any>>({});
  const [visionMetadata, setVisionMetadata] = useState<{
    mode_inference?: string;
    warning?: string;
    processing_time_ms?: number;
  }>({});

  const [isCalibrated, setIsCalibrated] = useState(false);
  const [mmPerPixel, setMmPerPixel] = useState<number | null>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [calibrationClickPoints, setCalibrationClickPoints] = useState<{x: number, y: number}[]>([]);
  const [calibrationDistance, setCalibrationDistance] = useState<string>('');
  const [calibrationStep, setCalibrationStep] = useState<'selecting' | 'entering'>('selecting');

  const [local, setLocal] = useState<LocalState>({ landmarks: [], version: 0 });
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [imgFilters, setImgFilters] = useState<ImageFilters>({ brightness: 100, contrast: 110, invert: false });
  const [imgDim, setImgDim] = useState({ w: 800, h: 1000 });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [magnifierEnabled, setMagnifierEnabled] = useState(false);
  const [autoCalibMessage, setAutoCalibMessage] = useState<string | null>(null);
  
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // --- Refs ---
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestLocal = useRef(local);
  const latestDdm = useRef(ddm);
  const latestDiag = useRef(diag);
  const latestEtape2 = useRef(etape2Data);
  const latestEtape3 = useRef(etape3Data);

  useEffect(() => {
    latestLocal.current = local;
    latestDdm.current = ddm;
    latestDiag.current = diag;
    latestEtape2.current = etape2Data;
    latestEtape3.current = etape3Data;
  }, [local, ddm, diag, etape2Data, etape3Data]);

  // --- Logic ---

  const silentSave = useCallback(async (id?: number) => {
    const aid = id ?? analysisId;
    if (!aid) return;
    const l = latestLocal.current;
    const d = latestDdm.current;
    const g = latestDiag.current;
    const e2 = latestEtape2.current;
    const e3 = latestEtape3.current;
    
    const max = d.maxillaire === '' ? null : Number(d.maxillaire);
    const mand = d.mandibulaire === '' ? null : Number(d.mandibulaire);
    const impa = computeLocalImpa(l.landmarks);
    const ceph = calcDDMCephalo(impa);
    const real = (mand !== null && ceph !== null) ? mand + ceph : null; 

    try {
      const projections = computeMcNamaraProjections(l.landmarks);
      await cephaloRepository.saveAnalysis(aid, buildPayload(l.landmarks, max, mand, real, g, projections, mmPerPixel, e2, e3));
    } catch (err) {
      console.warn("Autosave failed:", err);
    }
  }, [analysisId, mmPerPixel]);

  const handleSave = useCallback(async () => {
    if (!analysisId) return;
    setIsSaving(true);
    try {
      const projections = computeMcNamaraProjections(local.landmarks);
      const max = ddm.maxillaire === '' ? null : Number(ddm.maxillaire);
      const mand = ddm.mandibulaire === '' ? null : Number(ddm.mandibulaire);
      const impa = computeLocalImpa(local.landmarks);
      const ceph = calcDDMCephalo(impa);
      const real = (mand !== null && ceph !== null) ? mand + ceph : null;

      await cephaloRepository.saveAnalysis(analysisId, buildPayload(local.landmarks, max, mand, real, diag, projections, mmPerPixel, etape2Data, etape3Data));
      setSyncState('success');
      setTimeout(() => setSyncState('idle'), 1500);
    } catch {
      setSyncState('error');
      setTimeout(() => setSyncState('idle'), 2000);
    } finally {
      setIsSaving(false);
    }
  }, [analysisId, local.landmarks, ddm, diag, etape2Data, etape3Data, mmPerPixel]);

  const runAnalysis = useCallback(async (file: File) => {
    setUploadError(null);
    setIsUploading(true);
    try {
      const data = await cephaloRepository.uploadRadio(patientId, file);
      if (data.analysis_id) setAnalysisId(data.analysis_id);
      if (data.file_url) setImageSrc(data.file_url);
      if (data.results) setAnglesData(data.results);
      if (data.results?.vision_metadata) setVisionMetadata(data.results.vision_metadata);
      if (data.is_calibrated !== undefined) {
        setIsCalibrated(data.is_calibrated);
        setMmPerPixel(data.mm_per_pixel || null);
        if (data.is_calibrated && data.mm_per_pixel) {
          setAutoCalibMessage(`Auto-calibration réussie : ${data.mm_per_pixel.toFixed(4)} mm/px`);
          setTimeout(() => setAutoCalibMessage(null), 8000);
        }
      }
      if (data.landmarks && data.landmarks.length > 0) {
        setLocal(prev => ({ ...prev, landmarks: data.landmarks }));
      }
      if (data.results?.ai_narrative) {
        const n = data.results.ai_narrative;
        setDiag(prev => ({
          analyse_dentaire: prev.analyse_dentaire || n.analyse_dentaire || '',
          diagnostic_squelettique: prev.diagnostic_squelettique || n.diagnostic_squelettique || '',
          analyse_moulages: prev.analyse_moulages || n.analyse_moulages || '',
          synthese_diagnostique: prev.synthese_diagnostique || n.synthese_diagnostique || '',
          strategie_therapeutique: prev.strategie_therapeutique || n.strategie_therapeutique || '',
        }));
      }
      setCompleted(prev => new Set([...prev, 1]));
    } catch (e: any) {
      const raw = e?.response?.data?.detail;
      setUploadError(typeof raw === 'string' ? raw : 'Échec de l\'analyse. Vérifiez l\'image.');
    } finally {
      setIsUploading(false);
    }
  }, [patientId, setDiag, setCompleted]);

  const updateLandmarksOptimistic = useCallback((newLms: Landmark[]) => {
    setLocal(prev => ({ landmarks: newLms, version: prev.version + 1 }));
    if (!analysisId) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    setSyncState('syncing');
    syncTimer.current = setTimeout(async () => {
      const d = latestDdm.current;
      const g = latestDiag.current;
      const e2 = latestEtape2.current;
      const e3 = latestEtape3.current;
      
      const max = d.maxillaire === '' ? null : Number(d.maxillaire);
      const mand = d.mandibulaire === '' ? null : Number(d.mandibulaire);
      const impa = computeLocalImpa(newLms);
      const ceph = calcDDMCephalo(impa);
      const real = (mand !== null && ceph !== null) ? mand + ceph : null;

      try {
        const projections = computeMcNamaraProjections(newLms);
        await cephaloRepository.saveAnalysis(analysisId, buildPayload(newLms, max, mand, real, g, projections, mmPerPixel, e2, e3));
        setSyncState('success');
        setTimeout(() => setSyncState('idle'), 1500);
      } catch {
        setSyncState('error');
        setTimeout(() => setSyncState('idle'), 2500);
      }
    }, 600);
  }, [analysisId, mmPerPixel]);

  const applyCalibration = useCallback(async () => {
    if (!analysisId || calibrationClickPoints.length !== 2 || !calibrationDistance) return;
    const p1 = calibrationClickPoints[0];
    const p2 = calibrationClickPoints[1];
    const distPixels = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    const distMm = parseFloat(calibrationDistance);
    if (distMm <= 0 || distPixels <= 0) return;
    const ratio = distMm / distPixels;
    try {
      await cephaloRepository.calibrate(analysisId, p1, p2, distMm);
      setMmPerPixel(ratio);
      setIsCalibrated(true);
      setShowCalibration(false);
      setCalibrationClickPoints([]);
      setCalibrationDistance('');
      setCalibrationStep('selecting');
      const updatedData = await cephaloRepository.saveAnalysis(analysisId, {
        landmarks: local.landmarks,
        mm_per_pixel: ratio
      });
      if (updatedData.results) setAnglesData(updatedData.results);
    } catch (e) {
      console.error('Erreur calibration:', e);
    }
  }, [analysisId, calibrationClickPoints, calibrationDistance, local.landmarks]);

  // REQUIRED_LANDMARKS is now imported from cephaloShared

  const tracingPct = useMemo(() => {
    const n = REQUIRED_LANDMARKS.filter(id => local.landmarks.some(l => l.id === id)).length;
    return n / REQUIRED_LANDMARKS.length;
  }, [local.landmarks]);

  const allLandmarksPlaced = tracingPct === 1;

  const generateDocumentData = useCallback(async (preview: boolean) => {
    const max = ddm.maxillaire === '' ? null : Number(ddm.maxillaire);
    const mand = ddm.mandibulaire === '' ? null : Number(ddm.mandibulaire);
    const real = (max !== null && mand !== null) ? (max + mand) : null;

    return await cephaloRepository.generatePDF(patientId, {
      ai_diagnostic: {
        analyse_dentaire: diag.analyse_dentaire || '',
        diagnostic_squelettique: diag.diagnostic_squelettique || '',
        analyse_moulages: diag.analyse_moulages || '',
        synthese_diagnostique: diag.synthese_diagnostique || '',
        strategie_therapeutique: diag.strategie_therapeutique || '',
      },
      clinical_data: {
        ddm_maxillaire: { espace_disponible: 0, espace_necessaire: 0, calcul_ddm: max ?? 0 },
        ddm_mandibulaire: { espace_disponible: 0, espace_necessaire: 0, calcul_ddm: mand ?? 0 },
        ddm_reelle: real ?? 0,
        plan_traitement: diag.strategie_therapeutique || '',
        denture_type: etape3Data.denture_type,
        preference_technique: etape3Data.preference_technique,
      },
      archive: !preview,
    });
  }, [patientId, ddm, diag, etape3Data]);

  const handlePreview = useCallback(async () => {
    if (!analysisId || !allLandmarksPlaced) return;
    setIsPreviewLoading(true);
    setPreviewPdfUrl(null);
    await silentSave();
    try {
      const data = await generateDocumentData(true);
      const blob = new Blob([data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewPdfUrl(url);
    } catch (e) {
      console.error('[Preview] Erreur génération Aperçu', e);
      setIsPreviewLoading(false);
    }
  }, [analysisId, allLandmarksPlaced, silentSave, generateDocumentData]);

  const handlePrint = useCallback(async () => {
    if (!analysisId || !allLandmarksPlaced) return;
    setIsPrinting(true);
    await silentSave();
    try {
      const data = await generateDocumentData(false);
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
        link.download = `Bilan_COM_${patientName.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (e) {
      console.error('[PDF] Erreur génération:', e);
    } finally {
      setIsPrinting(false);
    }
  }, [analysisId, allLandmarksPlaced, patientName, silentSave, generateDocumentData]);

  return {
    analysisId, imageSrc, anglesData, visionMetadata,
    isCalibrated, mmPerPixel, showCalibration, calibrationClickPoints, calibrationDistance, calibrationStep,
    local, activePointId, imgFilters, imgDim, uploadError, isUploading, syncState, isSaving, isPrinting,
    magnifierEnabled, autoCalibMessage, previewPdfUrl, isPreviewLoading, tracingPct, allLandmarksPlaced,
    setAnalysisId, setImageSrc, setAnglesData, setVisionMetadata, setIsCalibrated, setMmPerPixel,
    setShowCalibration, setCalibrationClickPoints, setCalibrationDistance, setCalibrationStep,
    setLocal, setActivePointId, setImgFilters, setImgDim, setUploadError, setIsUploading,
    setSyncState, setIsSaving, setIsPrinting, setMagnifierEnabled, setAutoCalibMessage,
    setPreviewPdfUrl, setIsPreviewLoading,
    runAnalysis, handleSave, silentSave, handlePreview, handlePrint, applyCalibration, updateLandmarksOptimistic
  };
};
