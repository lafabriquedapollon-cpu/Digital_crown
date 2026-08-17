from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
import os
import shutil
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta

from backend import models, schemas, database
from backend.routers.auth import get_current_user, require_permission
from backend.utils.access_control import assert_patient_access
from backend.services.prescription_service import prescription_service
from backend.services.audit_service import audit_service

prescription_router = APIRouter(tags=["Prescriptions"])
actes_router = APIRouter(tags=["Actes Cliniques"])

@prescription_router.get("/search", response_model=List[schemas.MedicationOut])
def search_medications(q: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("prescriptions"))):
    return db.query(models.Medication).filter(models.Medication.nom.ilike(f"%{q}%")).order_by(models.Medication.usage_count.desc()).limit(20).all()

import urllib.request, re

@prescription_router.get("/search/web")
def search_web_medications(q: str, current_user: models.User = Depends(require_permission("prescriptions"))):
    """
    Scrape en direct la base de données medicament.ma pour suggérer des médicaments non présents localement.
    """
    if not q or len(q) < 3:
        return []
    url = f'https://medicament.ma/?choice=specialite&keyword=starts&s={q.strip()}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8', errors='ignore')
            matches = re.findall(r'<p class="primary">([^<]+)</p>', html)
            # Parse results (e.g. "DOLIPRANE 1 G, Comprimé effervescent sécable")
            results = []
            for i, match in enumerate(matches[:15]):
                parts = match.split(',', 1)
                name = parts[0].strip()
                forme = parts[1].strip().upper() if len(parts) > 1 else ""
                
                # Guess dosage from name
                dosage = ""
                dosage_match = re.search(r'\b(\d+(?:,\d+)?\s*(?:MG|G|ML|UI|UI/ML|%|MCG))\b', name, re.IGNORECASE)
                if dosage_match:
                    dosage = dosage_match.group(1).upper()
                    name = name.replace(dosage_match.group(1), "").strip()
                
                results.append({
                    "id": f"web_{i}",
                    "nom": name,
                    "dosage": dosage,
                    "forme": forme,
                    "usage_count": 0
                })
            return results
    except Exception as e:
        print(f"Error scraping medicament.ma: {e}")
        return []

@prescription_router.get("/suggest", response_model=List[schemas.ClinicalProtocolOut])
def suggest_protocols(category_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("prescriptions"))):
    return db.query(models.ClinicalProtocol).filter(models.ClinicalProtocol.category_id == category_id).all()

@prescription_router.get("/habits/suggest")
def get_medication_habits(q: str = "", db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("prescriptions"))):
    return prescription_service.get_personalized_suggestions(db, current_user.id, q)

@prescription_router.get("/habits/details")
def get_medication_habit_details(med_name: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("prescriptions"))):
    return prescription_service.get_medication_details(db, current_user.id, med_name)

@prescription_router.get("/habits/presets")
def get_prescription_presets(db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("prescriptions"))):
    return prescription_service.get_doctor_presets(db, current_user.id)

@prescription_router.post("/habits/record")
def record_medication_habit(req: dict, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("prescriptions"))):
    med_name = req.get("medication_name")
    dosage = req.get("dosage")
    posologie = req.get("posologie")
    if not med_name:
        raise HTTPException(status_code=400, detail="Nom du médicament manquant")
    prescription_service.record_medication_usage(db, current_user.id, med_name, dosage, posologie)
    return {"status": "success"}

@prescription_router.post("/habits/record-batch")
def record_medication_habits_batch(req: List[dict], db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("prescriptions"))):
    for item in req:
        med_name = item.get("medication_name")
        dosage = item.get("dosage")
        posologie = item.get("posologie")
        if med_name:
            prescription_service.record_medication_usage(db, current_user.id, med_name, dosage, posologie)
    return {"status": "success"}

@prescription_router.post("/safety/check")
def check_prescription_safety(req: dict, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("prescriptions"))):
    """
    Vérifie la sécurité d'une ordonnance pour un patient donné.
    """
    patient_id = req.get("patient_id")
    drug_names = req.get("drug_names", [])
    if not patient_id:
        raise HTTPException(status_code=400, detail="ID Patient manquant")
    return prescription_service.check_safety(db, patient_id, drug_names)

