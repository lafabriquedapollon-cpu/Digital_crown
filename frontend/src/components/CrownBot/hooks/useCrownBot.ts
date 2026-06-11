import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';

// Le type de réponse retournée par le backend
export interface BotResponse {
  message: string;
  data?: any;
  action_type: 'info' | 'read' | 'write_pending' | 'clarification' | 'error';
  pending_action?: {
    type: string;
    params: any;
  };
  suggestions?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
  action_type?: string;
  pending_action?: any;
  suggestions?: string[];
  data?: any;
}

export const useCrownBot = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charger l'historique initial si désiré (ou un mot d'accueil)
  useEffect(() => {
    setMessages([
      {
        id: 'init',
        role: 'bot',
        content: "Bonjour. Je suis **Crown Bot**, votre assistant omniscient. Que puis-je faire pour vous aujourd'hui ?",
        timestamp: new Date(),
        suggestions: ["Agenda d'aujourd'hui", "Info patient", "Recettes du mois", "Aide"]
      }
    ]);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const userMessageId = Date.now().toString();
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/bot/chat', { message: text });
      const botData: BotResponse = response.data;

      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: botData.message,
        timestamp: new Date(),
        action_type: botData.action_type,
        pending_action: botData.pending_action,
        suggestions: botData.suggestions,
        data: botData.data
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (err: any) {
      console.error('Bot request failed:', err);
      setError(err.response?.data?.detail || "Erreur de connexion au bot.");
      
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: "Désolé, une erreur est survenue lors du traitement de votre demande.",
        timestamp: new Date(),
        action_type: 'error'
      }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([
      {
        id: 'init',
        role: 'bot',
        content: "Historique effacé. En quoi puis-je vous aider ?",
        timestamp: new Date(),
        suggestions: ["Agenda d'aujourd'hui", "Aide"]
      }
    ]);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearHistory
  };
};
