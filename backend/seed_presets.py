import asyncio
from sqlalchemy.orm import Session
from backend.database import SessionLocal, engine
from backend.models import Base, ClinicalCategory, ClinicalProtocol

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # Check if already seeded
    categories = db.query(ClinicalCategory).all()
    if len(categories) == 0:
        cat_postop = ClinicalCategory(label="Chirurgie / Post-Op")
        cat_infect = ClinicalCategory(label="Infection / Abcès")
        cat_paro = ClinicalCategory(label="Parodontie")
        cat_urgence = ClinicalCategory(label="Urgence Douleur")
        cat_implanto = ClinicalCategory(label="Implantologie")
        
        db.add_all([cat_postop, cat_infect, cat_paro, cat_urgence, cat_implanto])
        db.commit()
    else:
        cat_postop = categories[0]
        cat_infect = categories[0]
        cat_paro = categories[0]
        cat_urgence = categories[0]
        cat_implanto = categories[0]
    
    # clear existing protocols to re-seed cleanly
    db.query(ClinicalProtocol).delete()
    db.commit()


    
    # Seed Protocols
    protocols = [
        ClinicalProtocol(
            category_id=cat_postop.id,
            variant_name="Avulsion Simple",
            medications_json=[
                {"name": "DOLIPRANE", "dosage": "1G", "forme": "COMPRIMÉS", "posologie": "1 cp x 3 / jour pendant 4 jours"},
                {"name": "HEXTRIL", "dosage": "-", "forme": "BAIN DE BOUCHE", "posologie": "2 rincages / jour pendant 7 jours"}
            ]
        ),
        ClinicalProtocol(
            category_id=cat_postop.id,
            variant_name="Extraction Sagesse / Chirurgie",
            medications_json=[
                {"name": "CLAMOXYL", "dosage": "1G", "forme": "GÉLULES", "posologie": "1 gél Matin et Soir pendant 6 jours"},
                {"name": "ANTADYS", "dosage": "100MG", "forme": "COMPRIMÉS", "posologie": "1 cp Matin et Soir pendant 3 jours (au milieu des repas)"},
                {"name": "DOLIPRANE", "dosage": "1G", "forme": "COMPRIMÉS", "posologie": "1 cp x 3 / jour si douleur"},
                {"name": "HEXTRIL", "dosage": "-", "forme": "BAIN DE BOUCHE", "posologie": "2 rincages / jour à partir de demain"}
            ]
        ),
        ClinicalProtocol(
            category_id=cat_infect.id,
            variant_name="Abcès / Infection",
            medications_json=[
                {"name": "AUGMENTIN", "dosage": "1G", "forme": "SACHETS", "posologie": "1 sach Matin et Soir pendant 7 jours"},
                {"name": "DOLIPRANE", "dosage": "1G", "forme": "COMPRIMÉS", "posologie": "1 cp x 3 / jour si douleur"}
            ]
        ),
        ClinicalProtocol(
            category_id=cat_paro.id,
            variant_name="Gingivite / Parodontite",
            medications_json=[
                {"name": "BI-RODOGYL", "dosage": "-", "forme": "COMPRIMÉS", "posologie": "1 cp x 3 / jour pendant 6 jours"},
                {"name": "HEXTRIL", "dosage": "-", "forme": "BAIN DE BOUCHE", "posologie": "2 rincages / jour pendant 10 jours"},
                {"name": "DOLIPRANE", "dosage": "1G", "forme": "COMPRIMÉS", "posologie": "1 cp x 3 / jour si douleur"}
            ]
        ),
        ClinicalProtocol(
            category_id=cat_urgence.id,
            variant_name="Pulpite / Douleur Aiguë",
            medications_json=[
                {"name": "ALGODONT", "dosage": "-", "forme": "COMPRIMÉS", "posologie": "1 cp x 3 / jour"},
                {"name": "SOLUPRED", "dosage": "20MG", "forme": "COMPRIMÉS", "posologie": "3 cp le matin pendant 3 jours"}
            ]
        ),
        ClinicalProtocol(
            category_id=cat_implanto.id,
            variant_name="Chirurgie Implantaire",
            medications_json=[
                {"name": "AUGMENTIN", "dosage": "1G", "forme": "SACHETS", "posologie": "1 sach Matin et Soir pendant 7 jours"},
                {"name": "SOLUPRED", "dosage": "20MG", "forme": "COMPRIMÉS", "posologie": "3 cp le matin pendant 3 jours"},
                {"name": "DOLIPRANE", "dosage": "1G", "forme": "COMPRIMÉS", "posologie": "1 cp x 3 / jour si douleur"},
                {"name": "ELUDRIL", "dosage": "-", "forme": "BAIN DE BOUCHE", "posologie": "2 rincages / jour à partir du lendemain"}
            ]
        ),
    ]
    
    db.add_all(protocols)
    db.commit()
    print("Presets seeded successfully.")
    db.close()

if __name__ == "__main__":
    seed()