@prescription_router.get("/smart-suggest/{patient_id}")
async def get_smart_suggestion(patient_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("prescriptions"))):
    assert_patient_access(patient_id, current_user, db)
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    rdvs = db.query(models.Appointment).filter(
        models.Appointment.patient_id == patient_id, 
        models.Appointment.datetime_start >= today
    ).all()
    act_names = [r.motif for r in rdvs if r.motif]
    return prescription_service.resolve_smart_prescription(db, patient_id, act_names, doctor_id=current_user.id)

@actes_router.get("/catalog/search", response_model=List[dict])
def search_clinical_acts(q: str = "", db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    from backend.services.accounting_service import accounting_service
    
    if not q.strip():
        # Actes fréquents du médecin + TOUT le Catalogue Dynamique managé
        # (source unique, partagée avec Réglages → Catalogue Dynamique).
        frequent = accounting_service.get_frequent_acts(db, current_user.id, limit=20)
        frequent_names = {f["name"].lower() for f in frequent} if frequent else set()

        results = list(frequent) if frequent else []

        catalog = (
            db.query(models.CatalogAct, models.Specialty.name)
            .join(models.Specialty, models.CatalogAct.specialty_id == models.Specialty.id)
            .filter(models.CatalogAct.is_active == True)
            .order_by(models.Specialty.name, models.CatalogAct.name)
            .all()
        )
        for c, spec_name in catalog:
            if c.name.lower() not in frequent_names:
                results.append({
                    "id": f"cat_{c.id}",
                    "name": c.name,
                    "base_price": c.base_price,
                    "category": spec_name or "Général",
                    "is_habit": False,
                })

        return results

    return accounting_service.search_acts(db, current_user.id, q)

@actes_router.post("/catalog/quick-add")
def quick_add_act(payload: dict, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("agenda"))):
    """Ajoute au catalogue un acte saisi dans l'agenda mais absent (sous la spécialité DIVERS)."""
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom d'acte requis")
    try:
        base_price = float(payload.get("base_price") or 0)
    except (TypeError, ValueError):
        base_price = 0.0

    # Acte déjà présent (peu importe la spécialité) → on le renvoie tel quel
    existing = db.query(models.CatalogAct).filter(models.CatalogAct.name.ilike(name)).first()
    if existing:
        spec = db.query(models.Specialty).filter(models.Specialty.id == existing.specialty_id).first()
        return {"id": existing.id, "name": existing.name, "base_price": existing.base_price,
                "category": spec.name if spec else "DIVERS", "is_habit": False}

    # Catégorie (spécialité) choisie par l'utilisateur, sinon "DIVERS" (get-or-create)
    category = (payload.get("category") or "").strip().upper() or "DIVERS"
    spec = db.query(models.Specialty).filter(models.Specialty.name == category).first()
    if not spec:
        spec = models.Specialty(name=category, color="#64748B")
        db.add(spec)
        db.flush()

    act = models.CatalogAct(specialty_id=spec.id, name=name, base_price=base_price)
    db.add(act)
    db.commit()
    db.refresh(act)
    return {"id": act.id, "name": act.name, "base_price": act.base_price, "category": spec.name, "is_habit": False}


@actes_router.get("/duration")
def get_act_recommended_duration(q: str = "", current_user: models.User = Depends(get_current_user)):
    from backend.services.habits_engine import habits_engine
    duration = habits_engine.get_recommended_duration(q)
    return {"duration": duration}

