"""
Crown Bot — Intent Parser (100% Déterministe)

Analyse le message utilisateur et extrait :
- L'intent (action demandée)
- Les entités (patient, date, dent, médicament…)
- Le score de confiance

Aucun LLM ici. Regex + keywords + scoring.
"""
import re
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ParsedIntent:
    intent: str
    confidence: float
    entities: Dict[str, Any] = field(default_factory=dict)
    raw_message: str = ""
    needs_clarification: bool = False
    clarification_prompt: str = ""


# ── PATTERNS D'ENTITÉS ──────────────────────────────────────────────────────

PATIENT_PATTERNS = [
    # "patient 12", "patient n°12", "patient #12"
    re.compile(r"patient\s*(?:n[°o]?\s*|#)?(\d+)", re.IGNORECASE),
    # "dossier 12"
    re.compile(r"dossier\s*(?:n[°o]?\s*|#)?(\d+)", re.IGNORECASE),
]

PATIENT_NAME_PATTERN = re.compile(
    r"(?:patient|dossier|pour|de|sur|info(?:rmation)?s?\s+(?:sur|de))\s+"
    r"([A-ZÀ-Ü][a-zà-ÿ]+(?:\s+[A-ZÀ-Ü][a-zà-ÿ]+)?)",
    re.IGNORECASE
)

TOOTH_PATTERN = re.compile(r"(?:dent|tooth)\s*(?:n[°o]?\s*)?(\d{2})", re.IGNORECASE)
TOOTH_INLINE = re.compile(r"\b([1-4][1-8])\b")

TIME_PATTERN = re.compile(r"(\d{1,2})[hH:](\d{0,2})")
DATE_PATTERNS = {
    "aujourd'hui": 0, "auj": 0, "today": 0,
    "demain": 1, "tomorrow": 1,
    "après-demain": 2, "après demain": 2,
}
DATE_EXPLICIT = re.compile(r"(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?")
DATE_WEEKDAY = re.compile(
    r"(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)",
    re.IGNORECASE
)
WEEKDAY_MAP = {
    "lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3,
    "vendredi": 4, "samedi": 5, "dimanche": 6
}

DURATION_PATTERN = re.compile(r"(\d+)\s*(?:min(?:utes?)?|mn)", re.IGNORECASE)

from backend.services.bot.intents_config import INTENT_PATTERNS

# Boosters : des patterns regex qui augmentent la confiance d'un intent
INTENT_BOOSTERS = {
    "QUERY_AGENDA": [
        re.compile(r"(?:rdv|rendez.vous|agenda)\s+(?:de|du|d')", re.I),
        re.compile(r"(?:demain|aujourd|lundi|mardi|mercredi|jeudi|vendredi)", re.I),
    ],
    "CREATE_APPOINTMENT": [
        re.compile(r"(?:prends?|ajoute|créer?|planifie)", re.I),
        re.compile(r"(?:rdv|rendez.vous)\s+(?:pour|avec)", re.I),
    ],
    "CREATE_PRESCRIPTION": [
        re.compile(r"(?:ordonnance|prescrire?)\s+(?:pour|post|après)", re.I),
    ],
    "CREATE_DEVIS": [
        re.compile(r"(?:devis|chiffre|estimation)\s+(?:pour|couronne|bridge|implant)", re.I),
    ],
    "QUERY_PATIENT": [
        re.compile(r"(?:info|dossier|fiche)\s+(?:sur|de|du|patient)", re.I),
    ],
}

# Motifs de traitement dentaire pour l'extraction d'entités
DENTAL_PROCEDURES = {
    "couronne": "COURONNE",
    "bridge": "BRIDGE",
    "implant": "IMPLANT",
    "extraction": "EXTRACTION",
    "détartrage": "DETARTRAGE",
    "detartrage": "DETARTRAGE",
    "consultation": "CONSULTATION",
    "contrôle": "CONTROLE",
    "controle": "CONTROLE",
    "soins": "SOINS",
    "orthodontie": "ORTHODONTIE",
    "prothèse": "PROTHESE",
    "prothese": "PROTHESE",
    "endodontie": "ENDODONTIE",
    "canal": "TRAITEMENT_CANAL",
    "inlay": "INLAY",
    "onlay": "ONLAY",
    "facette": "FACETTE",
    "blanchiment": "BLANCHIMENT",
    "céramique": "CERAMIQUE",
    "ceramique": "CERAMIQUE",
    "zircone": "ZIRCONE",
    "céramo-métallique": "CERAMO_METALLIQUE",
}


