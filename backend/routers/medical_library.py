from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from backend import models, database
from backend.routers.auth import get_current_user

router = APIRouter(tags=["Bibliothèque Médicale & Clinique"])

# ==========================================================
# MEDICAMENTS
# ==========================================================

@router.get("/medicaments")
def get_medicaments(
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(get_current_user)
):
    """
    Récupère la liste des médicaments du cabinet.
    """
    employer_id = current_user.get_employer_id()
    # Retourner les médicaments par défaut (employer_id = None) + ceux du cabinet
    medicaments = db.query(models.Medicament).filter(
        (models.Medicament.employer_id == employer_id) | (models.Medicament.employer_id == None)
    ).all()
    
    return [
        {
            "id": m.id,
            "name": m.name,
            "dosage": m.dosage,
            "forme": m.forme,
            "posologie_default": m.posologie_default,
            "type": m.type,
            "substitution_allergie": m.substitution_allergie
        }
        for m in medicaments
    ]

@router.post("/medicaments")
def create_medicament(
    data: Dict[str, Any],
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(get_current_user)
):
    employer_id = current_user.get_employer_id()
    
    new_med = models.Medicament(
        employer_id=employer_id,
        name=data.get("name"),
        dosage=data.get("dosage"),
        forme=data.get("forme"),
        posologie_default=data.get("posologie_default"),
        type=data.get("type", "MEDICAMENT"),
        substitution_allergie=data.get("substitution_allergie")
    )
    
    db.add(new_med)
    db.commit()
    db.refresh(new_med)
    
    return {"status": "success", "id": new_med.id}

@router.delete("/medicaments/{med_id}")
def delete_medicament(
    med_id: int,
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(get_current_user)
):
    employer_id = current_user.get_employer_id()
    med = db.query(models.Medicament).filter_by(id=med_id, employer_id=employer_id).first()
    
    if not med:
        raise HTTPException(status_code=404, detail="Médicament non trouvé ou vous n'avez pas le droit de le supprimer (Système).")
        
    db.delete(med)
    db.commit()
    return {"status": "success"}


# ==========================================================
# DIAGNOSTICS & PROTOCOLES
# ==========================================================

@router.get("/diagnostics")
def get_diagnostics(
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(get_current_user)
):
    employer_id = current_user.get_employer_id()
    templates = db.query(models.DiagnosticTemplate).filter(
        (models.DiagnosticTemplate.employer_id == employer_id) | (models.DiagnosticTemplate.employer_id == None)
    ).all()
    
    return [
        {
            "id": t.id,
            "motif": t.motif,
            "vitality": t.vitality,
            "percussion": t.percussion,
            "palpation": t.palpation,
            "radiology": t.radiology,
            "lesion_duration": t.lesion_duration,
            "title": t.title,
            "description": t.description,
            "protocol": t.protocol,
            "treatment_plan": t.treatment_plan,
            "warnings": t.warnings
        }
        for t in templates
    ]

@router.post("/diagnostics")
def create_diagnostic(
    data: Dict[str, Any],
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(get_current_user)
):
    employer_id = current_user.get_employer_id()
    
    new_template = models.DiagnosticTemplate(
        employer_id=employer_id,
        motif=data.get("motif"),
        vitality=data.get("vitality"),
        percussion=data.get("percussion"),
        palpation=data.get("palpation"),
        radiology=data.get("radiology"),
        lesion_duration=data.get("lesion_duration"),
        title=data.get("title"),
        description=data.get("description"),
        protocol=data.get("protocol", []),
        treatment_plan=data.get("treatment_plan", []),
        warnings=data.get("warnings", [])
    )
    
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    
    return {"status": "success", "id": new_template.id}

@router.delete("/diagnostics/{diag_id}")
def delete_diagnostic(
    diag_id: int,
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(get_current_user)
):
    employer_id = current_user.get_employer_id()
    diag = db.query(models.DiagnosticTemplate).filter_by(id=diag_id, employer_id=employer_id).first()
    
    if not diag:
        raise HTTPException(status_code=404, detail="Diagnostic non trouvé ou vous n'avez pas les droits (Système).")
        
    db.delete(diag)
    db.commit()
    return {"status": "success"}

# ==========================================================
# REGLES CLINIQUES
# ==========================================================

@router.get("/rules")
def get_clinical_rules(
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(get_current_user)
):
    employer_id = current_user.get_employer_id()
    rules = db.query(models.ClinicalRule).filter(
        (models.ClinicalRule.employer_id == employer_id) | (models.ClinicalRule.employer_id == None)
    ).all()
    
    return [
        {
            "id": r.id,
            "rule_type": r.rule_type,
            "condition": r.condition,
            "action": r.action
        }
        for r in rules
    ]

