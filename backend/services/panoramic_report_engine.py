import datetime
import logging
import os
import json
import httpx
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

ANOMALY_LABELS = {
    'carie_email': "Carie de l'émail",
    'carie_dentinaire': "Carie dentinaire",
    'carie_profonde': "Carie profonde (Pulpaire)",
    'reprise_carie': "Reprise sous obturation",
    'obturation_comp': "Obturation composite/amalgame",
    'obturation_debord': "Obturation débordante",
    'lesion_periapicale': "Lésion périapicale (Kyste)",
    'elargissement_desmo': "Élargissement desmodontal",
    'tr_adequat': "Traitement canalaire adéquat",
    'tr_incomplet': "Traitement canalaire incomplet",
    'depassement_pate': "Dépassement de pâte",
    'instrument_fracture': "Instrument fracturé",
    'perforation': "Faux-canal (Perforation)",
    'alveolyse_h': "Alvéolyse horizontale",
    'alveolyse_v': "Alvéolyse verticale",
    'furcation': "Atteinte de la furcation",
    'tartre': "Tartre sous-gingival",
    'agenesie': "Agénésie (Dent manquante)",
    'surnumeraire': "Dent surnuméraire",
    'incluse': "Dent incluse",
    'enclavee': "Dent enclavée",
    'reste_radiculaire': "Reste radiculaire",
    'resorption': "Résorption radiculaire",
    'couronne': "Couronne unitaire",
    'bridge': "Bridge prothétique",
    'implant': "Implant dentaire",
    'peri_implantite': "Péri-implantite",
    'infiltration_prothese': "Infiltration sous prothèse",
    'opacite_sinus': "Opacité sinusienne",
    'racine_sinus': "Racine dans le sinus",
    'condyle_asymetrie': "Asymétrie condylienne",
    'arthrose_atm': "Arthrose ATM",
    'calcification': "Calcification (Carotide/Sial.)",
}

CCAM_SUGGESTIONS = {
    'carie_email': "HBMD038 (Restauration 1 face)",
    'carie_dentinaire': "HBMD042 (Restauration 2 faces)",
    'carie_profonde': "HBMD044 (Restauration 3 faces+) / HBFD033 (Endo)",
    'reprise_carie': "HBMD042 (Dépose et restauration)",
    'lesion_periapicale': "HBGD035 (Résection apicale) / Retraitement canalaire",
    'tr_incomplet': "HBFD033 (Retraitement endo)",
    'incluse': "HBGD036 (Extraction dent incluse)",
    'reste_radiculaire': "HBGD031 (Extraction de racine)",
    'implant': "LBLD015 (Pose d'implant)",
    'couronne': "HBLD018 (Pose de couronne)",
    'bridge': "HBLD023 (Bridge de 3 éléments)",
    'tartre': "HBJD001 (Détartrage complet)",
}