@actes_router.post("/catalog/bundles")
def get_act_bundles(req: dict, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    """
    Retourne les bundles d'actes recommandés pour une liste d'actes donnés.
    """
    from backend.services.accounting_service import accounting_service
    act_names = req.get("act_names", [])
    return accounting_service.get_smart_bundles(act_names)

@actes_router.get("/brain/summary")
def get_brain_summary(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    """
    Retourne une synthèse de tout ce que le système a appris sur le praticien.
    """
    from backend.services.accounting_service import accounting_service
    from backend.services.prescription_service import prescription_service
    
    return {
        "frequent_acts": accounting_service.get_frequent_acts(db, current_user.id, limit=5),
        "frequent_drugs": prescription_service.get_doctor_habits_summary(db, current_user.id),
        "total_knowledge_points": db.query(models.DoctorActHabit).filter(models.DoctorActHabit.doctor_id == current_user.id).count() + 
                                  db.query(models.DoctorMedicationHabit).filter(models.DoctorMedicationHabit.doctor_id == current_user.id).count()
    }

@actes_router.post("/", status_code=status.HTTP_201_CREATED)
def create_acte(
    acte_data: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(require_permission(["clinical", "agenda"]))
):
    # S1 : tenant + permission. assert_patient_access AVANT le try (sinon le 403/400
    # serait avalé par le `except Exception` qui renvoie 500).
    patient_id = acte_data.get("patient_id")
    if patient_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="patient_id requis")
    assert_patient_access(patient_id, current_user, db)
    try:
        type_acte_str = acte_data.get("type_acte", "SOIN").upper()
        type_acte = getattr(models.ActeType, type_acte_str, models.ActeType.SOIN)
        
        # 1. Instanciation de l'acte clinique
        new_act = models.Acte(
            patient_id=acte_data["patient_id"],
            praticien_id=current_user.id,
            type_acte=type_acte,
            libelle=acte_data["libelle"],
            montant=float(acte_data.get("montant", 0.0)),
            date_debut=datetime.now(),
            statut_paiement=models.PaiementStatut.EN_ATTENTE,
            notes_cliniques=acte_data.get("notes_cliniques"),
            attachments=acte_data.get("attachments", [])
        )
        
        db.add(new_act)
        # Flush pour obtenir le new_act.id généré par la DB sans fermer la transaction
        db.flush() 

        # 2. Détection du besoin prothétique (Trigger LabJob)
        mots_cles_protheses = ["COURONNE", "ZIRCONE", "INLAY", "ONLAY", "FACETTE", "BRIDGE", "PROTHÈSE", "IMPLANT"]
        is_prothetic = (
            new_act.type_acte == models.ActeType.PROTHESE or 
            any(mot in new_act.libelle.upper() for mot in mots_cles_protheses)
        )

        if is_prothetic:
            new_labjob = models.LabJob(
                patient_id=new_act.patient_id,
                act_id=new_act.id,
                type=new_act.libelle,
                status=models.LabJobStatus.PRESCRIPTION,
                deadline=datetime.now() + timedelta(days=7)
            )
            db.add(new_labjob)

        # 3. Commit de la transaction combinée (Atomique : Acte + LabJob)
        db.commit()
        db.refresh(new_act)
        audit_service.log(db=db, user_id=current_user.id, employer_id=current_user.get_employer_id(), action="CREATE", resource_type="Acte", resource_id=str(new_act.id), details=f"Acte: {new_act.libelle}, Montant: {new_act.montant}")

        # MPL : enregistre la corrélation acte précédent → cet acte pour les suggestions futures
        from backend.services.habits_engine import habits_engine as _he
        try:
            _he.record_act_sequence(db, current_user.id, patient_id)
        except Exception:
            pass  # non-critique, ne doit jamais bloquer la réponse

        return {"status": "success", "act_id": new_act.id, "labjob_created": is_prothetic}

    except Exception as e:
        # 4. Rollback en cas de fail (ex: erreur de contrainte LabJob)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur transactionnelle (Acte/Labo) : {str(e)}"
        )

