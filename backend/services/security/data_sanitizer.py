"""
DataSanitizer v2 — Mur de confidentialité entre les données patient et le LLM.

Règle absolue : le LLM ne voit jamais de données nominatives, financières ou médicales.
Le dispatcher lit les données depuis la DB directement — les réponses du bot ne repassent
JAMAIS par le LLM.
"""
import re
import logging
from typing import Tuple, Dict

logger = logging.getLogger(__name__)

# Termes dentaires/médicaux et mots courants à NE PAS anonymiser même s'ils sont capitalisés.
# Ces mots sont des entités fonctionnelles du domaine, pas des noms propres.
DENTAL_WHITELIST = {
    # Jours / temps
    "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
    "aujourd", "demain", "hier", "prochain", "prochaine", "semaine",
    # Intents / UI
    "agenda", "planning", "rdv", "consultation", "urgence", "aide", "help",
    "créer", "créez", "créons", "prendre", "prenez", "prends",
    "annuler", "confirmer", "modifier",
    # Domaine dentaire
    "couronne", "bridge", "implant", "extraction", "détartrage", "détartrer",
    "orthodontie", "endodontie", "prothèse", "facette", "blanchiment",
    "composite", "inlay", "onlay", "zircone", "céramique",
    "ordonnance", "prescription", "devis", "acte", "soin", "traitement",
    # Finance
    "recette", "revenu", "finance", "impayé", "dette", "créance",
    "paiement", "encaissement", "trésorerie",
    # Générique
    "patient", "dossier", "fiche", "cabinet", "clinique", "labo", "laboratoire",
    "bonjour", "bonsoir", "salut", "merci", "oui", "non",
}


class DataSanitizer:
    """
    Anonymise les données sensibles avant envoi au LLM.
    Restaure les tokens dans la réponse du LLM.
    """

    def __init__(self):
        self._phone_re = re.compile(
            r"(?:(?:\+|00)33|0)\s*[1-9](?:[\s.\-]*\d{2}){4}"
            r"|(?:(?:\+|00)212|0)[5-7](?:[\s.\-]*\d{2}){4}"
        )
        self._email_re = re.compile(
            r"[a-zA-Z0-9_.+\-]+@[a-zA-Z0-9\-]+\.[a-zA-Z0-9.\-]+"
        )
        self._amount_re = re.compile(
            r"\b\d[\d\s]*(?:MAD|DH|dh|€|\$|EUR)\b",
            re.IGNORECASE,
        )
        self._patient_id_re = re.compile(
            r"(?:patient|dossier)\s*(?:n[°o]?\s*|#)?(\d+)",
            re.IGNORECASE,
        )
        # Noms propres capitalisés non présents dans la whitelist
        self._name_re = re.compile(
            r"\b([A-ZÀ-Ü][a-zà-ÿ]{2,}(?:[\s\-][A-ZÀ-Ü][a-zà-ÿ]{2,})?)\b"
        )

    # ── PUBLIC API ────────────────────────────────────────────────────────────

    def sanitize(self, text: str) -> Tuple[str, Dict[str, str]]:
        """
        Remplace les données sensibles par des tokens opaques.
        Retourne (texte_masqué, mapping_token→valeur_originale).
        """
        mapping: Dict[str, str] = {}
        counters: Dict[str, int] = {}

        def replace(entity_type: str, value: str) -> str:
            # Réutiliser le token si la valeur a déjà été vue
            existing = next((t for t, v in mapping.items() if v == value), None)
            if existing:
                return existing
            n = counters.get(entity_type, 1)
            token = f"[{entity_type}_{n}]"
            mapping[token] = value
            counters[entity_type] = n + 1
            return token

        result = text

        # 1. Emails (avant les noms pour éviter les chevauchements)
        result = self._email_re.sub(lambda m: replace("EMAIL", m.group(0)), result)

        # 2. Téléphones
        result = self._phone_re.sub(lambda m: replace("PHONE", m.group(0)), result)

        # 3. Montants financiers
        result = self._amount_re.sub(lambda m: replace("AMOUNT", m.group(0)), result)

        # 4. Dates naturelles en français (via dateparser)
        result = self._mask_dates(result, mapping, counters)

        # 5. IDs patient/dossier — masquer le numéro uniquement, garder le mot-clé
        def _mask_pid(m: re.Match) -> str:
            token = replace("PID", m.group(1))
            # garder le préfixe ("patient ", "dossier ")
            return m.group(0).replace(m.group(1), token)

        result = self._patient_id_re.sub(_mask_pid, result)

        # 6. Noms propres (non whitelistés)
        result = self._name_re.sub(
            lambda m: replace("NAME", m.group(0))
            if m.group(0).lower() not in DENTAL_WHITELIST
            else m.group(0),
            result,
        )

        return result, mapping

    def restore(self, text: str, mapping: Dict[str, str]) -> str:
        """
        Réinjecte les valeurs originales dans la réponse du LLM.
        Logue un avertissement pour tout token non résolu.
        """
        restored = text
        for token, original in mapping.items():
            restored = restored.replace(token, original)

        # Détecter les tokens orphelins (le LLM a inventé un token non mappé)
        orphans = re.findall(r"\[[A-Z]+_\d+\]", restored)
        if orphans:
            logger.warning("DataSanitizer: tokens non résolus dans la réponse LLM : %s", orphans)
            # Supprimer les tokens orphelins plutôt que de les laisser fuiter
            for orphan in orphans:
                restored = restored.replace(orphan, "")

        return restored.strip()

    def sanitize_bot_response(self, text: str) -> str:
        """
        Sanitize une réponse du bot avant qu'elle ne soit passée comme contexte
        à un futur appel LLM. Retourne uniquement le texte masqué (sans mapping —
        les données du contexte ne doivent jamais être restaurées dans la réponse LLM).
        """
        sanitized, _ = self.sanitize(text)
        return sanitized

    # ── PRIVATE ───────────────────────────────────────────────────────────────

    def _mask_dates(
        self, text: str, mapping: Dict[str, str], counters: Dict[str, int]
    ) -> str:
        """
        Détecte les dates naturelles (ex: 'demain', 'lundi prochain', '15 juin')
        et les remplace par des tokens DATE_N.
        """
        try:
            from dateparser.search import search_dates

            found = search_dates(
                text,
                languages=["fr", "ar"],
                settings={"PREFER_DATES_FROM": "future", "STRICT_PARSING": False},
            )
            if not found:
                return text

            # Trier par position décroissante pour remplacer sans décaler les index
            found_sorted = sorted(
                found, key=lambda x: text.find(x[0]), reverse=True
            )
            result = text
            for date_text, _ in found_sorted:
                if not date_text.strip():
                    continue
                # Réutiliser ou créer un token
                existing = next(
                    (t for t, v in mapping.items() if v == date_text), None
                )
                if existing:
                    token = existing
                else:
                    n = counters.get("DATE", 1)
                    token = f"[DATE_{n}]"
                    mapping[token] = date_text
                    counters["DATE"] = n + 1
                result = result.replace(date_text, token, 1)
            return result

        except Exception as e:
            logger.warning("DataSanitizer: dateparser indisponible (%s), masquage dates ignoré", e)
            return text


# Singleton
data_sanitizer = DataSanitizer()
