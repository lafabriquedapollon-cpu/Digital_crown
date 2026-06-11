import asyncio
from backend.database import SessionLocal, engine
from backend.models import Base, ClinicalRule

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    rules = [
        {
            "molecule": "AMOXICILLINE",
            "adult_dose": "1G",
            "adult_posology": "1 comprimé 2 à 3 fois par jour pendant 6 jours",
            "contraindications": ["ALLERGIE PENICILLINE", "ALLERGIE BETA LACTAMINES"],
            "calc_type": "AMOXICILLINE"
        },
        {
            "molecule": "AMOXICILLINE + ACIDE CLAVULANIQUE",
            "adult_dose": "1G",
            "adult_posology": "1 sachet 2 fois par jour pendant 7 jours",
            "contraindications": ["ALLERGIE PENICILLINE", "INSUFFISANCE HEPATIQUE"],
            "calc_type": "AUGMENTIN"
        },
        {
            "molecule": "PARACETAMOL",
            "adult_dose": "1G",
            "adult_posology": "1 comprimé toutes les 6 heures si douleur (max 4g/jour)",
            "contraindications": ["INSUFFISANCE HEPATIQUE SEVERE"],
            "calc_type": "PARACETAMOL"
        },
        {
            "molecule": "IBUPROFENE",
            "adult_dose": "400MG",
            "adult_posology": "1 comprimé toutes les 8 heures si douleur au milieu des repas",
            "contraindications": ["FEMME ENCEINTE", "ULCERE", "INFECTION SEVERE SANS ANTIBIOTIQUE", "ALLERGIE AINS", "ASTHME"],
            "calc_type": "IBUPROFENE"
        },
        {
            "molecule": "METRONIDAZOLE",
            "adult_dose": "500MG",
            "adult_posology": "1 comprimé 3 fois par jour pendant 7 jours",
            "contraindications": ["GROSSESSE", "ALLAITEMENT", "ALCOOL"],
            "calc_type": "METRONIDAZOLE"
        }
    ]
    
    # clear old
    db.query(ClinicalRule).filter(ClinicalRule.rule_type == 'PEDIATRIC_DOSAGE').delete()
    
    for r in rules:
        db.add(ClinicalRule(
            rule_type='PEDIATRIC_DOSAGE',
            condition={"molecule": r["molecule"]},
            action={
                "adult_dose": r["adult_dose"],
                "adult_posology": r["adult_posology"],
                "contraindications": r["contraindications"],
                "calc_type": r["calc_type"]
            }
        ))
        
    db.commit()
    print("Clinical rules seeded.")
    db.close()

if __name__ == "__main__":
    seed()