class IntentParser:
    """Parseur d'intentions 100% déterministe pour Crown Bot."""

    def parse(self, message: str, context: list | None = None) -> ParsedIntent:
        """Analyse un message et retourne l'intent le plus probable."""
        if not message or not message.strip():
            return ParsedIntent(
                intent="HELP", confidence=1.0,
                raw_message=message,
            )

        normalized = self._normalize(message)
        intent, confidence = self._match_intent(normalized, prior_context=context or [])
        entities = self._extract_entities(normalized, intent)

        # Vérifier si des entités critiques manquent
        needs_clarification, clarification_prompt = self._check_completeness(
            intent, entities
        )

        return ParsedIntent(
            intent=intent,
            confidence=confidence,
            entities=entities,
            raw_message=message,
            needs_clarification=needs_clarification,
            clarification_prompt=clarification_prompt,
        )

    def _normalize(self, text: str) -> str:
        """Normalise le texte (lowercase, trim, espace unique)."""
        text = text.strip().lower()
        text = re.sub(r"\s+", " ", text)
        return text

    def _match_intent(self, text: str, prior_context: list | None = None) -> Tuple[str, float]:
        """Identifie l'intent avec scoring multi-critères."""
        scores: Dict[str, float] = {}

        try:
            from thefuzz import fuzz
            use_fuzz = True
        except ImportError:
            use_fuzz = False

        for intent_name, keywords, base_conf in INTENT_PATTERNS:
            keyword_hits = 0
            for kw in keywords:
                if use_fuzz:
                    if fuzz.partial_ratio(kw, text) > 80:
                        keyword_hits += 1
                else:
                    if kw in text:
                        keyword_hits += 1
                        
            if keyword_hits == 0:
                continue
            # Score = base * (1 + bonus par keyword supplémentaire)
            score = base_conf * (1 + 0.05 * (keyword_hits - 1))

            # Appliquer les boosters regex
            for booster in INTENT_BOOSTERS.get(intent_name, []):
                if booster.search(text):
                    score = min(score + 0.08, 1.0)

            scores[intent_name] = min(score, 1.0)

        if not scores:
            # Fallback : si le message contient un nom de patient ou un ID
            for pat in PATIENT_PATTERNS:
                if pat.search(text):
                    return "QUERY_PATIENT", 0.70
            if PATIENT_NAME_PATTERN.search(text):
                return "SEARCH_PATIENT", 0.65

            # Contexte : si le dernier bot message était un write_pending,
            # le message courant est probablement une clarification pour ce même intent
            prior_intent = self._extract_prior_intent(prior_context or [])
            if prior_intent:
                return prior_intent, 0.75

            return "UNKNOWN", 0.0

        best_intent = max(scores, key=scores.get)  # type: ignore
        return best_intent, scores[best_intent]

    def _extract_prior_intent(self, context: list) -> str:
        """
        Si le dernier message bot du contexte était un 'write_pending',
        retourne l'intent correspondant pour guider le parser sur les clarifications.
        """
        for turn in reversed(context):
            if turn.get("role") == "bot":
                content = turn.get("content", "")
                # Cherche des marqueurs de pending dans le texte sanitizé
                if "CREATE_APPOINTMENT" in content or "Nouveau RDV" in content:
                    return "CREATE_APPOINTMENT"
                if "OPEN_PRESCRIPTION" in content or "Ordonnance" in content:
                    return "CREATE_PRESCRIPTION"
                if "OPEN_DEVIS" in content or "Devis" in content:
                    return "CREATE_DEVIS"
                break
        return ""

    def _extract_entities(self, text: str, intent: str) -> Dict[str, Any]:
        """Extrait les entités pertinentes du message."""
        entities: Dict[str, Any] = {}

        # Patient ID
        for pat in PATIENT_PATTERNS:
            m = pat.search(text)
            if m:
                entities["patient_id"] = int(m.group(1))
                break

        # Patient Name
        m = PATIENT_NAME_PATTERN.search(text)
        if m and "patient_id" not in entities:
            entities["patient_name"] = m.group(1).strip()

        # Dent
        m = TOOTH_PATTERN.search(text)
        if m:
            entities["tooth_number"] = m.group(1)
        elif intent in ("CREATE_DEVIS", "CREATE_PRESCRIPTION"):
            # Chercher un numéro de dent inline (11-48)
            for m2 in TOOTH_INLINE.finditer(text):
                num = int(m2.group(1))
                if 11 <= num <= 48:
                    entities["tooth_number"] = str(num)
                    break

        # Date
        target_date = self._extract_date(text)
        if target_date:
            entities["target_date"] = target_date.isoformat()

        # Heure
        m = TIME_PATTERN.search(text)
        if m:
            hour = int(m.group(1))
            minute = int(m.group(2)) if m.group(2) else 0
            if 0 <= hour <= 23 and 0 <= minute <= 59:
                entities["time"] = f"{hour:02d}:{minute:02d}"

        # Durée
        m = DURATION_PATTERN.search(text)
        if m:
            entities["duration_minutes"] = int(m.group(1))

        # Procédure dentaire
        for keyword, code in DENTAL_PROCEDURES.items():
            if keyword in text:
                entities["procedure"] = code
                entities["motif"] = keyword.capitalize()
                break

        # Motif libre (pour RDV) — fallback
        if "motif" not in entities and intent == "CREATE_APPOINTMENT":
            motif_match = re.search(r"(?:pour|motif)\s+(.+?)(?:\s+(?:à|a|le|demain|$))", text)
            if motif_match:
                entities["motif"] = motif_match.group(1).strip().capitalize()

        return entities

    def _extract_date(self, text: str) -> Optional[datetime]:
        """Extrait une date du message."""
        try:
            from dateparser.search import search_dates
            # Utilisation de dateparser pour extraire la date
            parsed_dates = search_dates(text, languages=['fr'], settings={'PREFER_DATES_FROM': 'future', 'STRICT_PARSING': True})
            if parsed_dates:
                # parsed_dates est une liste de tuples: (text, datetime)
                # On prend la date la plus pertinente (souvent la dernière ou celle avec le plus de mots)
                best_match = max(parsed_dates, key=lambda x: len(x[0]))
                return best_match[1].replace(hour=0, minute=0, second=0, microsecond=0)
        except Exception as e:
            logger.error(f"Erreur dateparser: {e}")
            
        return None

    def _check_completeness(
        self, intent: str, entities: Dict[str, Any]
    ) -> Tuple[bool, str]:
        """Vérifie si toutes les entités nécessaires sont présentes."""
        if intent == "CREATE_APPOINTMENT":
            missing = []
            if "patient_name" not in entities and "patient_id" not in entities:
                missing.append("le nom du patient")
            if "target_date" not in entities:
                missing.append("la date")
            if "time" not in entities:
                missing.append("l'heure")
            if missing:
                return True, f"Pour créer le RDV, j'ai besoin de : {', '.join(missing)}."

        elif intent == "CREATE_PRESCRIPTION":
            if "patient_name" not in entities and "patient_id" not in entities:
                return True, "Pour quelle patient cette ordonnance ?"

        elif intent == "CREATE_DEVIS":
            missing = []
            if "patient_name" not in entities and "patient_id" not in entities:
                missing.append("le nom du patient")
            if "procedure" not in entities:
                missing.append("le type de soin (couronne, bridge, implant…)")
            if missing:
                return True, f"Pour le devis, j'ai besoin de : {', '.join(missing)}."

        elif intent == "QUERY_PATIENT":
            if "patient_name" not in entities and "patient_id" not in entities:
                return True, "Quel patient ? Donnez-moi un nom ou un numéro de dossier."

        return False, ""


# Singleton
intent_parser = IntentParser()
