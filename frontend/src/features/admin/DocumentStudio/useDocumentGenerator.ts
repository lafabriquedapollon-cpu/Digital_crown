import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api, API_BASE } from '../../../services/api';
import type { DrugItem } from './Forms/PrescriptionAgenticStudio';
import type { SelectedSurfaceData } from '../../../components/odontogram/types';
import { useAccountingStore } from '../store/useAccountingStore';

interface PriceItem {
  id: number;
  description: string;
  dent: string;
  price: number;
  toothNumbers?: number[];
  _odontogramKey?: string;
  category?: string;
}

interface PatientDetails {
  id: number;
  nom: string;
  prenom: string;
  date_naissance?: string;
  genre?: string;
}

type PaymentMode = 'Espèces' | 'Chèque' | 'TPE' | 'Virement';
import type { HubDocumentType } from '../DocumentHub';

interface UseDocumentGeneratorParams {
  patientId: string | undefined;
  patientDetails: PatientDetails | null;
  activeTab: HubDocumentType;
  drugs: DrugItem[];
  certifType: string;
  certifDays: number;
  certifCustomMotif: string;
  items: PriceItem[];
  paymentMode: PaymentMode;
  libreTitle: string;
  libreContent: string;
  libreCustomPatient: string;
  libreCustomDate: string;
  libreHideHeader: boolean;
  librePageSize: 'A4' | 'A5';
  libreAlignment: 'left' | 'center' | 'right' | 'justify';
  docDate: string;
  selectedTeethFromOdontogram: SelectedSurfaceData[];
  smartSuggestion: any;
  installments: any[];
  isAccounted?: boolean;
  echeancierPayload?: { patient_id: number; title: string; total_amount: number; items: Array<{ label: string; amount: number; due_date: string; paid: boolean }> } | null;
  paymentStatus?: string;
  isGlobalNote?: boolean;
  onSuggestRadio?: () => void;
  showLegalAnnotations?: boolean;
}

// --- Validation stricte (Phase 3) ---
export interface ValidationError {
  field: string;
  message: string;
}

