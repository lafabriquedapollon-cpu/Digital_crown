from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from backend.repositories.cephalo_repository import CephaloRepository
from backend.services.cephalo_engine import cephalo_engine
from backend.services.vision_service import vision_engine
from backend.services.bilan_ortho_engine import bilan_ortho_engine
from backend.services.ai_advisor import ai_advisor
from backend import schemas
import logging

logger = logging.getLogger(__name__)

class CephaloService:
    """
    Orchestrateur de la logique Céphalométrique.
    Centralise Vision, Géométrie, DDM et Diagnostic IA.
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.repo = CephaloRepository(db)

    def process_new_radio(self, patient_id: int, file_path: str, db_path: str) -> Dict[str, Any]:
        """
        Exécute la pipeline complète pour une nouvelle radio.
        Vision -> Géométrie -> Initialisation Bilan -> Persistance.
        """
        # 1. Inférence Vision (Points anatomiques)
        logger.info(f"Analyse Vision pour le patient {patient_id}...")
        vision_result = vision_engine.predict_landmarks(file_path)
        if not vision_result or "landmarks" not in vision_result:
            logger.error("VisionEngine a retourné un résultat invalide ou vide.")
            raise ValueError("L'IA n'a détecté aucun point sur cette image.")
            
        pts = vision_result["landmarks"]
        logger.info(f"{len(pts)} points détectés par le moteur {vision_result['mode_inference']}")
        points_dict = {p['id']: (p['x'], p['y']) for p in pts}

        # 2. Calibration Automatique 2.0 (Phase 4)
        from backend.services.calibration_service import calibration_service
        logger.info("Tentative de calibration automatique...")
        auto_ratio = calibration_service.detect_mm_per_pixel(file_path)
        mm_ratio = auto_ratio if auto_ratio else 0.1 
        logger.info(f"Ratio retenu : {mm_ratio} mm/px (Auto: {auto_ratio is not None})")
        
        # 3. Calcul des métriques Géométriques -> CephaloAnalysisResult
        logger.info("Calcul des métriques géométriques...")
        try:
            result = cephalo_engine.calculate_metrics(points_dict, custom_mm_ratio=mm_ratio)
        except Exception as ce_err:
            logger.error(f"Échec du moteur géométrique: {ce_err}")
            raise ValueError(f"Erreur lors du calcul des angles : {ce_err}")
        
        final_data_dict = result.model_dump()
        final_data_dict["vision_metadata"] = {
            "mode_inference": vision_result["mode_inference"],
            "warning": vision_result.get("warning"),
            "processing_time_ms": vision_result["processing_time_ms"]
        }

        # 4. Persistance via Repository
        analysis = self.repo.create(patient_id, db_path, pts, final_data_dict, mm_per_pixel=mm_ratio)
        
        if auto_ratio:
            analysis.is_calibrated = True
            self.db.commit()
        
        return {
            "status": "success",
            "analysis_id": analysis.id,
            "results": final_data_dict,
            "ai_diagnostic": final_data_dict.get("ai_narrative", {}),
            "landmarks": pts,
            "is_calibrated": analysis.is_calibrated,
            "mm_per_pixel": analysis.mm_per_pixel
        }

    def refine_analysis(self, 
                        analysis_id: int, 
                        landmarks: List[Any], 
                        clinical_data: Optional[schemas.ClinicalData] = None, 
                        ai_diagnostic: Optional[Dict] = None, 
                        mm_per_pixel: Optional[float] = None, 
                        mcnamara_projections: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Recalcule et met à jour une analyse existante.
        Recalcul Géométrique -> Calcul DDM -> Diagnostic IA -> Persistance.
        """
        # Conversion des points pour le moteur géométrique
        pts_list = [p.model_dump() if hasattr(p, 'model_dump') else p for p in landmarks]
        points_dict = {p['id']: (p['x'], p['y']) for p in pts_list}
        
        # 1. Recalcul Géométrique -> CephaloAnalysisResult
        result = cephalo_engine.calculate_metrics(
            points_dict, 
            custom_mm_ratio=mm_per_pixel, 
            mcnamara_projections=mcnamara_projections
        )

        # 2. Logique métier DDM Réelle
        if clinical_data:
            result.clinical_data = self._calculate_complex_ddm(result, clinical_data)
        
        # 3. Gestion du Diagnostic IA (Moteur Déterministe)
        final_data_dict = result.model_dump()
        if ai_diagnostic:
            final_data_dict["ai_diagnostic"] = ai_diagnostic
        else:
            # Génération Local First (sans LLM) avec intégration complète Céphalométrie + Moulages
            final_data_dict["ai_diagnostic"] = bilan_ortho_engine.generate_bilan(result, clinical_data if clinical_data else schemas.ClinicalData())

        # 4. Mise à jour via Repository
        analysis = self.repo.update(analysis_id, pts_list, final_data_dict, mm_per_pixel)
        
        if not analysis:
            raise ValueError(f"Analyse {analysis_id} introuvable lors du raffinement.")

        return {
            "status": "success",
            "analysis_id": analysis.id,
            "results": final_data_dict,
            "ai_diagnostic": final_data_dict["ai_diagnostic"],
            "landmarks": analysis.landmarks_data,
            "is_calibrated": analysis.is_calibrated,
            "mm_per_pixel": analysis.mm_per_pixel
        }

    def _calculate_complex_ddm(self, results: schemas.CephaloAnalysisResult, cd: schemas.ClinicalData) -> schemas.ClinicalData:
        """
        Logique métier DDM Réelle (Master Logic).
        Calcule l'impact de l'inclinaison incisive (IMPA) sur l'encombrement dentaire.
        """
        # Extraction de l'IMPA depuis les nouveaux résultats typés
        impa = results.metrics.analyse_dentaire.IMPA.valeur
        
        # Règle COM : 2.5° d'inclinaison = 1mm de place gagnée/perdue
        ddm_cephalo = (impa - 90) / 2.5 if impa is not None else 0
        
        # On travaille sur une copie du modèle pour éviter les mutations imprévues
        data = cd.model_copy(deep=True)
        
        # Recalcul Maxillaire
        if data.ddm_maxillaire:
            ddm_max_clinique = data.ddm_maxillaire.espace_disponible - data.ddm_maxillaire.espace_necessaire
            data.ddm_maxillaire.calcul_ddm_reelle = round(ddm_max_clinique + ddm_cephalo, 2)
        
        # Recalcul Mandibulaire
        if data.ddm_mandibulaire:
            ddm_mand_clinique = data.ddm_mandibulaire.espace_disponible - data.ddm_mandibulaire.espace_necessaire
            data.ddm_mandibulaire.calcul_ddm_reelle = round(ddm_mand_clinique + ddm_cephalo, 2)
            
        # DDM Réelle Totale
        total_reelle = 0
        if data.ddm_maxillaire and data.ddm_maxillaire.calcul_ddm_reelle:
            total_reelle += data.ddm_maxillaire.calcul_ddm_reelle
        if data.ddm_mandibulaire and data.ddm_mandibulaire.calcul_ddm_reelle:
            total_reelle += data.ddm_mandibulaire.calcul_ddm_reelle
            
        data.ddm_reelle = round(total_reelle, 2)
        return data