@router.post("/rules")
def create_clinical_rule(
    data: Dict[str, Any],
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(get_current_user)
):
    employer_id = current_user.get_employer_id()
    
    new_rule = models.ClinicalRule(
        employer_id=employer_id,
        rule_type=data.get("rule_type"),
        condition=data.get("condition"),
        action=data.get("action")
    )
    
    db.add(new_rule)
    db.commit()
    db.refresh(new_rule)
    return new_rule

@router.get("/rules/pediatric-guide")
def get_pediatric_guide(
    molecule: str,
    weight: float,
    db: Session = Depends(database.get_db)
):
    """
    Évalue la règle pédiatrique pour une molécule et un poids donné.
    Remplace la logique hardcodée dans le frontend.
    """
    molecule_upper = molecule.upper()
    # Find the matching rule
    rules = db.query(models.ClinicalRule).filter(models.ClinicalRule.rule_type == 'PEDIATRIC_DOSAGE').all()
    
    matched_rule = None
    for r in rules:
        if r.condition and r.condition.get("molecule") in molecule_upper:
            matched_rule = r
            break
            
    if not matched_rule:
        return None
        
    calc_type = matched_rule.action.get("calc_type")
    
    # Evaluate
    if calc_type == "AMOXICILLINE":
        total_mg = weight * 50
        if total_mg <= 500: return {"dosage": "250MG", "posology": "1 cuillère mesure 2 fois par jour"}
        if total_mg <= 1000: return {"dosage": "500MG", "posology": "1 sachet/comprimé 2 fois par jour"}
        return {"dosage": "500MG", "posology": "1 sachet/comprimé 3 fois par jour"}
        
    if calc_type == "AUGMENTIN":
        return {"dosage": "100MG/ML", "posology": f"1 dose-poids ({weight}kg) 3 fois par jour"}
        
    if calc_type == "PARACETAMOL":
        return {"dosage": "2.4%", "posology": f"1 dose-poids ({weight}kg) toutes les 6 heures si douleur"}
        
    if calc_type == "IBUPROFENE":
        return {"dosage": "2%", "posology": f"1 dose-poids ({weight}kg) 3 fois par jour au milieu des repas"}
        
    if calc_type == "METRONIDAZOLE":
        total_mg = weight * 30
        return {"dosage": "125MG", "posology": f"{round(total_mg / 125, 1)} cuillères par jour"}
        
    return None

@router.get("/rules/pediatric-all")
def get_all_pediatric_guides(
    weight: float,
    db: Session = Depends(database.get_db)
):
    """
    Renvoie toutes les règles pédiatriques évaluées pour un poids donné.
    """
    rules = db.query(models.ClinicalRule).filter(models.ClinicalRule.rule_type == 'PEDIATRIC_DOSAGE').all()
    results = []
    
    for r in rules:
        molecule = r.condition.get("molecule", "")
        calc_type = r.action.get("calc_type")
        adult_dose = r.action.get("adult_dose", "")
        adult_posology = r.action.get("adult_posology", "")
        contraindications = r.action.get("contraindications", [])
        
        ped_dosage = ""
        ped_posology = ""
        
        if calc_type == "AMOXICILLINE":
            total_mg = weight * 50
            if total_mg <= 500: 
                ped_dosage = "250MG"
                ped_posology = "1 cuillère mesure 2 fois par jour"
            elif total_mg <= 1000:
                ped_dosage = "500MG"
                ped_posology = "1 sachet/comprimé 2 fois par jour"
            else:
                ped_dosage = "500MG"
                ped_posology = "1 sachet/comprimé 3 fois par jour"
                
        elif calc_type == "AUGMENTIN":
            ped_dosage = "100MG/ML"
            ped_posology = f"1 dose-poids ({weight}kg) 3 fois par jour"
            
        elif calc_type == "PARACETAMOL":
            ped_dosage = "2.4%"
            ped_posology = f"1 dose-poids ({weight}kg) toutes les 6 heures si douleur"
            
        elif calc_type == "IBUPROFENE":
            ped_dosage = "2%"
            ped_posology = f"1 dose-poids ({weight}kg) 3 fois par jour au milieu des repas"
            
        elif calc_type == "METRONIDAZOLE":
            total_mg = weight * 30
            ped_dosage = "125MG"
            ped_posology = f"{round(total_mg / 125, 1)} cuillères par jour"
            
        results.append({
            "molecule": molecule,
            "adult_dose": adult_dose,
            "adult_posology": adult_posology,
            "contraindications": contraindications,
            "pediatric_dosage": ped_dosage,
            "pediatric_posology": ped_posology
        })
        
    return results
