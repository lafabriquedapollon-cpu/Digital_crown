import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal
from backend.models import DiagnosticTemplate, Medicament, ClinicalRule

# Import hardcoded data from frontend
# Actually, since frontend is in TypeScript, we'll manually seed the data in python
# to match what's in DiagnosticEngine.ts, clinical_rules.ts, PrescriptionForm.tsx

def seed_medical_library():
    db = SessionLocal()
    
    # Check if already seeded
    if db.query(DiagnosticTemplate).first():
        print("Medical library already seeded.")
        return

    print("Seeding Medicaments...")
    medicaments = [
        {"name": "AMOXICILLINE", "dosage": "1g", "forme": "Gélules", "posologie_default": "1 gélule Matin et Soir pendant 7 jours", "type": "ANTIBIOTIQUE", "substitution_allergie": "CLINDAMYCINE"},
        {"name": "AMOXICILLINE + ACIDE CLAVULANIQUE", "dosage": "1g/125mg", "forme": "Sachets", "posologie_default": "1 sachet Matin et Soir pendant 7 jours", "type": "ANTIBIOTIQUE", "substitution_allergie": "CLINDAMYCINE"},
        {"name": "PARACETAMOL", "dosage": "1g", "forme": "Comprimés", "posologie_default": "1 comprimé 3 fois par jour en cas de douleur", "type": "ANTALGIQUE", "substitution_allergie": ""},
        {"name": "IBUPROFENE", "dosage": "400mg", "forme": "Comprimés", "posologie_default": "1 comprimé 3 fois par jour au cours des repas", "type": "AINS", "substitution_allergie": ""},
        {"name": "METRONIDAZOLE", "dosage": "500mg", "forme": "Comprimés", "posologie_default": "1 comprimé 3 fois par jour", "type": "ANTIBIOTIQUE", "substitution_allergie": ""},
        {"name": "CLINDAMYCINE", "dosage": "600mg", "forme": "Gélules", "posologie_default": "600mg par jour en 2 à 3 prises", "type": "ANTIBIOTIQUE", "substitution_allergie": ""},
        {"name": "CHLORHEXIDINE", "dosage": "0.12%", "forme": "Bain de bouche", "posologie_default": "1 bain de bouche pur ou dilué 2 fois par jour", "type": "BAIN_BOUCHE", "substitution_allergie": ""}
    ]
    
    for m in medicaments:
        med = Medicament(employer_id=None, **m)
        db.add(med)

    print("Seeding Clinical Rules...")
    rules = [
        {"rule_type": "ALLERGY", "condition": {"allergy_keywords": ["pénicilline", "penicilline", "clamoxyl", "amoxicilline"]}, "action": {"substitute": "CLINDAMYCINE", "warning": "Substitution cause Allergie Pénicilline"}},
        {"rule_type": "POSOLOGY", "condition": {"patient_type": "enfant", "molecule": "AMOXICILLINE"}, "action": {"formula": "weight_kg * 80", "unit": "mg/jour", "prises": 3}}
    ]
    
    for r in rules:
        rule = ClinicalRule(employer_id=None, **r)
        db.add(rule)

    print("Seeding Diagnostic Templates...")
    templates = [
        {
            "motif": "DOULEUR",
            "vitality": "POSITIVE_PERSISTANTE",
            "title": "🦷 Pulpite Irréversible Aiguë",
            "description": "Inflammation sévère et irréversible de la pulpe. Douleur spontanée lancinante, accrue en position couchée.",
            "protocol": ["PARACETAMOL 1g x3/jour", "⚠️ AINS contre-indiqués sans couverture antibiotique"],
            "treatment_plan": [{"phase": "ENDO", "act": "Traitement Canalaire (Pulpectomie)", "price": 1200}, {"phase": "PROTHESE", "act": "Reconstruction Corono-Radiculaire", "price": 3500}],
            "warnings": ["⚠️ Risque de nécrose pulpaire rapide en l'absence de traitement étiologique direct sous digue."]
        },
        {
            "motif": "DOULEUR",
            "vitality": "POSITIVE_TRANSITOIRE",
            "title": "🦷 Pulpite Réversible / Hyperémie Pulpaire",
            "description": "Réaction inflammatoire pulpaire modérée liée à une carie active ou une agression mécanique.",
            "protocol": ["PARACETAMOL 500mg si besoin"],
            "treatment_plan": [{"phase": "CONSERVATRICE", "act": "Restauration Composite / Cavotech", "price": 400}],
            "warnings": []
        },
        {
            "motif": "DOULEUR",
            "vitality": "NEGATIVE",
            "percussion": "POSITIVE_AXIALE",
            "title": "🌋 Parodontite Apicale Aiguë",
            "description": "Nécrose pulpaire compliquée d'une infection du ligament parodontal apical.",
            "protocol": ["AMOXICILLINE 1g x2/jour (dalacine si allergie)", "PARACETAMOL 1g x3/jour"],
            "treatment_plan": [{"phase": "ENDO", "act": "Ouverture de chambre & Désinfection canalaire", "price": 800}],
            "warnings": ["🔴 Contre-indication formelle d'AINS seul."]
        },
        {
            "motif": "GONFLEMENT",
            "palpation": "FLUCTUANTE",
            "title": "🌋 Abcès Périapical Aigu",
            "description": "Collection purulente localisée au niveau de l'apex radiculaire d'origine pulpaire.",
            "protocol": ["AMOXICILLINE 1g x2/jour", "PARACETAMOL 1g x3/jour"],
            "treatment_plan": [{"phase": "ENDO", "act": "Ouverture & Drainage canalaire d'urgence", "price": 800}, {"phase": "CHIRURGIE", "act": "Extraction chirurgicale si dent non conservable", "price": 900}],
            "warnings": ["🔴 Urgence Médicale : Prescription immédiate d'Amoxicilline."]
        }
    ]
    
    for t in templates:
        diag = DiagnosticTemplate(employer_id=None, **t)
        db.add(diag)

    db.commit()
    print("Seed completed successfully!")

if __name__ == "__main__":
    seed_medical_library()