function validatePayload(params: UseDocumentGeneratorParams): ValidationError[] {
  const errors: ValidationError[] = [];
  const { activeTab, drugs, certifDays, items, docDate, libreContent, libreTitle } = params;

  if (!docDate || isNaN(new Date(docDate).getTime())) {
    errors.push({ field: 'date', message: 'La date du document est invalide.' });
  }

  if (activeTab === 'ordonnance') {
    const validDrugs = drugs.filter(d => d.name.trim());
    if (validDrugs.length === 0) {
      errors.push({ field: 'drugs', message: "L'ordonnance ne contient aucun médicament. Ajoutez au moins un médicament avant de générer." });
    }
    drugs.forEach((d, i) => {
      const isExamen = d.type === 'EXAMEN' || /radio|bilan|scanner|irm|panoramique|telecrane|télécrane/i.test(d.name);
      if (d.name.trim() && !d.posologie.trim() && !isExamen) {
        errors.push({ field: `drug_${i}`, message: `Posologie manquante pour : ${d.name}` });
      }
    });
  }

  if (activeTab === 'certificat') {
    if (!Number.isInteger(certifDays) || certifDays < 1) {
      errors.push({ field: 'certifDays', message: 'Le nombre de jours doit être un entier positif (minimum 1).' });
    }
    if (certifDays > 365) {
      errors.push({ field: 'certifDays', message: 'Le nombre de jours ne peut pas dépasser 365.' });
    }
  }

  if (activeTab === 'devis' || activeTab === 'honoraires') {
    if (items.length === 0) {
      errors.push({ field: 'items', message: 'Le document ne contient aucun acte. Ajoutez au moins un acte.' });
    }
    items.forEach((item, i) => {
      if (!item.description.trim()) {
        errors.push({ field: `item_${i}`, message: `Acte #${i + 1} : la description est vide.` });
      }
      const price = Number(item.price);
      if (isNaN(price) || price < 0) {
        errors.push({ field: `item_price_${i}`, message: `Acte "${item.description || `#${i + 1}`}" : montant invalide (MAD doit être ≥ 0).` });
      }
      if (price > 1_000_000) {
        errors.push({ field: `item_price_${i}`, message: `Acte "${item.description}" : montant (${price} MAD) dépasse la limite autorisée.` });
      }
    });
    if (activeTab === 'honoraires' && !params.paymentMode) {
      errors.push({ field: 'paymentMode', message: 'Le mode de règlement est requis pour une Note d\'Honoraires.' });
    }
  }

  if (activeTab === 'libre') {
    if (!libreTitle.trim()) {
      errors.push({ field: 'libreTitle', message: 'Le titre du document libre est requis.' });
    }
    if (!libreContent.trim()) {
      errors.push({ field: 'libreContent', message: 'Le contenu du document libre est vide.' });
    }
  }

  return errors;
}

// --- Analyse de cohérence IA (Phase 4) ---
export interface CoherenceWarning {
  level: 'info' | 'warning' | 'critical';
  message: string;
}

function analyzeCoherence(params: UseDocumentGeneratorParams): CoherenceWarning[] {
  const warnings: CoherenceWarning[] = [];
  const { activeTab, drugs, items } = params;

  if (activeTab === 'ordonnance') {
    const namedDrugs = drugs.filter(d => 
      d.name.trim() && 
      d.type !== 'EXAMEN' && 
      !/radio|bilan|scanner|irm|panoramique|telecrane|télécrane/i.test(d.name)
    );
    const hasMissingDosage = namedDrugs.some(d => !d.dosage.trim());
    if (hasMissingDosage) {
      warnings.push({ level: 'warning', message: "Certains médicaments n'ont pas de dosage spécifié. Vérifiez avant impression." });
    }
    const antibiotics = namedDrugs.filter(d =>
      /amoxicillin|augmentin|clamoxyl|metronidazole|flagyl|clindamycin|dalacin/i.test(d.name)
    );
    if (antibiotics.length > 1) {
      warnings.push({ level: 'warning', message: `Association antibiotique détectée (${antibiotics.map(a => a.name).join(', ')}). Vérifiez la pertinence clinique.` });
    }

    const ains = namedDrugs.filter(d => /ibuprofène|ibuprofene|antadys|nurofen|ketoprofène|biprofenid|diclofenac|voltarène/i.test(d.name));
    const corticos = namedDrugs.filter(d => /solupred|prednisolone|cortancyl|celestene/i.test(d.name));
    
    if (ains.length > 0 && corticos.length > 0) {
      warnings.push({ level: 'warning', message: `Association AINS et Corticoïdes détectée (${ains[0].name} + ${corticos[0].name}). Risque ulcérogène accru.` });
    }
    
    if (ains.length > 1) {
      warnings.push({ level: 'critical', message: `Redondance d'AINS détectée. Évitez de prescrire deux AINS simultanément.` });
    }

    const paracetamol = namedDrugs.filter(d => /doliprane|paracetamol|efferalgan/i.test(d.name));
    if (paracetamol.length > 1) {
      warnings.push({ level: 'warning', message: `Surdosage potentiel de Paracétamol détecté. Vérifiez la dose journalière maximale (3g à 4g/jour).` });
    }
  }

  if (activeTab === 'devis' || activeTab === 'honoraires') {
    const zeroItems = items.filter(i => Number(i.price) === 0 && i.description.trim());
    if (zeroItems.length > 0) {
      warnings.push({ level: 'info', message: `${zeroItems.length} acte(s) avec montant à 0 MAD : ${zeroItems.map(i => i.description).join(', ')}.` });
    }
    const total = items.reduce((s, i) => s + Number(i.price), 0);
    if (total > 50000) {
      warnings.push({ level: 'warning', message: `Total élevé (${total.toLocaleString('fr-MA')} MAD). Confirmez le montant avant archivage.` });
    }
  }

  return warnings;
}

export function useDocumentGenerator(params: UseDocumentGeneratorParams) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const previewInFlightRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [showPrintWarning, setShowPrintWarning] = useState(false);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [coherenceWarnings, setCoherenceWarnings] = useState<CoherenceWarning[]>([]);
  const [duplicateArgs, setDuplicateArgs] = useState<{ archive: boolean; print: boolean } | null>(null);

  const { patientId, activeTab, drugs, smartSuggestion } = params;

  useEffect(() => {
    if (smartSuggestion?.applied && drugs.length > 0) setHasChanges(true);
  }, [drugs, smartSuggestion]);

  useEffect(() => {
    const ref = blobUrlRef;
    return () => { if (ref.current) URL.revokeObjectURL(ref.current); };
  }, []);

  // Impression automatique après génération PDF
  useEffect(() => {
    if (!pendingPrint || !pdfUrl) return;
    
    const printTimer = setTimeout(async () => {
      try {
        // Nettoyage de l'URL pour le fetch (retrait du fragment #view=...)
        const fetchUrl = pdfUrl.split('#')[0];
        
        console.log("🖨️ Tentative d'impression directe :", fetchUrl);
        
        const isLocalPdfUrl = fetchUrl.startsWith('blob:') || fetchUrl.startsWith('data:');
        // A blob URL already belongs to this browser context. Sending it through
        // Axios would turn it into /api/blob:... and fail instead of printing it.
        const localBlobUrl = isLocalPdfUrl
          ? fetchUrl
          : URL.createObjectURL((await api.get(fetchUrl.replace(API_BASE + '/api', ''), {
            responseType: 'blob',
          })).data);
        
        // Création d'un iframe caché pour l'impression
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = 'none';
        printFrame.src = localBlobUrl;
        
        document.body.appendChild(printFrame);
        
        printFrame.onload = () => {
          try {
            if (printFrame.contentWindow) {
              printFrame.contentWindow.focus();
              printFrame.contentWindow.print();
            }
          } catch (e) {
            console.error("Erreur print iframe:", e);
            // Fallback : ouverture dans un nouvel onglet si l'iframe échoue
            window.open(pdfUrl, '_blank');
          } finally {
            setPendingPrint(false);
            // Nettoyage après un délai raisonnable
            setTimeout(() => {
              if (document.body.contains(printFrame)) {
                document.body.removeChild(printFrame);
              }
              if (!isLocalPdfUrl) URL.revokeObjectURL(localBlobUrl);
            }, 5000);
          }
        };
      } catch (error) {
        console.error('Erreur globale impression :', error);
        setPendingPrint(false);
        window.open(pdfUrl, '_blank');
        toast('Impression lancée dans un nouvel onglet.', { icon: '🖨️' });
      }
    }, 500); // Délai réduit pour plus de réactivité
    
    return () => clearTimeout(printTimer);
  }, [pdfUrl, pendingPrint, activeTab]);

  const buildPayload = useCallback(() => {
    const {
      patientId, activeTab, drugs, certifType, certifDays, certifCustomMotif, items, paymentMode,
      libreTitle, libreContent, libreCustomPatient, libreCustomDate, libreHideHeader,
      librePageSize, libreAlignment, docDate, patientDetails, selectedTeethFromOdontogram,
      installments, isAccounted, paymentStatus, isGlobalNote,
    } = params;

    const payload: any = {
      type: activeTab === 'honoraires' ? 'note' : activeTab,
      patient_id: parseInt(patientId!, 10),
      data: {},
      is_accounted: isAccounted ?? true,
      payment_status: paymentStatus ?? "EN_ATTENTE",
    };

    if (activeTab === 'ordonnance') {
      payload.data = {
        medications: drugs.map(d => ({
          nom: d.name,
          dosage: d.dosage,
          forme: d.forme || 'Sachets',
          posologie: d.posologie,
          type: d.type || 'MEDICAMENT',
          non_substituable: d.non_substituable ?? false,
        })),
        doc_date: docDate,
        show_legal_annotations: params.showLegalAnnotations === true,
      };
    } else if (activeTab === 'certificat') {
      const reason = certifType === 'Autre' ? certifCustomMotif || 'Repos Post-Opératoire' : certifType;
      payload.data = { reason, days: Number(certifDays), start_date: docDate };
    } else if (activeTab === 'libre') {
      const birthDate = patientDetails?.date_naissance;
      let age: number | undefined;
      if (birthDate) {
        const birth = new Date(birthDate);
        const today = new Date();
        age = today.getFullYear() - birth.getFullYear();
        if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
      }
      payload.data = {
        title: libreTitle, content: libreContent, doc_date: docDate, age,
        gender: patientDetails?.genre, custom_patient: libreCustomPatient,
        custom_date: libreCustomDate, hide_patient_header: libreHideHeader,
        page_size: librePageSize, alignment: libreAlignment,
      };
    } else if (activeTab === 'echeancier') {
      const container = document.getElementById('installment-studio-container');
      if (container) {
        const planData = JSON.parse(container.getAttribute('data-plan-data') || '{}');
        payload.data = planData;
      }
    } else {
      const commonItems = items
        .filter(i => i.description.trim() !== '')
        .map(i => ({
          acte: i.description, dent: i.dent || '0', dents: i.toothNumbers || [],
          prix_unitaire: parseFloat(i.price.toString()),
          montant: parseFloat(i.price.toString()),
          date: docDate, mode_reglement: paymentMode,
        }));
      const robustTeethData = selectedTeethFromOdontogram.map(t => ({
        tooth_number: t.toothNumber,
        treatments: t.treatments.map(tr => ({ code: tr.code || 'ACT', name: tr.name, price: tr.price || 0 })),
        surfaces: t.surface ? [t.surface as string] : [],
        notes: '',
      }));
      payload.data = activeTab === 'devis'
        ? { items: commonItems, doc_date: docDate, teeth_data: robustTeethData, installments, is_global_note: isGlobalNote }
        : { payments: commonItems, doc_date: docDate, teeth_data: robustTeethData, installments, is_global_note: isGlobalNote };
    }

    return payload;
  }, [
    params.patientId, params.activeTab, params.drugs, params.certifType, params.certifDays,
    params.certifCustomMotif, params.items, params.paymentMode, params.libreTitle,
    params.libreContent, params.libreCustomPatient, params.libreCustomDate,
    params.libreHideHeader, params.librePageSize, params.libreAlignment, params.docDate,
    params.patientDetails, params.selectedTeethFromOdontogram, params.installments,
    params.isAccounted, params.paymentStatus, params.isGlobalNote, params.showLegalAnnotations,
  ]);

  const handleGenerate = useCallback(async (
    archive = false,
    print = false,
    isPreview = false,
    force = false,
  ) => {
    if (!patientId) return;
    if (activeTab === 'plan') return;
    if (isPreview && previewInFlightRef.current) return;
    if (isPreview) previewInFlightRef.current = true;

    // Flux dédié échéancier — même pattern blob+fallback que honoraires
    if (activeTab === 'echeancier') {
      const payload = params.echeancierPayload;
      if (!payload || payload.items.length === 0) {
        if (!isPreview) toast.error('Ajoutez au moins une échéance avant de générer');
        return;
      }
      if (print && !isPreview && !force) { setShowPrintWarning(true); return; }
      setLoading(true);
      if (print) setPendingPrint(true);
      try {
        let res;
        if (archive && !isPreview) {
          const savedPlan = await api.post('/installments/', {
            patient_id: payload.patient_id,
            title: payload.title,
            total_amount: payload.total_amount,
            installments: payload.items.map(item => ({
              label: item.label,
              amount: item.amount,
              due_date: item.due_date,
              status: item.paid ? 'PAYE' : 'EN_ATTENTE',
            })),
          });
          res = await api.post('/documents/generate?archive=true', {
            type: 'echeancier',
            patient_id: payload.patient_id,
            data: { plan_id: savedPlan.data.id },
          });
          toast.success('\u00C9ch\u00E9ancier enregistr\u00E9 dans le dossier patient.');
        } else {
          res = await api.post('/installments/generate-preview', payload);
        }
        if (res.data.pdf_url) {
          const cleanPdfPath = res.data.pdf_url.startsWith('/') ? res.data.pdf_url.substring(1) : res.data.pdf_url;
          let finalUrl = '';
          try {
            const pdfBlob = await api.get(`/${cleanPdfPath}`, { responseType: 'blob' });
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
            const blobUrl = URL.createObjectURL(new Blob([pdfBlob.data], { type: 'application/pdf' }));
            blobUrlRef.current = blobUrl;
            finalUrl = blobUrl;
            setPdfUrl(blobUrl);
          } catch {
            finalUrl = `${API_BASE}/api/${cleanPdfPath}?t=${Date.now()}#view=FitH`;
            setPdfUrl(finalUrl);
          }
          if (!isPreview && !print) window.open(finalUrl, '_blank');
        }
      } catch (e: any) {
        toast.error(e?.response?.data?.detail || 'Erreur lors de la génération du PDF');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (print && !isPreview && !force) {
      setShowPrintWarning(true);
      return;
    }

    // Validation Phase 3 (skip sur preview auto)
    if (!isPreview) {
      const errors = validatePayload(params);
      setValidationErrors(errors);
      if (errors.length > 0) {
        errors.forEach(e => toast.error(e.message));
        return;
      }

      // Cohérence Phase 4
      const warnings = analyzeCoherence(params);
      setCoherenceWarnings(warnings);
      const criticals = warnings.filter(w => w.level === 'critical');
      if (criticals.length > 0) {
        criticals.forEach(w => toast.error(w.message, { duration: 6000 }));
        return;
      }
    } else {
      setValidationErrors([]);
      setCoherenceWarnings([]);
    }

    setLoading(true);
    if (print) setPendingPrint(true);

    try {
      const payload = buildPayload();
      const res = await api.post(`/documents/generate?archive=${archive}&preview=${isPreview}&force=${force}`, payload);
      if (res.data.pdf_url) {
        const cleanPdfPath = res.data.pdf_url.startsWith('/') ? res.data.pdf_url.substring(1) : res.data.pdf_url;
        // Fetch as blob so the iframe gets the PDF without auth headers issue
        let finalUrl = '';
        try {
          const pdfBlob = await api.get(`/${cleanPdfPath}`, { responseType: 'blob' });
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
          const blobUrl = URL.createObjectURL(new Blob([pdfBlob.data], { type: 'application/pdf' }));
          blobUrlRef.current = blobUrl;
          finalUrl = blobUrl;
          setPdfUrl(blobUrl);
        } catch {
          finalUrl = `${API_BASE}/api/${cleanPdfPath}?t=${Date.now()}#view=FitH`;
          setPdfUrl(finalUrl);
        }

        // Mise à jour des alertes de cohérence depuis le backend (Triple-Check Validation)
        if (res.data.warnings && res.data.warnings.length > 0) {
          console.log("🩺 [Clinical Intelligence] Alertes de cohérence détectées:", res.data.warnings);
          setCoherenceWarnings(res.data.warnings);
        } else {
          setCoherenceWarnings([]);
        }

        // Si ce n'est pas une preview et pas une impression directe, on ouvre le PDF
        if (!isPreview && !print) {
          window.open(finalUrl, '_blank');
        }

        // --- Apprentissage automatique des habitudes (Phase 2) ---
        if (activeTab === 'ordonnance' && !isPreview && archive) {
          try {
            for (const drug of drugs) {
              if (drug.name.trim()) {
                await api.post('/prescriptions/habits/record', {
                  medication_name: drug.name,
                  dosage: drug.dosage,
                  posologie: drug.posologie
                });
              }
            }
          } catch (e) {
            console.warn("Échec de l'apprentissage des habitudes (silencieux)", e);
          }
        }

        // --- Apprentissage automatique des Actes (Phase 2) ---
        if ((activeTab === 'devis' || activeTab === 'honoraires') && !isPreview && archive) {
          try {
            useAccountingStore.getState().setGroupSelectedTeeth([]);
            useAccountingStore.getState().setOdontogramMode('individual');
            const { items } = params;
            for (const item of items) {
              if (item.description.trim()) {
                await api.post('/accounting/record-act', {
                  name: item.description,
                  price: item.price,
                  category: item.category
                });
              }
            }
          } catch (e) {
            console.warn("Échec de l'apprentissage des actes (silencieux)", e);
          }

          if (activeTab === 'honoraires') {
            useAccountingStore.getState().setItems([{ id: Date.now(), description: '', dent: '0', price: 0 }]);
          }
        }
      }
      if (archive && !isPreview) toast.success('Document archivé dans le dossier patient.');
      // D2: Suggestion RDV après acte ortho
      if (res.data.rdv_suggestion && !isPreview) {
        toast(`📅 ${res.data.rdv_suggestion.message} — Proposé : ${res.data.rdv_suggestion.suggested_date}`, {
          duration: 8000,
          icon: '📅',
        });
      }

      // D3: Suggestion ordonnance radio post-prothèse
      if (res.data.suggest_radio && !isPreview && params.onSuggestRadio) {
        params.onSuggestRadio();
      }
    } catch (e: any) {
      if (e.response?.status === 409 && e.response?.data?.detail?.code === 'DOUBLE_DETECTED') {
        setDuplicateArgs({ archive, print });
      } else {
        const detail = e.response?.data?.detail;
        let msg: string;
        if (typeof detail === 'string') {
          msg = detail;
        } else if (Array.isArray(detail)) {
          // Erreur de validation Pydantic (422) : tableau de {loc, msg, type}
          msg = detail.map((d: any) => d.msg || JSON.stringify(d)).join(' | ');
        } else {
          msg = detail?.message || e.message || 'Impossible de générer le document.';
        }
        toast.error('Erreur : ' + msg, { duration: 6000 });
      }
    } finally {
      if (isPreview) previewInFlightRef.current = false;
      setLoading(false);
      setShowPrintWarning(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, activeTab, buildPayload, params]);

  const handleGenerateAI = useCallback(async () => {
    if (!patientId) return;
    setLoadingAi(true);
    window.dispatchEvent(new Event('ai-generation-start'));
    try {
      const res = await api.get(`/patients/${patientId}/ai-diagnostic`);
      setAiReport(res.data.report);
    } catch (e) {
      console.error('Erreur IA:', e);
    } finally {
      setLoadingAi(false);
      window.dispatchEvent(new Event('ai-generation-end'));
    }
  }, [patientId]);

  const handleSavePreference = useCallback(async (smartSuggestion: any, drugs: DrugItem[]) => {
    if (!smartSuggestion?.protocol_name) return;
    try {
      await api.post('/prescriptions/preferences/', {
        act_code: smartSuggestion.protocol_name.replace(' ', '_').toUpperCase(),
        drugs: drugs.map(d => ({ nom: d.name, dosage: d.dosage, forme: d.forme, posologie: d.posologie })),
      });
      setHasChanges(false);
      toast.success('Protocole personnalisé enregistré !');
    } catch (err) {
      console.error('Erreur sauvegarde pref:', err);
    }
  }, []);

  const confirmDuplicate = useCallback(() => {
    if (!duplicateArgs) return;
    const { archive, print } = duplicateArgs;
    setDuplicateArgs(null);
    handleGenerate(archive, print, false, true);
  }, [duplicateArgs, handleGenerate]);

  return {
    pdfUrl,
    loading,
    aiReport,
    loadingAi,
    showPrintWarning,
    pendingPrint,
    hasChanges,
    setHasChanges,
    validationErrors,
    coherenceWarnings,
    showDuplicateModal: duplicateArgs !== null,
    confirmDuplicate,
    cancelDuplicate: () => setDuplicateArgs(null),
    handleGenerate,
    handleGenerateAI,
    handleSavePreference,
    closeWarning: () => setShowPrintWarning(false),
  };
}