@actes_router.put("/{acte_id}", status_code=status.HTTP_200_OK)
def update_acte(
    acte_id: int,
    acte_data: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(require_permission(["clinical", "agenda"]))
):
    """
    Met à jour un acte clinique existant (notes, montants, statut paiement, fichiers joints).
    """
    try:
        act = db.query(models.Acte).filter(models.Acte.id == acte_id).first()
        if not act:
            raise HTTPException(status_code=404, detail="Acte introuvable")

        assert_patient_access(act.patient_id, current_user, db)

        if "libelle" in acte_data:
            act.libelle = acte_data["libelle"]
        if "montant" in acte_data:
            act.montant = float(acte_data["montant"])
        if "statut_paiement" in acte_data:
            act.statut_paiement = getattr(models.PaiementStatut, acte_data["statut_paiement"].upper(), act.statut_paiement)
        if "notes_cliniques" in acte_data:
            act.notes_cliniques = acte_data["notes_cliniques"]
        if "attachments" in acte_data:
            act.attachments = acte_data["attachments"]

        db.commit()
        db.refresh(act)
        audit_service.log(db=db, user_id=current_user.id, employer_id=current_user.get_employer_id(), action="UPDATE", resource_type="Acte", resource_id=str(acte_id), details=f"Champs: {', '.join(acte_data.keys())}")
        return {"status": "success", "acte": {
            "id": act.id,
            "libelle": act.libelle,
            "montant": act.montant,
            "statut_paiement": act.statut_paiement,
            "notes_cliniques": act.notes_cliniques,
            "attachments": act.attachments
        }}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la mise à jour de l'acte : {str(e)}"
        )

@actes_router.post("/{acte_id}/upload", status_code=status.HTTP_200_OK)
async def upload_acte_attachment(
    acte_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(require_permission(["clinical", "agenda"]))
):
    try:
        act = db.query(models.Acte).filter(models.Acte.id == acte_id).first()
        if not act:
            raise HTTPException(status_code=404, detail="Acte introuvable")

        assert_patient_access(act.patient_id, current_user, db)

        # Build path — sous-dossier actes/ pour la route authentifiée dédiée
        from backend.main import UPLOAD_DIR
        import pathlib
        actes_dir = pathlib.Path(UPLOAD_DIR) / "actes"
        actes_dir.mkdir(parents=True, exist_ok=True)
        safe_filename = f"acte_{acte_id}_{int(datetime.now().timestamp())}_{file.filename.replace(' ', '_')}"
        file_path = str(actes_dir / safe_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Update DB — URL pointe vers la route protégée /api/static/uploads/actes/
        current_attachments = act.attachments or []
        file_url = f"/api/static/uploads/actes/{safe_filename}"
        
        # Acte attachments should be a list of strings
        if not isinstance(current_attachments, list):
            current_attachments = []
            
        current_attachments.append(file_url)
        act.attachments = current_attachments
        db.commit()
        db.refresh(act)

        return {"status": "success", "file_url": file_url, "attachments": act.attachments}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur upload: {str(e)}"
        )

@actes_router.get("/patient/{patient_id}")
def get_patient_actes(
    patient_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(require_permission(["clinical", "agenda"]))
):
    """
    Récupère tous les actes d'un patient.
    """
    assert_patient_access(patient_id, current_user, db)
    actes = db.query(models.Acte).filter(models.Acte.patient_id == patient_id).order_by(models.Acte.date_debut.desc()).all()
    return [{"id": a.id, "type_acte": a.type_acte, "libelle": a.libelle, "montant": a.montant, "date_debut": a.date_debut, "statut_paiement": a.statut_paiement, "notes_cliniques": a.notes_cliniques, "attachments": a.attachments} for a in actes]

from backend.services.prescription_agentic_service import prescription_agentic

# --- AGENTIC PRESCRIPTION (V2.0) ---

@prescription_router.get("/agentic/assessment/{patient_id}")
async def get_clinical_assessment(patient_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("prescriptions"))):
    """
    Étape 1 : Agent Chercheur.
    Analyse le dossier et les actes prévus pour générer un bilan scientifique.
    """
    assert_patient_access(patient_id, current_user, db)
    # Récupérer les actes récents ou prévus
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    rdvs = db.query(models.Appointment).filter(
        models.Appointment.patient_id == patient_id, 
        models.Appointment.datetime_start >= today
    ).all()
    act_names = [r.motif for r in rdvs if r.motif]
    if not act_names:
        # Fallback sur les derniers actes réalisés si pas de RDV aujourd'hui
        last_actes = db.query(models.Acte).filter(models.Acte.patient_id == patient_id).order_by(models.Acte.date_debut.desc()).limit(3).all()
        act_names = [a.libelle for a in last_actes]

    return prescription_agentic.generate_clinical_assessment(db, patient_id, act_names, doctor_id=current_user.id)

