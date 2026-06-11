import logging
import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Dict, Any, List, Optional

from backend import models, schemas
from backend.services.ai_advisor import ai_advisor

logger = logging.getLogger(__name__)

MOTIF_CATALOG: Dict[str, Dict] = {
    "douleur_aigue":       {"label": "Douleur dentaire aiguë",        "urgency": "urgence",  "specialties": ["ENDODONTIE"],                       "acts": ["Traitement canalaire mono-radiculé", "Pulpotomie"]},
    "douleur_mastication": {"label": "Douleur à la mastication",       "urgency": "urgence",  "specialties": ["CONSERVATRICE", "PROTHESE"],         "acts": ["Composite 1 face", "Couronne zircone"]},
    "douleur_pression":    {"label": "Douleur à la percussion",        "urgency": "urgence",  "specialties": ["ENDODONTIE"],                       "acts": ["Traitement canalaire bi-radiculé", "Retraitement canalaire"]},
    "sensibilite_chaud_froid": {"label": "Sensibilité thermique",      "urgency": "normal",   "specialties": ["CONSERVATRICE", "ENDODONTIE"],      "acts": ["Traitement hypersensibilité", "Pulpectomie"]},
    "douleur_nocturne":    {"label": "Douleur nocturne",               "urgency": "urgence",  "specialties": ["ENDODONTIE"],                       "acts": ["Traitement canalaire mono-radiculé"]},
    "douleur_gingivale":   {"label": "Douleur gingivale",              "urgency": "normal",   "specialties": ["PARODONTOLOGIE", "CHIRURGIE"],      "acts": ["Détartrage & Polissage", "Curetage parodontal"]},
    "abces":               {"label": "Abcès dentaire",                  "urgency": "urgence",  "specialties": ["ENDODONTIE", "CHIRURGIE"],          "acts": ["Pulpectomie", "Extraction chirurgicale"]},
    "gonflement_facial":   {"label": "Gonflement facial",              "urgency": "urgence",  "specialties": ["CHIRURGIE"],                        "acts": ["Extraction chirurgicale", "Alvéolectomie"]},
    "traumatisme_dent":    {"label": "Traumatisme dentaire",           "urgency": "urgence",  "specialties": ["CONSERVATRICE", "ENDODONTIE"],      "acts": ["Composite 3 faces", "Traitement canalaire mono-radiculé"]},
    "avulsion":            {"label": "Avulsion dentaire",              "urgency": "urgence",  "specialties": ["CHIRURGIE", "IMPLANTOLOGIE"],       "acts": ["Pose implant", "Couronne sur implant"]},
    "couronne_descellée":  {"label": "Couronne descellée",             "urgency": "urgence",  "specialties": ["PROTHESE"],                         "acts": ["Couronne zircone", "Bridge 3 éléments"]},
    "saignement_gingival": {"label": "Saignement gingival",            "urgency": "normal",   "specialties": ["PARODONTOLOGIE"],                   "acts": ["Détartrage & Polissage", "Bilan parodontal"]},
    "mobilite_dentaire":   {"label": "Mobilité dentaire",              "urgency": "normal",   "specialties": ["PARODONTOLOGIE", "CHIRURGIE"],      "acts": ["Bilan parodontal", "Lambeau parodontal"]},
    "recession_gingivale": {"label": "Récession gingivale",            "urgency": "planifié", "specialties": ["PARODONTOLOGIE"],                   "acts": ["Surfaçage radiculaire (secteur)", "Curetage parodontal"]},
    "halitose":            {"label": "Halitose",                        "urgency": "normal",   "specialties": ["PARODONTOLOGIE"],                   "acts": ["Détartrage & Polissage", "Bilan parodontal"]},
    "tartre_important":    {"label": "Tartre important",               "urgency": "normal",   "specialties": ["PARODONTOLOGIE"],                   "acts": ["Détartrage & Polissage"]},
    "dents_colorees":      {"label": "Dents colorées / tachées",       "urgency": "planifié", "specialties": ["ESTHETIQUE"],                       "acts": ["Blanchiment dentaire (cabinet)", "Gouttière blanchiment"]},
    "dent_ebrechee":       {"label": "Dent ébréchée",                  "urgency": "normal",   "specialties": ["CONSERVATRICE", "ESTHETIQUE"],      "acts": ["Composite 2 faces", "Reconstitution esthétique"]},
    "diasteme":            {"label": "Diastème",                        "urgency": "planifié", "specialties": ["ORTHODONTIE", "ESTHETIQUE"],        "acts": ["Facette céramique", "Semestre ODF multibagues"]},
    "sourire_gingival":    {"label": "Sourire gingival",               "urgency": "planifié", "specialties": ["PARODONTOLOGIE", "ESTHETIQUE"],     "acts": ["Lambeau parodontal"]},
    "facettes":            {"label": "Demande de facettes",            "urgency": "planifié", "specialties": ["PROTHESE", "ESTHETIQUE"],           "acts": ["Facette céramique"]},
    "carie":               {"label": "Carie dentaire",                  "urgency": "normal",   "specialties": ["CONSERVATRICE"],                    "acts": ["Composite 1 face", "Composite 2 faces"]},
    "carie_multiple":      {"label": "Caries multiples",               "urgency": "normal",   "specialties": ["CONSERVATRICE", "PREVENTION"],     "acts": ["Composite 1 face", "Scellement de fissures", "Fluorisation"]},
    "dent_fissure":        {"label": "Dent fissurée",                   "urgency": "normal",   "specialties": ["CONSERVATRICE", "ENDODONTIE"],      "acts": ["Composite 3 faces", "Inlay/Onlay céramique"]},
    "obturation_defectueuse": {"label": "Obturation défectueuse",      "urgency": "normal",   "specialties": ["CONSERVATRICE"],                    "acts": ["Composite 2 faces"]},
    "remplacement_dent":   {"label": "Remplacement dent manquante",    "urgency": "planifié", "specialties": ["PROTHESE", "IMPLANTOLOGIE"],        "acts": ["Couronne zircone", "Pose implant", "Bridge 3 éléments"]},
    "prothese_amovible":   {"label": "Prothèse amovible inadaptée",    "urgency": "normal",   "specialties": ["PROTHESE"],                         "acts": ["Prothèse adjointe partielle", "Prothèse complète"]},
    "bridge_defectueux":   {"label": "Bridge défectueux",              "urgency": "normal",   "specialties": ["PROTHESE"],                         "acts": ["Bridge 3 éléments", "Inlay core"]},
    "premiere_prothese":   {"label": "Première prothèse",              "urgency": "planifié", "specialties": ["PROTHESE"],                         "acts": ["Prothèse complète"]},
    "malocclusion":        {"label": "Malocclusion",                    "urgency": "planifié", "specialties": ["ORTHODONTIE"],                      "acts": ["Bilan orthodontique", "Semestre ODF multibagues"]},
    "decalage_maxillaire": {"label": "Décalage maxillaire",            "urgency": "planifié", "specialties": ["ORTHODONTIE"],                      "acts": ["Bilan orthodontique"]},
    "encombrement_dentaire":{"label": "Encombrement dentaire",         "urgency": "planifié", "specialties": ["ORTHODONTIE"],                      "acts": ["Semestre ODF multibagues", "Gouttière aligneur (par semestre)"]},
    "bilan_ortho_enfant":  {"label": "Bilan ortho enfant",             "urgency": "planifié", "specialties": ["ORTHODONTIE"],                      "acts": ["Bilan orthodontique"]},
    "aligneurs":           {"label": "Demande de gouttières",          "urgency": "planifié", "specialties": ["ORTHODONTIE"],                      "acts": ["Gouttière aligneur (par semestre)"]},
    "bilan_implantaire":   {"label": "Bilan implantaire",              "urgency": "planifié", "specialties": ["IMPLANTOLOGIE"],                    "acts": ["Pose implant", "Greffe osseuse"]},
    "implant_douloureux":  {"label": "Implant douloureux",             "urgency": "urgence",  "specialties": ["IMPLANTOLOGIE", "CHIRURGIE"],       "acts": ["Élévation sinusienne"]},
    "eden_complet":        {"label": "Édentement complet",             "urgency": "planifié", "specialties": ["IMPLANTOLOGIE", "PROTHESE"],        "acts": ["Prothèse implanto-portée", "Greffe osseuse"]},
    "controle_annuel":     {"label": "Contrôle annuel",                "urgency": "planifié", "specialties": ["PREVENTION"],                       "acts": ["Consultation standard", "Détartrage & Polissage"]},
    "bilan_general":       {"label": "Bilan complet",                  "urgency": "planifié", "specialties": ["PREVENTION"],                       "acts": ["Consultation standard", "Radiographie panoramique"]},
    "suivi_traitement":    {"label": "Suivi post-traitement",          "urgency": "planifié", "specialties": ["PREVENTION"],                       "acts": ["Consultation standard"]},
    "bruxisme":            {"label": "Bruxisme",                        "urgency": "normal",   "specialties": ["PREVENTION", "PROTHESE"],          "acts": ["Consultation standard"]},
    "prise_en_charge_enfant": {"label": "Première consultation enfant","urgency": "planifié", "specialties": ["PREVENTION"],                       "acts": ["Scellement de fissures", "Fluorisation"]},
}


