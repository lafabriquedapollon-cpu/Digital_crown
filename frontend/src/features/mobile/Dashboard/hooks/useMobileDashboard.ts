import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { MobileStorage } from '../../../../services/zka/MobileStorage';
import { CryptoService } from '../../../../services/zka/CryptoService';
import { fetchLabJobs, patchLabJobStatus } from '../../../../services/labJobService';
import type { LabJob } from '../../../../types/labJob';
import { formatLabJobMessage } from '../../../../services/whatsappService';
import type { Tab, SyncStatus, Snapshot, Appointment, ApptStatus } from '../types';
import { LabJobStatus } from '../../../../types/labJob';

function resolveApiBaseUrl(stored: string): string {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return stored;
  if (stored.includes('localhost') || stored.includes('127.0.0.1')) {
    return `${window.location.protocol}//${hostname}:8005`;
  }
  return stored;
}

export function useMobileDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('agenda');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queuedActionsCount, setQueuedActionsCount] = useState(0);
  const [now, setNow] = useState(new Date());
  const [labJobs, setLabJobs] = useState<LabJob[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [patients, setPatients] = useState<{id: number, name: string, phone: string | null}[]>([]);
  const credsRef = useRef<{ access_token: string; api_base_url: string; masterKey: string } | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Signature au Fauteuil states
  const [sigPatientId, setSigPatientId] = useState<number | null>(null);
  const [sigPatientName, setSigPatientName] = useState<string>('');
  const [sigDocs, setSigDocs] = useState<any[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);

  // WhatsApp states
  const [whatsappApt, setWhatsappApt] = useState<Appointment | null>(null);
  const [customMessage, setCustomMessage] = useState<string>('');
  const [whatsappTemplate, setWhatsappTemplate] = useState<'rappel' | 'confirmation'>('rappel');

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: 'instant' as any });
    }
  }, [activeTab]);

  useEffect(() => {
    document.documentElement.dataset.theme = '';
    document.body.dataset.theme = '';
    const t = setInterval(() => setNow(new Date()), 30000);
    // Pré-charger le token mobile dans localStorage pour que l'intercepteur api le retrouve
    MobileStorage.getCredentials().then(creds => {
      if (creds?.access_token) {
        try { localStorage.setItem('token', creds.access_token); } catch { /* ignore */ }
      }
    });
    return () => clearInterval(t);
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      setSyncStatus('loading');
      const creds = await MobileStorage.getCredentials();
      if (!creds) throw new Error('Non appairé');
      credsRef.current = creds;

      // Sync mobile JWT into localStorage so the standard api interceptor
      // (used by CrownBotChat and other shared components) sends Authorization headers.
      try { localStorage.setItem('token', creds.access_token); } catch { /* ignore */ }

      const res = await fetch(`${resolveApiBaseUrl(creds.api_base_url)}/api/mobile/snapshot?target_date=${selectedDate}`, {
        headers: { Authorization: `Bearer ${creds.access_token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? `Erreur ${res.status}`);

      const rawRes = await res.json();
      const data: Snapshot = rawRes.payload 
        ? await CryptoService.decryptPayload(rawRes.payload, creds.masterKey) 
        : rawRes;

      setSnapshot(data);
      await MobileStorage.saveLastSnapshot(data);
      setError(null);
      setSyncStatus('success');
    } catch (err) {
      console.error('[MobileDashboard] fetchSnapshot failed:', err);
      const cached = await MobileStorage.getLastSnapshot();
      if (cached) { setSnapshot(cached); setSyncStatus('error'); setError('Hors réseau — données en cache'); }
      else { setError('Impossible de joindre le cabinet'); setSyncStatus('error'); }
    }
  }, [selectedDate]);

  const fetchPatients = useCallback(async () => {
    try {
      const creds = credsRef.current || await MobileStorage.getCredentials();
      if (!creds) return;
      const res = await fetch(`${resolveApiBaseUrl(creds.api_base_url)}/api/mobile/patients`, {
        headers: { Authorization: `Bearer ${creds.access_token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const rawRes = await res.json();
        const data = rawRes.payload 
          ? await CryptoService.decryptPayload(rawRes.payload, creds.masterKey)
          : rawRes;
        setPatients(data.data || data);
      }
    } catch { /* silent */ }
  }, []);

  const syncQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const creds = await MobileStorage.getCredentials();
    if (!creds) return;
    
    const queue = await MobileStorage.getActionQueue();
    if (queue.length === 0) {
      setQueuedActionsCount(0);
      return;
    }

    setSyncStatus('loading');
    let hasError = false;

    for (const action of queue) {
      try {
        await fetch(action.url, {
          method: action.method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${creds.access_token}`
          },
          body: action.body ? JSON.stringify(action.body) : undefined
        });
        await MobileStorage.removeActionFromQueue(action.id);
      } catch (err) {
        hasError = true;
      }
    }

    const remaining = await MobileStorage.getActionQueue();
    setQueuedActionsCount(remaining.length);
    if (!hasError) {
      toast.success('Données synchronisées');
      fetchSnapshot();
    }
  }, [fetchSnapshot]);

  useEffect(() => {
    MobileStorage.getActionQueue().then(q => setQueuedActionsCount(q.length));
    const on = () => { setIsOnline(true); syncQueue(); };
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [syncQueue]);

  useEffect(() => { 
    MobileStorage.getLastSnapshot().then(c => { if (c) { setSnapshot(c); setSyncStatus('success'); } }); 
    fetchSnapshot(); 
    fetchPatients(); 
    fetchLabJobs().then(setLabJobs).catch(err => console.error(err)); 
  }, [fetchSnapshot, fetchPatients]);

  const handleStatusChange = async (id: number, status: ApptStatus) => {
    const creds = credsRef.current || await MobileStorage.getCredentials();
    if (!creds) return;
    try {
      await fetch(`${resolveApiBaseUrl(creds.api_base_url)}/api/mobile/appointments/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.access_token}` },
        body: JSON.stringify({ status }),
      });
      setSnapshot(prev => prev ? {
        ...prev,
        appointments: prev.appointments.map(a => a.id === id ? { ...a, status } : a),
      } : prev);
    } catch {
      await MobileStorage.enqueueAction(`${resolveApiBaseUrl(creds.api_base_url)}/api/mobile/appointments/${id}/status`, 'PATCH', { status });
      setQueuedActionsCount(prev => prev + 1);
      toast('Mise à jour mise en attente (hors ligne)', { icon: '🔄' });
      
      setSnapshot(prev => prev ? {
        ...prev,
        appointments: prev.appointments.map(a => a.id === id ? { ...a, status } : a),
      } : prev);
    }
  };

  const handleDeleteAppt = async (id: number) => {
    if (!window.confirm("Supprimer ce rendez-vous ?")) return;
    const creds = credsRef.current || await MobileStorage.getCredentials();
    if (!creds) return;
    try {
      await fetch(`${resolveApiBaseUrl(creds.api_base_url)}/api/mobile/appointments/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${creds.access_token}` }
      });
      fetchSnapshot();
      toast.success("Rendez-vous supprimé");
    } catch (err) {
      await MobileStorage.enqueueAction(`${resolveApiBaseUrl(creds.api_base_url)}/api/mobile/appointments/${id}`, 'DELETE');
      setQueuedActionsCount(prev => prev + 1);
      toast('Suppression mise en attente (hors ligne)', { icon: '🔄' });
      setSnapshot(prev => prev ? {
        ...prev,
        appointments: prev.appointments.filter(a => a.id !== id),
      } : prev);
    }
  };

  const handleRescheduleAppt = async (id: number, newDate: string, newTime: string) => {
    const creds = credsRef.current || await MobileStorage.getCredentials();
    if (!creds) return;
    try {
      await fetch(`${resolveApiBaseUrl(creds.api_base_url)}/api/mobile/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.access_token}` },
        body: JSON.stringify({ datetime_start: `${newDate}T${newTime}:00` }),
      });
      fetchSnapshot();
      toast.success("Rendez-vous déplacé");
    } catch (err) {
      await MobileStorage.enqueueAction(`${resolveApiBaseUrl(creds.api_base_url)}/api/mobile/appointments/${id}`, 'PATCH', { datetime_start: `${newDate}T${newTime}:00` });
      setQueuedActionsCount(prev => prev + 1);
      toast('Déplacement mis en attente (hors ligne)', { icon: '🔄' });
    }
  };

  const openWhatsApp = (phone: string | null, msg: string) => {
    if (!phone) return;
    window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const openApptWhatsApp = (apt: Appointment) => {
    setWhatsappApt(apt);
    setWhatsappTemplate('rappel');
  };

  useEffect(() => {
    if (!whatsappApt) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateFormatted = tomorrow.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    
    const motifLower = (whatsappApt.motif || "").toLowerCase();
    let motifStr = "votre consultation";
    if (motifLower) {
      if (motifLower.includes("empreinte") || motifLower.includes("taille") || motifLower.includes("armature") || motifLower.includes("biscuit") || motifLower.includes("prothèse")) {
        motifStr = `l'essayage / l'étape ${motifLower}`;
      } else {
        motifStr = `votre séance de ${motifLower}`;
      }
    }
    
    if (whatsappTemplate === 'rappel') {
      setCustomMessage(`Bonjour, n'oubliez pas votre rdv de demain à ${whatsappApt.time} pour ${motifStr}.`);
    } else {
      setCustomMessage(`Bonjour ${whatsappApt.patient_name}, nous vous confirmons votre rendez-vous du ${dateFormatted} à ${whatsappApt.time} pour ${whatsappApt.motif || 'votre consultation'}.`);
    }
  }, [whatsappApt, whatsappTemplate]);

  const handleSendWhatsApp = () => {
    if (!whatsappApt || !whatsappApt.phone) return;
    const phoneClean = whatsappApt.phone.replace(/\D/g, '');
    window.open(`https://wa.me/${phoneClean}?text=${encodeURIComponent(customMessage)}`, '_blank');
    setWhatsappApt(null);
  };

  const handleWhatsAppSend = async (job: LabJob) => {
    const plainText = formatLabJobMessage(job);
    const whatsappUri = `whatsapp://send?phone=${''}&text=${encodeURIComponent(plainText)}`;

    try {
      await navigator.clipboard.writeText(plainText);
    } catch (c) {
      console.warn('Échec silencieux du presse‑papier', c);
    }

    try {
      window.location.href = whatsappUri;
    } catch (e) {
      console.error('Échec de redirection WhatsApp', e);
    } finally {
      setLabJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: LabJobStatus.SENT } : j));
      patchLabJobStatus(job.id, { status: LabJobStatus.SENT }).catch((err: any) => console.error('Erreur API:', err));
    }
  };

  const fetchSignatureDocs = useCallback(async (patientId: number) => {
    setIsLoadingDocs(true);
    try {
      const creds = credsRef.current || await MobileStorage.getCredentials();
      if (!creds) return;
      const res = await fetch(`${resolveApiBaseUrl(creds.api_base_url)}/api/mobile/patients/${patientId}/documents`, {
        headers: { Authorization: `Bearer ${creds.access_token}` },
      });
      if (res.ok) {
        const rawRes = await res.json();
        const data = rawRes.payload 
          ? await CryptoService.decryptPayload(rawRes.payload, creds.masterKey)
          : rawRes;
        const docs = data.data || data;
        setSigDocs(docs);
        if (docs.length > 0) {
          const unsigned = docs.find((d: any) => !d.signed);
          setSelectedDocId(unsigned ? unsigned.id : docs[0].id);
        } else {
          setSelectedDocId(null);
        }
      }
    } catch (e) {
      toast.error("Erreur lors du chargement des documents");
    } finally {
      setIsLoadingDocs(false);
    }
  }, []);

  const handleOpenSignature = (patientId: number, patientName: string) => {
    setSigPatientId(patientId);
    setSigPatientName(patientName);
    setSigDocs([]);
    setSelectedDocId(null);
    setIsSigning(false);
    fetchSignatureDocs(patientId);
  };

  const handleSaveSignature = async (dataUrl: string) => {
    if (!selectedDocId) return toast.error("Veuillez sélectionner un document.");
    setIsSigning(true);
    try {
      const creds = credsRef.current || await MobileStorage.getCredentials();
      if (!creds) return;
      const res = await fetch(`${resolveApiBaseUrl(creds.api_base_url)}/api/mobile/documents/${selectedDocId}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.access_token}`
        },
        body: JSON.stringify({ signature_base64: dataUrl })
      });
      if (res.ok) {
        toast.success("Document signé et PDF régénéré !");
        fetchSignatureDocs(sigPatientId!);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Erreur lors de la signature");
      }
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    } finally {
      setIsSigning(false);
    }
  };

  const handleLogout = async () => {
    await MobileStorage.clearAll();
    window.location.replace('/mobile/onboarding');
  };

  const handleExportPDF = async () => {
    const creds = credsRef.current || await MobileStorage.getCredentials();
    if (!creds) return;
    try {
      const d = new Date(selectedDate);
      const res = await fetch(`${resolveApiBaseUrl(creds.api_base_url)}/api/mobile/accounting/export-pdf?year=${d.getFullYear()}&month=${d.getMonth() + 1}`, {
        headers: { Authorization: `Bearer ${creds.access_token}` },
      });
      if (!res.ok) throw new Error('Erreur export');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `Compta_${d.getFullYear()}_${d.getMonth() + 1}.pdf`, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Comptabilité ${d.getMonth() + 1}/${d.getFullYear()}`,
          });
          return;
        }
      }

      const a = document.createElement('a');
      a.href = url;
      a.download = `Compta_${d.getFullYear()}_${d.getMonth() + 1}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert("Erreur lors de l'export PDF");
    }
  };

  return {
    state: {
      activeTab,
      syncStatus,
      snapshot,
      error,
      isOnline,
      now,
      labJobs,
      selectedDate,
      patients,
      sigPatientId,
      sigPatientName,
      sigDocs,
      selectedDocId,
      isSigning,
      isLoadingDocs,
      whatsappApt,
      customMessage,
      whatsappTemplate,
      queuedActionsCount,
    },
    actions: {
      setActiveTab,
      setSelectedDate,
      fetchSnapshot,
      fetchPatients,
      handleStatusChange,
      handleDeleteAppt,
      handleRescheduleAppt,
      openWhatsApp,
      openApptWhatsApp,
      handleSendWhatsApp,
      handleWhatsAppSend,
      handleOpenSignature,
      handleSaveSignature,
      handleLogout,
      handleExportPDF,
      setSigPatientId,
      setSelectedDocId,
      setWhatsappApt,
      setWhatsappTemplate,
      setCustomMessage,
    },
    refs: {
      mainRef,
    }
  };
}
