import os
import json
import httpx
import logging
from typing import Dict, Any, Optional
from backend.services.bot.intent_parser import ParsedIntent, intent_parser as fallback_parser

logger = logging.getLogger(__name__)

class LLMIntentParser:
    def __init__(self):
        self.fallback_parser = fallback_parser
        # Par defaut: on vise une API compatible OpenAI (Ollama en local, Groq, ou OpenAI)
        self.api_base = os.getenv("LLM_API_BASE", "http://localhost:11434/v1")
        self.api_key = os.getenv("LLM_API_KEY", "ollama")
        self.model = os.getenv("LLM_MODEL", "llama3")
        self.timeout = float(os.getenv("LLM_TIMEOUT", "3.0")) # Timeout court pour vite fallback
        
        self.system_prompt = """Tu es l'assistant IA déterministe 'Crown Bot' d'un logiciel dentaire.
Ta seule tâche est d'analyser le message de l'utilisateur et d'en extraire l'intention principale et les entités au format JSON stricte.
Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte, explication, ni bloc de code Markdown autour.

Liste des intentions exactes (choisis-en une seule):
- SEARCH_PATIENT
- QUERY_PATIENT
- QUERY_AGENDA
- QUERY_FINANCE
- QUERY_LAB
- QUERY_STATS
- QUERY_ALERTS
- CREATE_APPOINTMENT
- CREATE_PRESCRIPTION
- CREATE_DEVIS
- CHANGE_STATUS
- QUERY_KNOWLEDGE
- HELP
- GREETING
- UNKNOWN

Entités possibles (toutes optionnelles, mets des chaînes vides si inconnu):
- patient_name (string): le nom de famille ou prénom complet du patient
- date (string): la date demandée (ex: "demain", "lundi", "01/01/2026")
- motif (string): le motif de la consultation
- tooth (string): le numéro de la dent (ex: "46", "32")

Exemple de sortie :
{"intent": "CREATE_APPOINTMENT", "entities": {"patient_name": "Bennani", "date": "demain", "motif": "carie", "tooth": ""}}
"""

    def parse(self, message: str, context: list | None = None) -> ParsedIntent:
        from backend.services.security.data_sanitizer import data_sanitizer

        # 1. Anonymisation du message courant
        sanitized_message, mapping = data_sanitizer.sanitize(message)

        # 2. Construire les messages LLM avec contexte conversationnel sanitizé
        messages: list = [{"role": "system", "content": self.system_prompt}]
        for turn in (context or []):
            role = "assistant" if turn.get("role") == "bot" else "user"
            sanitized_content, _ = data_sanitizer.sanitize(turn.get("content", ""))
            messages.append({"role": role, "content": sanitized_content})
        messages.append({"role": "user", "content": sanitized_message})

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    f"{self.api_base}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": self.model,
                        "messages": messages,
                        "temperature": 0.0,
                        "response_format": {"type": "json_object"}
                    }
                )
                
            if response.status_code == 200:
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                
                # Nettoyage si le modèle a rajouté du texte autour du JSON
                if "{" in content and "}" in content:
                    content = content[content.find("{") : content.rfind("}") + 1]
                
                parsed_json = json.loads(content)
                
                # 2. Restauration des données (De-anonymisation)
                # On restaure chaque valeur dans le dictionnaire des entités
                entities = parsed_json.get("entities", {})
                for key, val in entities.items():
                    if isinstance(val, str):
                        entities[key] = data_sanitizer.restore(val, mapping)
                        
                intent_str = parsed_json.get("intent", "UNKNOWN")
                entities = self._normalize_entities(entities)

                logger.info(f"LLM parsed intent: {intent_str} with entities: {entities}")

                return ParsedIntent(
                    intent=intent_str,
                    confidence=0.9,
                    entities=entities,
                    raw_message=message
                )
            else:
                logger.warning(f"LLM API Error {response.status_code}: {response.text}. Fallback to Regex.")
                return self.fallback_parser.parse(message)
                
        except Exception as e:
            logger.warning(f"LLM parsing failed ({e}). Fallback to Regex.")
            return self.fallback_parser.parse(message, context=context)

    def _normalize_entities(self, entities: dict) -> dict:
        """Aligne les clés LLM sur le schéma attendu par l'ActionDispatcher."""
        key_map = {
            "date": "target_date",
            "tooth": "tooth_number",
        }
        return {key_map.get(k, k): v for k, v in entities.items() if v}


llm_parser = LLMIntentParser()
