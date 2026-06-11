import React, { useState, useRef, useEffect } from 'react';
import {
  Send, X, Bot, User, Check, XCircle, Loader2, Menu, Plus,
  Archive, BrainCircuit, Zap, ArrowRight, MessageSquare,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { api, API_BASE } from '../../services/api';
import { useAuthStore } from '../../stores/useAuthStore';
import { cn } from '../../utils/cn';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  actionType?: string;
  pendingAction?: any;
  suggestions?: string[];
}

interface Session {
  id: string;
  title: string;
  updated_at: string;
}

interface GhostInsight {
  id: number;
  insight_type: string;
  content: string;
  patient_id?: number;
  created_at: string;
}

type Tab = 'chat' | 'brain';

function PendingActionCard({
  action,
  onConfirm,
  onCancel,
}: {
  action: any;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const p = action?.params ?? {};
  const type = action?.type ?? '';

  const rows: { label: string; value: string }[] = [];

  if (type === 'CREATE_APPOINTMENT') {
    if (p.patient_name || p.patient_id) rows.push({ label: 'Patient', value: p.patient_name || `#${p.patient_id}` });
    if (p.datetime_start) {
      const d = new Date(p.datetime_start);
      rows.push({ label: 'Date', value: d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) });
      rows.push({ label: 'Heure', value: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) });
    }
    if (p.motif) rows.push({ label: 'Motif', value: p.motif });
    if (p.duration_minutes) rows.push({ label: 'Durée', value: `${p.duration_minutes} min` });
  } else if (type === 'OPEN_PRESCRIPTION_EDITOR') {
    if (p.patient_id || p.patient_name) rows.push({ label: 'Patient', value: p.patient_name || `#${p.patient_id}` });
    if (p.procedure) rows.push({ label: 'Acte', value: p.procedure });
    if (p.suggested_drugs?.length) {
      rows.push({ label: 'Médicaments', value: p.suggested_drugs.map((d: any) => d.name || d).join(', ') });
    }
  } else if (type === 'OPEN_DEVIS_EDITOR') {
    if (p.patient_id || p.patient_name) rows.push({ label: 'Patient', value: p.patient_name || `#${p.patient_id}` });
    if (p.procedure) rows.push({ label: 'Acte', value: p.procedure });
    if (p.tooth_number) rows.push({ label: 'Dent', value: p.tooth_number });
  }

  const label = type === 'CREATE_APPOINTMENT' ? '📅 Créer ce rendez-vous ?'
    : type === 'OPEN_PRESCRIPTION_EDITOR' ? '💊 Ouvrir l\'éditeur d\'ordonnance ?'
    : type === 'OPEN_DEVIS_EDITOR' ? '📄 Ouvrir le module devis ?'
    : '✅ Confirmer cette action ?';

  return (
    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-[12px]">
      <p className="text-xs font-bold text-amber-800 mb-2">{label}</p>
      {rows.length > 0 && (
        <div className="space-y-1 mb-3">
          {rows.map((row, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className="text-amber-600 font-bold w-20 shrink-0">{row.label}</span>
              <span className="text-slate-700 font-medium">{row.value}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onConfirm}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-[8px] transition-colors">
          <Check size={14} /> Confirmer
        </button>
        <button onClick={onCancel}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-[8px] transition-colors">
          <XCircle size={14} /> Annuler
        </button>
      </div>
    </div>
  );
}

const TypewriterText = ({ text, delay = 5 }: { text: string; delay?: number }) => {
  const [current, setCurrent] = useState('');
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (idx < text.length) {
      const t = setTimeout(() => {
        setCurrent(p => p + text[idx]);
        setIdx(p => p + 1);
      }, delay);
      return () => clearTimeout(t);
    }
  }, [idx, delay, text]);
  return <span>{current}</span>;
};

function getPageContext(pathname: string): { title: string; desc: string; suggestions: string[] } {
  if (pathname === '/' || pathname === '/dashboard') return {
    title: 'Tableau de bord',
    desc: "Vous êtes sur le tableau de bord. Je peux vous résumer votre journée, vos rendez-vous ou les finances du jour.",
    suggestions: ['Mon programme du jour', 'Finances du jour', 'Créer un RDV'],
  };
  if (/^\/patients\/new/.test(pathname)) return {
    title: 'Nouveau patient',
    desc: "Vous créez un nouveau dossier patient. Besoin d'aide pour remplir les informations ou choisir les motifs de consultation ?",
    suggestions: ['Quels motifs choisir ?', 'Aide à la saisie', 'Champs obligatoires'],
  };
  if (/^\/patients\/\d+/.test(pathname)) return {
    title: 'Dossier patient',
    desc: "Vous consultez un dossier patient. Je peux analyser le plan de traitement, suggérer des actes ou résumer l'historique.",
    suggestions: ['Résumer le dossier', 'Suggérer des actes', 'Vérifier le plan de traitement'],
  };
  if (/^\/patients/.test(pathname)) return {
    title: 'Liste des patients',
    desc: "Vous êtes sur la liste des patients. Je peux vous aider à trouver un patient ou filtrer par statut.",
    suggestions: ['Chercher un patient', 'Patients sans RDV', 'Patients urgents'],
  };
  if (/^\/agenda/.test(pathname)) return {
    title: 'Agenda',
    desc: "Vous gérez l'agenda. Je peux vous aider à créer un rendez-vous, vérifier les disponibilités ou lister les absences.",
    suggestions: ['Créer un RDV', 'Disponibilités du jour', 'RDV annulés'],
  };
  if (/^\/accounting/.test(pathname)) return {
    title: 'Comptabilité',
    desc: "Vous êtes dans la comptabilité. Je peux vous résumer la trésorerie, les impayés ou les recettes du mois.",
    suggestions: ['Résumé trésorerie', 'Impayés en cours', 'Recettes du mois'],
  };
  if (/^\/settings/.test(pathname)) return {
    title: 'Paramètres',
    desc: "Vous configurez le cabinet. Besoin d'aide pour la facturation, le branding ou les préférences IA ?",
    suggestions: ['Configurer la facturation', 'Branding du cabinet', 'Paramètres IA'],
  };
  if (/^\/bibliotheque/.test(pathname)) return {
    title: 'Bibliothèque',
    desc: "Vous êtes dans la bibliothèque de documents. Je peux vous aider à créer une ordonnance, un certificat ou un courrier.",
    suggestions: ['Créer une ordonnance', 'Générer un certificat', 'Rédiger un courrier'],
  };
  return {
    title: 'Crown Bot',
    desc: "Bonjour ! Je suis Crown Bot, votre assistant IA. Comment puis-je vous aider ?",
    suggestions: ['Mon programme du jour', 'Créer un RDV', 'Finance du jour'],
  };
}

export function CrownBotChat({
  onClose,
  onUnreadChange,
}: {
  onClose?: () => void;
  onUnreadChange?: (n: number) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const employerId = user?.employer_id || user?.id;

  const pageCtx = getPageContext(location.pathname);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([{
    id: 'welcome', sender: 'bot', text: pageCtx.desc, suggestions: pageCtx.suggestions,
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Tab & Ghost Brain state
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [insights, setInsights] = useState<GhostInsight[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Reset welcome message when route changes
  useEffect(() => {
    const ctx = getPageContext(location.pathname);
    setMessages([{ id: 'welcome', sender: 'bot', text: ctx.desc, suggestions: ctx.suggestions }]);
    setCurrentSessionId(null);
  }, [location.pathname]);

  // Propagate unread count to parent
  useEffect(() => {
    onUnreadChange?.(unreadCount);
  }, [unreadCount, onUnreadChange]);

  // Ghost Brain WebSocket
  useEffect(() => {
    if (!employerId) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isCleaned = false;
    let retryCount = 0;
    const MAX_RETRIES = 8;

    const connectWS = () => {
      if (isCleaned || retryCount >= MAX_RETRIES) return;
      const wsUrl = `${API_BASE.replace(/^http/, 'ws')}/api/ai/ws/ghost-insights/${employerId}`;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => { retryCount = 0; };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.insights) {
            setInsights(data.insights);
            setUnreadCount(data.unread_count);
          }
        } catch (err) {
          console.error('GhostBrain WS parse error:', err);
        }
      };
      ws.onclose = () => {
        if (isCleaned) return;
        retryCount++;
        reconnectTimer = setTimeout(connectWS, Math.min(5000 * retryCount, 60000));
      };
    };

    connectWS();
    return () => {
      isCleaned = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [employerId]);

  // Chat scroll
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Sessions
  const fetchSessions = async () => {
    try {
      const res = await api.get('/bot/sessions');
      setSessions(res.data);
    } catch (err) {
      console.error('Sessions fetch error:', err);
    }
  };
  useEffect(() => { fetchSessions(); }, []);

  const startNewSession = () => {
    setCurrentSessionId(null);
    const ctx = getPageContext(location.pathname);
    setMessages([{ id: 'welcome', sender: 'bot', text: ctx.desc, suggestions: ctx.suggestions }]);
    setIsSidebarOpen(false);
  };

  const loadSession = async (id: string) => {
    try {
      setIsLoading(true);
      const res = await api.get(`/bot/sessions/${id}/messages`);
      const loaded = res.data.map((m: any) => ({
        id: m.id, sender: m.sender, text: m.text,
        actionType: m.actionType, pendingAction: m.pendingAction, suggestions: m.suggestions,
      }));
      if (loaded.length === 0) { startNewSession(); return; }
      setMessages(loaded);
      setCurrentSessionId(id);
      setIsSidebarOpen(false);
    } catch (err) {
      console.error('Session load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const archiveSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.delete(`/bot/sessions/${id}`);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) startNewSession();
    } catch (err) {
      console.error('Session archive error:', err);
    }
  };

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'user', text }]);
    setInput('');
    setIsLoading(true);
    try {
      const payload: any = { message: text };
      if (currentSessionId) payload.session_id = currentSessionId;
      const res = await api.post('/bot/chat', payload);
      const data = res.data;
      if (data.session_id && data.session_id !== currentSessionId) {
        setCurrentSessionId(data.session_id);
        fetchSessions();
      }
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), sender: 'bot', text: data.message,
        actionType: data.action_type, pendingAction: data.pending_action, suggestions: data.suggestions,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), sender: 'bot',
        text: "Désolé, je n'ai pas pu traiter votre demande.",
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAction = async (msgId: string, actionData: any) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, pendingAction: null, text: m.text + '\n\n*Action confirmée en cours...*' } : m,
    ));
    setIsLoading(true);
    try {
      const res = await api.post('/bot/execute', { pending_action: actionData });
      const data = res.data;

      // Redirect si l'action ouvre un module (prescription, devis)
      if (data.action_type === 'redirect' && data.data?.redirect_url) {
        navigate(data.data.redirect_url);
        onClose?.();
        return;
      }

      setMessages(prev => [...prev, {
        id: Date.now().toString(), sender: 'bot',
        text: data.message || "Action exécutée avec succès.",
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now().toString(), sender: 'bot',
        text: "Erreur lors de l'exécution de l'action.",
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Ghost Brain actions
  const markAsRead = async (logId: number) => {
    setInsights(prev => prev.filter(i => i.id !== logId));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try {
      await api.post(`/ai/ghost-insights/${logId}/read`);
    } catch (err) {
      console.error('markAsRead error:', err);
    }
  };

  const markAllRead = () => { insights.forEach(i => markAsRead(i.id)); };

  const getQuickAction = (insight: GhostInsight) => {
    const text = insight.content.toLowerCase();
    if (text.includes('échéance') || text.includes('impayé') || text.includes('encaissement'))
      return { label: 'Voir Trésorerie', icon: <Zap size={10} />, onClick: () => { navigate('/accounting?tab=treasury'); onClose?.(); markAsRead(insight.id); } };
    if (text.includes('rendez-vous') || text.includes('absent'))
      return { label: 'Voir Agenda', icon: <Zap size={10} />, onClick: () => { navigate('/agenda'); onClose?.(); markAsRead(insight.id); } };
    if (insight.patient_id)
      return { label: 'Dossier Patient', icon: <ArrowRight size={10} />, onClick: () => { navigate(`/patients/${insight.patient_id}`); onClose?.(); markAsRead(insight.id); } };
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-card shadow-2xl rounded-t-[24px] sm:rounded-[24px] overflow-hidden border border-border-main relative z-50">

      {/* Sidebar overlay */}
      {isSidebarOpen && (
        <div className="absolute inset-0 bg-black/20 z-40" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={cn(
        'absolute left-0 top-0 bottom-0 w-64 bg-slate-50 border-r border-slate-200 z-50 flex flex-col transition-transform duration-300',
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">Historique</h3>
          <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-slate-200 rounded-md">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
        <div className="p-2">
          <button onClick={startNewSession} className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:border-primary hover:text-primary rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Nouvelle conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0
            ? <p className="text-xs text-center text-slate-400 mt-4">Aucune conversation</p>
            : sessions.map(session => (
              <div key={session.id} onClick={() => loadSession(session.id)}
                className={cn('group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors',
                  currentSessionId === session.id ? 'bg-primary/10 text-primary' : 'hover:bg-slate-200 text-slate-700')}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <MessageSquare size={14} className="shrink-0" />
                  <span className="text-sm truncate">{session.title}</span>
                </div>
                <button onClick={(e) => archiveSession(session.id, e)} title="Archiver"
                  className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Archive size={14} />
                </button>
              </div>
            ))
          }
        </div>
      </div>

      {/* Header + tabs */}
      <div className="flex flex-col bg-primary text-white shrink-0">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors">
              <Menu size={18} />
            </button>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Bot size={18} />
            </div>
            <div>
              <h3 className="font-bold font-outfit text-sm leading-tight">Crown Bot</h3>
              <p className="text-[10px] text-white/70">{pageCtx.title}</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex px-4 gap-1">
          <button
            onClick={() => setActiveTab('chat')}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-t-lg transition-colors',
              activeTab === 'chat' ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white/80')}
          >
            <MessageSquare size={13} /> Chat
          </button>
          <button
            onClick={() => setActiveTab('brain')}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-t-lg transition-colors relative',
              activeTab === 'brain' ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white/80')}
          >
            <BrainCircuit size={13} /> Ghost Brain
            {unreadCount > 0 && (
              <span className="ml-1 w-4 h-4 bg-amber-400 text-slate-900 text-[8px] font-black rounded-full flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── TAB: CHAT ── */}
      {activeTab === 'chat' && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {messages.map(msg => (
              <div key={msg.id} className={cn('flex gap-3', msg.sender === 'user' ? 'flex-row-reverse' : '')}>
                <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                  msg.sender === 'user' ? 'bg-slate-200 text-slate-600' : 'bg-primary/10 text-primary')}>
                  {msg.sender === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div className={cn('max-w-[80%] rounded-[16px] p-3 text-sm shadow-sm',
                  msg.sender === 'user'
                    ? 'bg-primary text-white rounded-tr-none'
                    : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none')}>
                  {msg.sender === 'bot'
                    ? <div className="prose prose-sm prose-slate max-w-none [&>p]:mb-2 [&>ul]:list-disc [&>ul]:ml-4 [&>ul]:mb-2 [&>ol]:list-decimal [&>ol]:ml-4 [&>ol]:mb-2 last:[&>*]:mb-0">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    : <div className="whitespace-pre-wrap">{msg.text}</div>
                  }

                  {msg.pendingAction && (
                    <PendingActionCard
                      action={msg.pendingAction}
                      onConfirm={() => handleConfirmAction(msg.id, msg.pendingAction)}
                      onCancel={() => setMessages(prev => prev.map(m =>
                        m.id === msg.id ? { ...m, pendingAction: null, text: m.text + '\n\n*Action annulée.*' } : m))}
                    />
                  )}

                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {msg.suggestions.map((s, i) => (
                        <button key={i} onClick={() => handleSend(s)}
                          className="px-2.5 py-1 bg-primary/5 hover:bg-primary/10 border border-primary/10 text-primary text-[11px] font-semibold rounded-full transition-colors">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Bot size={14} />
                </div>
                <div className="bg-white border border-slate-100 rounded-[16px] rounded-tl-none p-3 shadow-sm flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  <span className="text-xs text-slate-500">Crown Bot réfléchit...</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="p-3 bg-white border-t border-slate-100">
            <form onSubmit={(e) => { e.preventDefault(); handleSend(input); }} className="flex items-center gap-2">
              <input
                type="text" value={input} onChange={(e) => setInput(e.target.value)}
                placeholder="Posez votre question..."
                className="flex-1 bg-slate-100 border-none rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                disabled={isLoading}
              />
              <button type="submit" disabled={!input.trim() || isLoading}
                className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-50 hover:bg-primary-hover transition-colors shrink-0 shadow-md">
                <Send size={16} className="ml-1" />
              </button>
            </form>
          </div>
        </>
      )}

      {/* ── TAB: GHOST BRAIN ── */}
      {activeTab === 'brain' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-50/50">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping opacity-40" />
                <BrainCircuit size={14} />
              </div>
              <div>
                <p className="text-[10px] font-black text-primary uppercase tracking-widest leading-none">Ghost Brain V2</p>
                <p className="text-[8px] text-slate-400 font-bold mt-0.5">Conscience Proactive</p>
              </div>
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[9px] font-bold text-primary hover:underline">
                Tout marquer comme lu
              </button>
            )}
          </div>

          {insights.length > 0 ? insights.map(insight => {
            const quickAction = getQuickAction(insight);
            return (
              <div key={insight.id} className="p-3 bg-white border border-slate-100 rounded-2xl group hover:border-primary/30 transition-all shadow-sm hover:shadow-md">
                <div className="flex justify-between items-start mb-1">
                  <Link to={`/patients/${insight.patient_id}`} onClick={() => onClose?.()}
                    className="text-[9px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase hover:bg-primary hover:text-white transition-colors">
                    {insight.insight_type}
                  </Link>
                  <span className="text-[8px] text-slate-400 font-bold">
                    {new Date(insight.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="cursor-pointer mt-2" onClick={() => {
                  if (insight.patient_id) { navigate(`/patients/${insight.patient_id}`); onClose?.(); }
                }}>
                  <p className="text-[11px] font-medium text-slate-700 leading-relaxed">
                    <TypewriterText text={insight.content} delay={8} />
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                  <button onClick={() => markAsRead(insight.id)}
                    className="flex items-center gap-1 text-[9px] font-black text-slate-400 hover:text-green-500 transition-colors uppercase">
                    <Check size={12} /> Marquer comme lu
                  </button>
                  {quickAction && (
                    <button onClick={quickAction.onClick}
                      className="flex items-center gap-1.5 text-[9px] font-black bg-primary/10 text-primary px-2 py-1 rounded-lg hover:bg-primary hover:text-white transition-colors uppercase">
                      {quickAction.icon} {quickAction.label}
                    </button>
                  )}
                </div>
              </div>
            );
          }) : (
            <div className="text-center py-10 flex flex-col items-center gap-2">
              <Check size={24} className="text-primary/30" />
              <p className="text-[10px] font-bold text-slate-400 italic">Aucune nouvelle déduction.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