@prescription_router.post("/agentic/design")
async def design_agentic_plan(req: dict, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("prescriptions"))):
    """
    Étape 2 : Agent Architecte.
    Transforme le bilan en plan de traitement concret (Noms commerciaux Maroc).
    """
    assessment = req.get("assessment")
    patient_context = req.get("patient_context")
    if not assessment or not patient_context:
        raise HTTPException(status_code=400, detail="Bilan ou contexte patient manquant")
        
    return prescription_agentic.design_treatment_plan(assessment, patient_context)

@prescription_router.post("/preferences")
async def save_prescription_preference(req: dict, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("prescriptions"))):
    """
    Enregistre une habitude de prescription pour le médecin actuel.
    """
    act_code = req.get("act_code")
    drugs = req.get("drugs")
    if not act_code or not drugs:
        raise HTTPException(status_code=400, detail="Données de préférence incomplètes")
        
    prescription_service.learn_habit(db, current_user.id, act_code.strip().upper(), drugs)
    return {"status": "success", "message": "Habitude enregistrée avec succès"}

@prescription_router.delete("/preferences/{act_code}")
async def delete_prescription_preference(act_code: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("prescriptions"))):
    """
    Supprime un preset (habitude de prescription par acte) pour le médecin actuel.
    """
    deleted = prescription_service.delete_doctor_preset(db, current_user.id, act_code)
    if not deleted:
        raise HTTPException(status_code=404, detail="Ordonnance enregistrée introuvable")
    return {"status": "success", "message": "Preset supprimé avec succès"}

@prescription_router.get("/certif-suggest/{patient_id}")
async def suggest_certificate(patient_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_permission("prescriptions"))):
    """
    Analyse les actes récents pour suggérer un type de certificat.
    """
    assert_patient_access(patient_id, current_user, db)
    
    # Récupérer l'acte ou le RDV le plus récent (aujourd'hui)
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # 1. Chercher un acte réalisé aujourd'hui
    last_act = db.query(models.Acte).filter(
        models.Acte.patient_id == patient_id,
        models.Acte.date_debut >= today
    ).order_by(models.Acte.date_debut.desc()).first()
    
    # 2. Chercher un RDV aujourd'hui
    last_rdv = db.query(models.Appointment).filter(
        models.Appointment.patient_id == patient_id,
        models.Appointment.datetime_start >= today
    ).order_by(models.Appointment.datetime_start.desc()).first()
    
    motif_text = (last_act.libelle if last_act else (last_rdv.motif if last_rdv else "")).lower()
    
    suggestion = {
        "type": "Certificat de Présence",
        "days": 1,
        "confidence": "low",
        "reason": "Pas d'acte chirurgical récent détecté."
    }
    
    if any(k in motif_text for k in ["extraction", "chirurgie", "implant", "lambeau", "resection"]):
        suggestion = {
            "type": "Repos Post-Opératoire",
            "days": 3,
            "confidence": "high",
            "reason": f"Suite à l'acte : {motif_text.title()}"
        }
    elif any(k in motif_text for k in ["ortho", "bagues", "appareil", "ajustement"]):
        suggestion = {
            "type": "Suite d'Intervention",
            "days": 1,
            "confidence": "medium",
            "reason": "Suite à un réglage orthodontique."
        }
    elif any(k in motif_text for k in ["examen", "aptitude", "sport"]):
        suggestion = {
            "type": "Certificat d'aptitude",
            "days": 1,
            "confidence": "medium",
            "reason": "Examen clinique réalisé."
        }
        
    return suggestion