def _resolve_motifs(raw: Optional[str]) -> List[Dict]:
    """Parse motif_consultation (JSON array of IDs or legacy free text)."""
    if not raw:
        return []
    try:
        ids = json.loads(raw)
        if isinstance(ids, list):
            return [MOTIF_CATALOG[i] for i in ids if i in MOTIF_CATALOG]
    except (json.JSONDecodeError, TypeError):
        pass
    return []


class ClinicalIntelligenceService:
    """
    Service d'agrégation et d'intelligence clinique (Module 2 & 3).
    """

    def get_patient_summary(self, db: Session, patient_id: int) -> Dict[str, Any]:
        """
        Module 2 — Résumé Flash Patient (P0).
        Aggrege les données sans LLM pour une réponse instantanée.
        """
        patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
        if not patient:
            return {}

        # 1. Dernière visite
        last_acte = db.query(models.Acte).filter(models.Acte.patient_id == patient_id).order_by(desc(models.Acte.date_debut)).first()
        last_visit = None
        if last_acte:
            last_visit = {
                "date": last_acte.date_debut.strftime("%Y-%m-%d"),
                "acte": last_acte.libelle,
                "days_ago": (datetime.now() - last_acte.date_debut).days
            }

        # 2. Prochain RDV
        next_app = db.query(models.Appointment).filter(
            models.Appointment.patient_id == patient_id,
            models.Appointment.datetime_start >= datetime.now(),
            models.Appointment.status != models.AppointmentStatus.ANNULE
        ).order_by(models.Appointment.datetime_start).first()
        
        next_visit = None
        if next_app:
            next_visit = {
                "date": next_app.datetime_start.strftime("%Y-%m-%d"),
                "time": next_app.datetime_start.strftime("%H:%M"),
                "motif": next_app.motif
            }

        # 3. Résumé clinique
        clinical_parts = []
        if patient.antecedents_medicaux:
            clinical_parts.append(f"Antécédents : {patient.antecedents_medicaux}")

        resolved_motifs = _resolve_motifs(patient.motif_consultation)
        if resolved_motifs:
            labels = [m["label"] for m in resolved_motifs]
            clinical_parts.append(f"Motifs : {', '.join(labels)}")
        elif patient.motif_consultation:
            clinical_parts.append(f"Motif de consultation : {patient.motif_consultation}")
        
        if patient.dossier and patient.dossier.is_ortho_active:
            clinical_parts.append("Traitement orthodontique actif.")
            
        # Nombre de couronnes/actes prothétiques
        prothese_count = db.query(models.Acte).filter(
            models.Acte.patient_id == patient_id,
            models.Acte.type_acte == models.ActeType.PROTHESE
        ).count()
        if prothese_count > 0:
            clinical_parts.append(f"{prothese_count} acte(s) prothétique(s) réalisé(s).")

        clinical_summary = " ".join(clinical_parts) if clinical_parts else "Dossier vierge."

        # 4. Alertes IA (Heuristiques + Motifs structurés)
        alerts = []
        if patient.antecedents_medicaux and any(x in patient.antecedents_medicaux.lower() for x in ["diabète", "avk", "cardiaque", "hypertension"]):
            alerts.append(f"Alerte Médicale : {patient.antecedents_medicaux}")

        urgent_motifs = [m for m in resolved_motifs if m.get("urgency") == "urgence"]
        for um in urgent_motifs:
            alerts.append(f"⚡ Urgence déclarée : {um['label']}")
            
        # Check last analysis for instability
        last_analyses = db.query(models.CephaloAnalysis).filter(models.CephaloAnalysis.patient_id == patient_id).order_by(desc(models.CephaloAnalysis.created_at)).limit(2).all()
        if len(last_analyses) >= 2:
            a1 = last_analyses[0].angles_data
            a2 = last_analyses[1].angles_data
            if a1 and a2 and 'IMPA' in a1 and 'IMPA' in a2:
                diff = abs(a1['IMPA'].get('valeur', 0) - a2['IMPA'].get('valeur', 0))
                if diff > 3:
                    alerts.append("IMPA instable sur les dernières analyses.")

        risk_level = "low"
        if alerts: risk_level = "moderate"
        if any("Alerte Médicale" in a for a in alerts): risk_level = "high"

        # Enrichissement : actes des 90 derniers jours
        cutoff_90d = datetime.now() - timedelta(days=90)
        acts_last_90d = db.query(models.Acte).filter(
            models.Acte.patient_id == patient_id,
            models.Acte.date_debut >= cutoff_90d
        ).count()

        # Enrichissement : top findings panoramique le plus récent
        last_pano = db.query(models.PanoramicAnalysis).filter(
            models.PanoramicAnalysis.patient_id == patient_id
        ).order_by(desc(models.PanoramicAnalysis.created_at)).first()
        last_panoramic_findings: list = []
        if last_pano:
            detections = (last_pano.detections_data or {}).get("detections", [])
            for d in detections[:3]:
                label = d.get("class_name") or d.get("label", "")
                tooth = d.get("tooth_fdi", "")
                if label:
                    last_panoramic_findings.append(label + (f" dent {tooth}" if tooth else ""))

        # Enrichissement : tendance céphalométrique
        cephalo_trend = "données insuffisantes"
        last_2_cephalos = db.query(models.CephaloAnalysis).filter(
            models.CephaloAnalysis.patient_id == patient_id
        ).order_by(desc(models.CephaloAnalysis.created_at)).limit(2).all()
        if len(last_2_cephalos) >= 2:
            a1 = (last_2_cephalos[0].angles_data or {})
            a2 = (last_2_cephalos[1].angles_data or {})
            impa1 = a1.get("IMPA", {}).get("valeur")
            impa2 = a2.get("IMPA", {}).get("valeur")
            if impa1 is not None and impa2 is not None:
                diff = impa1 - impa2
                cephalo_trend = "stable" if abs(diff) <= 2 else ("amélioration" if diff < 0 else "dégradation")

        # Compile treatment hints from motifs (deduplicated)
        seen_specialties: set = set()
        seen_acts: set = set()
        treatment_hints = []
        for m in resolved_motifs:
            for spec in m.get("specialties", []):
                if spec not in seen_specialties:
                    seen_specialties.add(spec)
            for act in m.get("acts", []):
                if act not in seen_acts:
                    seen_acts.add(act)
                    treatment_hints.append(act)

        risk_level_by_motifs = "high" if urgent_motifs else ("moderate" if resolved_motifs else "low")
        if any("Alerte Médicale" in a for a in alerts):
            risk_level_by_motifs = "high"
        effective_risk = max([risk_level, risk_level_by_motifs], key=lambda x: {"low": 0, "moderate": 1, "high": 2}[x])

        return {
            "last_visit": last_visit,
            "next_visit": next_visit,
            "clinical_summary": clinical_summary,
            "alerts": alerts,
            "risk_level": effective_risk,
            "acts_last_90d": acts_last_90d,
            "last_panoramic_findings": last_panoramic_findings,
            "cephalo_trend": cephalo_trend,
            "motif_specialties": list(seen_specialties),
            "motif_treatment_hints": treatment_hints[:8],
        }

    def get_full_diagnostic(self, db: Session, patient_id: int) -> Dict[str, Any]:
        """
        Module 3 — Panneau Conseil Clinique (P2).
        Utilise le LLM via AIAdvisor si possible.
        """
        patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
        if not patient:
            return {"report": "Patient introuvable."}

        # 1. Fetch last analysis
        last_analysis = db.query(models.CephaloAnalysis).filter(models.CephaloAnalysis.patient_id == patient_id).order_by(desc(models.CephaloAnalysis.id)).first()
        
        if not last_analysis or not last_analysis.angles_data:
            return {
                "report": "## Synthèse Clinique\nDonnées céphalométriques manquantes pour un diagnostic IA complet.\n\n" + 
                          f"**Contexte Patient** : {patient.nom.upper()} {patient.prenom.capitalize()}, {self._calculate_age(patient.date_naissance)} ans.\n" +
                          f"**Antécédents** : {patient.antecedents_medicaux or 'Néant'}.",
                "source": "heuristic",
                "confidence": 0.5,
                "generated_at": datetime.now().isoformat()
            }

        # 2. Format data for AIAdvisor
        # We need to construct a schemas.CephaloAnalysisResult
        # But wait, ai_advisor.generate_diagnostic expects a result object with metrics
        
        # Let's use the heuristic fallback if LLM is too slow or for simplicity first
        # But let's try to simulate the call
        
        # We wrap the stored JSON into the expected schema
        try:
            # Reconstruct result object from stored JSON
            # This is complex because angles_data is a raw dict, not exactly CephaloAnalysisResult
            # AIAdvisor expects osseuse and dentaire categories
            
            # For now, let's use the heuristic fallback directly from AIAdvisor 
            # to give the user immediate feedback in the Panel
            
            cohort = "Adulte"
            age = self._calculate_age(patient.date_naissance)
            if age < 14: cohort = f"Enfant ({age} ans)"
            
            # AIAdvisor._heuristic_fallback expects SkeletalAnalysis and DentalAnalysis objects
            # It's better to implement a "Global" prompt for AIAdvisor that takes Patient + Analysis
            
            report_dict = ai_advisor.generate_diagnostic(
                schemas.CephaloAnalysisResult(
                    analysis_metadata=schemas.AnalysisMetadata(
                        pixel_ratio=last_analysis.mm_per_pixel or 1.0, 
                        cohort=cohort
                    ),
                    metrics=schemas.AnalysisMetrics(**last_analysis.angles_data),
                    visual_debug={},
                    t1_projection={},
                    clinical_data=schemas.ClinicalData()
                ),
                use_slm=False # Force heuristic for speed in "Live"
            )
            
            # Format report as Markdown
            markdown = f"## 🦷 Synthèse Diagnostique ({cohort})\n"
            markdown += f"{report_dict.get('diagnostic_squelettique', '')}\n\n"
            
            markdown += "## 📐 Analyse Dentaire\n"
            markdown += f"{report_dict.get('analyse_dentaire', '')}\n\n"
            
            markdown += "## 💡 Stratégie Thérapeutique (COM)\n"
            markdown += f"{report_dict.get('strategie_therapeutique', '')}"

            return {
                "report": markdown,
                "source": "slm" if not report_dict.get("is_fallback") else "heuristic",
                "confidence": 0.85,
                "generated_at": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error generating diagnostic: {e}")
            return {"report": f"Erreur lors de la génération du diagnostic : {str(e)}"}

    def _calculate_age(self, born):
        today = datetime.now()
        return today.year - born.year - ((today.month, today.day) < (born.month, born.day))

clinical_intel = ClinicalIntelligenceService()
