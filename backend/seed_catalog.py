"""Seed the dental act catalog with standard specialties and acts."""
from backend.database import SessionLocal
from backend import models

CATALOG = [
    {
        "name": "CONSERVATRICE",
        "color": "#3B82F6",
        "acts": [
            {"name": "Composite 1 face", "base_price": 400, "code": "HBMD001"},
            {"name": "Composite 2 faces", "base_price": 550, "code": "HBMD002"},
            {"name": "Composite 3 faces", "base_price": 700, "code": "HBMD003"},
            {"name": "Inlay/Onlay céramique", "base_price": 2500, "code": "HBMD004"},
            {"name": "Traitement hypersensibilité", "base_price": 200, "code": "HBMD005"},
            {"name": "Scellement de fissures", "base_price": 200, "code": "HBMD006"},
        ],
    },
    {
        "name": "ENDODONTIE",
        "color": "#6366F1",
        "acts": [
            {"name": "Traitement canalaire mono-radiculé", "base_price": 800, "code": "HBMD020"},
            {"name": "Traitement canalaire bi-radiculé", "base_price": 1100, "code": "HBMD021"},
            {"name": "Traitement canalaire tri-radiculé", "base_price": 1400, "code": "HBMD022"},
            {"name": "Retraitement canalaire", "base_price": 1500, "code": "HBMD023"},
            {"name": "Pulpotomie", "base_price": 400, "code": "HBMD024"},
            {"name": "Pulpectomie", "base_price": 600, "code": "HBMD025"},
        ],
    },
    {
        "name": "CHIRURGIE",
        "color": "#EF4444",
        "acts": [
            {"name": "Extraction simple", "base_price": 300, "code": "HBMD040"},
            {"name": "Extraction dent de sagesse", "base_price": 800, "code": "HBMD041"},
            {"name": "Extraction chirurgicale", "base_price": 1200, "code": "HBMD042"},
            {"name": "Alvéolectomie", "base_price": 600, "code": "HBMD043"},
            {"name": "Frenectomie", "base_price": 800, "code": "HBMD044"},
            {"name": "Résection apicale", "base_price": 1500, "code": "HBMD045"},
        ],
    },
    {
        "name": "PROTHESE",
        "color": "#10B981",
        "acts": [
            {"name": "Couronne céramo-métallique", "base_price": 3500, "code": "HBMD060"},
            {"name": "Couronne zircone", "base_price": 5000, "code": "HBMD061"},
            {"name": "Couronne provisoire", "base_price": 600, "code": "HBMD062"},
            {"name": "Bridge 3 éléments", "base_price": 9000, "code": "HBMD063"},
            {"name": "Prothèse adjointe partielle", "base_price": 4000, "code": "HBMD064"},
            {"name": "Prothèse complète", "base_price": 6000, "code": "HBMD065"},
            {"name": "Facette céramique", "base_price": 4000, "code": "HBMD066"},
            {"name": "Inlay core", "base_price": 1200, "code": "HBMD067"},
        ],
    },
    {
        "name": "IMPLANTOLOGIE",
        "color": "#8B5CF6",
        "acts": [
            {"name": "Pose implant", "base_price": 8000, "code": "HBMD080"},
            {"name": "Couronne sur implant", "base_price": 5000, "code": "HBMD081"},
            {"name": "Greffe osseuse", "base_price": 5000, "code": "HBMD082"},
            {"name": "Élévation sinusienne", "base_price": 7000, "code": "HBMD083"},
            {"name": "Prothèse implanto-portée", "base_price": 15000, "code": "HBMD084"},
        ],
    },
    {
        "name": "PARODONTOLOGIE",
        "color": "#14B8A6",
        "acts": [
            {"name": "Détartrage & Polissage", "base_price": 400, "code": "HBMD100"},
            {"name": "Surfaçage radiculaire (secteur)", "base_price": 1200, "code": "HBMD101"},
            {"name": "Curetage parodontal", "base_price": 800, "code": "HBMD102"},
            {"name": "Bilan parodontal", "base_price": 500, "code": "HBMD103"},
            {"name": "Lambeau parodontal", "base_price": 3000, "code": "HBMD104"},
        ],
    },
    {
        "name": "ORTHODONTIE",
        "color": "#0EA5E9",
        "acts": [
            {"name": "Semestre ODF multibagues", "base_price": 4500, "code": "HBMD120"},
            {"name": "Contention amovible", "base_price": 1500, "code": "HBMD121"},
            {"name": "Gouttière aligneur (par semestre)", "base_price": 6000, "code": "HBMD122"},
            {"name": "Bilan orthodontique", "base_price": 800, "code": "HBMD123"},
        ],
    },
    {
        "name": "PREVENTION",
        "color": "#F59E0B",
        "acts": [
            {"name": "Fluorisation", "base_price": 300, "code": "HBMD140"},
            {"name": "Scellement prophylactique", "base_price": 250, "code": "HBMD141"},
            {"name": "Consultation standard", "base_price": 300, "code": "HBMD142"},
            {"name": "Radiographie panoramique", "base_price": 400, "code": "HBMD143"},
        ],
    },
    {
        "name": "ESTHETIQUE",
        "color": "#EC4899",
        "acts": [
            {"name": "Blanchiment dentaire (cabinet)", "base_price": 2500, "code": "HBMD160"},
            {"name": "Gouttière blanchiment", "base_price": 1200, "code": "HBMD161"},
            {"name": "Reconstitution esthétique", "base_price": 1500, "code": "HBMD162"},
        ],
    },
]


def seed_catalog():
    db = SessionLocal()
    try:
        existing = db.query(models.Specialty).count()
        if existing > 0:
            print(f"Catalogue déjà seedé ({existing} spécialités). Rien à faire.")
            return

        for spec_data in CATALOG:
            acts_data = spec_data.pop("acts")
            specialty = models.Specialty(**spec_data)
            db.add(specialty)
            db.flush()
            for act in acts_data:
                db.add(models.CatalogAct(specialty_id=specialty.id, **act))

        db.commit()
        total_acts = sum(len(s.get("acts", [])) for s in CATALOG) if False else db.query(models.CatalogAct).count()
        print(f"OK Catalogue sede : {len(CATALOG)} specialites, {total_acts} actes.")
    except Exception as e:
        db.rollback()
        print(f"ERREUR : {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_catalog()