class PanoramicReportEngine:

    """
    Générateur de rapport Panoramique ELITE (v2.0).
    Structure le bilan par secteurs et catégories cliniques pour une lecture professionnelle.
    """
    def generate_markdown(self, detections: List[Dict] = None, manual_anomalies: Dict[int, List[str]] = None) -> str:
        try:
            if isinstance(detections, dict):
                detections = detections.get("detections", [])
            detections = detections or []
            manual_anomalies = manual_anomalies or {}
            
            teeth_map = {}
            for d in detections:
                fdi = int(d.get("fdi") or d.get("tooth") or 0)
                if fdi == 0: continue
                if fdi not in teeth_map: teeth_map[fdi] = set()
                label = d.get("label", d.get("pathology", "Anomalie"))
                teeth_map[fdi].add(label)
                
            for fdi_str, anomalies in manual_anomalies.items():
                fdi = int(fdi_str)
                if fdi not in teeth_map: teeth_map[fdi] = set()
                for a in anomalies:
                    label = ANOMALY_LABELS.get(a, a)
                    teeth_map[fdi].add(label)

            pathology_map = {}
            for fdi, pathologies in teeth_map.items():
                for p in pathologies:
                    if p not in pathology_map:
                        pathology_map[p] = []
                    pathology_map[p].append(fdi)
                    
            for p in pathology_map:
                pathology_map[p].sort()

            lines = []
            
            lines.append("### TECHNIQUE")
            lines.append("- Examen réalisé par un appareil numérique permettant un seul scannage à faible dose de rayonnement.")
            lines.append("")
            
            lines.append("### RÉSULTATS")
            lines.append("- Dentition de type adulte.")
            
            for path, fdis in pathology_map.items():
                if len(fdis) == 1:
                    fdis_str = f"la dent {fdis[0]}"
                elif len(fdis) == 2:
                    fdis_str = f"les dents {fdis[0]} et {fdis[1]}"
                else:
                    fdis_str = f"les dents {', '.join(str(f) for f in fdis[:-1])} et {fdis[-1]}"
                    
                path_lower = path.lower()
                
                if "carie" in path_lower:
                    lines.append(f"- Lésions carieuses au niveau de {fdis_str}.")
                elif "kyste" in path_lower or "périapicale" in path_lower:
                    lines.append(f"- Lésion périapicale / Granulome sur {fdis_str}.")
                elif "couronne" in path_lower or "implant" in path_lower or "bridge" in path_lower:
                    lines.append(f"- Matériel prothétique ({path}) en place sur {fdis_str}.")
                elif "incluse" in path_lower or "enclavée" in path_lower:
                    lines.append(f"- Dent(s) en inclusion / enclavée(s) : {fdis_str}.")
                elif "reste" in path_lower or "radiculaire" in path_lower:
                    lines.append(f"- Racines résiduelles de {fdis_str}.")
                elif "obturation" in path_lower or "composite" in path_lower:
                    lines.append(f"- Matériel radio-opaque (obturation) sur {fdis_str}.")
                elif "canalaire" in path_lower:
                    lines.append(f"- Traitement canalaire sur {fdis_str}.")
                elif "alvéolyse" in path_lower:
                    lines.append(f"- Alvéolyse visible au niveau de {fdis_str}.")
                else:
                    lines.append(f"- {path} objectivé(e) sur {fdis_str}.")

            sinus_roots = [f for f in teeth_map.keys() if f in [17, 16, 15, 27, 26, 25]]
            if sinus_roots:
                if len(sinus_roots) == 1:
                    lines.append(f"- La racine de la dent {sinus_roots[0]} arrive au contact du plancher sinusien.")
                else:
                    s_str = ", ".join(str(f) for f in sorted(sinus_roots))
                    lines.append(f"- Les racines des dents {s_str} font saillie ou arrivent au contact du plancher sinusien.")

            mandibular_roots = [f for f in teeth_map.keys() if f in [38, 37, 48, 47]]
            if mandibular_roots:
                if len(mandibular_roots) == 1:
                    lines.append(f"- La racine de la dent {mandibular_roots[0]} arrive au contact du canal mandibulaire.")
                else:
                    m_str = ", ".join(str(f) for f in sorted(mandibular_roots))
                    lines.append(f"- Proximité entre les racines des dents {m_str} et le canal mandibulaire.")
            else:
                lines.append("- Canal mandibulaire à distance des racines dentaires.")

            # Détections clés pour conditionner les phrases de normalité
            all_pathologies_lower = [p.lower() for p in pathology_map.keys()]
            all_labels_lower = [label.lower() for labels in teeth_map.values() for label in labels]
            combined_lower = all_pathologies_lower + all_labels_lower

            has_sinus_opacity = any("sinus" in p or "opacité" in p for p in combined_lower)
            has_bone_lesion = any(k in combined_lower for k in [
                "alvéolyse", "lésion osseuse", "kyste", "granulome", "périapicale", "résorption"
            ])
            has_atm_issue = any(k in combined_lower for k in ["arthrose", "condyle", "atm", "asymétrie"])

            # Sinus — conditionnel
            if not has_sinus_opacity:
                lines.append("- Transparence normale des cuvettes des sinus maxillaires.")
            else:
                lines.append("- Opacité sinusienne objectivée (voir détections ci-dessus).")

            # Cloison nasale — invariant acceptable
            lines.append("- Cloison nasale médiane.")

            # Lésions osseuses et ATM — conditionnel
            if not has_bone_lesion and not has_atm_issue:
                lines.append("- Absence de lésion osseuse d'allure suspecte et respect des articulations temporo-mandibulaires.")
            elif not has_bone_lesion:
                lines.append("- Absence de lésion osseuse d'allure suspecte. Articulations temporo-mandibulaires : voir détections ci-dessus.")
            elif not has_atm_issue:
                lines.append("- Lésions osseuses objectivées (voir détections ci-dessus). Respect des articulations temporo-mandibulaires.")
            else:
                lines.append("- Lésions osseuses et anomalies des articulations temporo-mandibulaires objectivées (voir détections ci-dessus).")

            # Ajout de la Synthèse IA (Protégée par le Data Firewall)
            try:
                base_report_text = "\n".join(lines[3:]) # On envoie juste les résultats cliniques
                ai_synthesis = self._generate_ai_synthesis(base_report_text)
                if ai_synthesis:
                    lines.insert(0, "")
                    lines.insert(0, ai_synthesis)
                    lines.insert(0, "### SYNTHÈSE DU RADIOLOGUE")
            except Exception as e:
                logger.warning(f"Impossible de générer la synthèse IA: {e}")

            return "\n".join(lines)
            
        except Exception as e:
            logger.error(f"Erreur Report Engine : {e}")
            return "## Erreur lors de la génération du rapport."

    def _generate_ai_synthesis(self, clinical_text: str) -> str:
        """Appelle Groq pour générer un paragraphe de synthèse, tout en protégeant les données PII."""
        # 1. Le Mur : Anonymisation
        from backend.services.security.data_sanitizer import data_sanitizer
        sanitized_text, mapping = data_sanitizer.sanitize(clinical_text)
        
        prompt = (
            "Agis comme un expert radiologue dentaire. "
            "Voici les anomalies détectées de manière déterministe sur une radio panoramique:\n"
            f"{sanitized_text}\n"
            "Rédige un court paragraphe (3-4 phrases max) de synthèse clinique globale pour le praticien. "
            "Sois très professionnel, concis, et souligne l'urgence s'il y en a une (ex: multiples caries profondes). "
            "Ne liste pas à nouveau les dents une par une. "
            "Réponds uniquement avec le paragraphe, sans fioritures ni salutations."
        )

        api_base = os.getenv("LLM_API_BASE", "http://localhost:11434/v1")
        api_key = os.getenv("LLM_API_KEY", "ollama")
        model = os.getenv("LLM_MODEL", "llama3")

        try:
            with httpx.Client(timeout=4.0) as client:
                response = client.post(
                    f"{api_base}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2,
                        "max_tokens": 150
                    }
                )
                response.raise_for_status()
                result_text = response.json()["choices"][0]["message"]["content"].strip()
                
                # 2. Le Mur : Restauration des vraies données
                final_text = data_sanitizer.restore(result_text, mapping)
                return final_text
        except Exception as e:
            logger.warning(f"Erreur appel LLM dans panoramic_report_engine: {e}")
            return ""

panoramic_report_engine = PanoramicReportEngine()
