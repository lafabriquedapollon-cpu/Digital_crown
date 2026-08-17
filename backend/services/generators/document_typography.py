"""Registre typographique centralisé — Digital Crown PDF System."""

# === Tailles ReportLab (pts) ===
# Hiérarchie générique commune à tous les documents (ordonnance, certificat,
# devis, note d'honoraires, lettre médicale...). Alias attendus par
# DOCUMENT-RENDER-CONSISTENCY-1 : DOCUMENT_TITLE_SIZE=TITLE_SIZE,
# DOCUMENT_BODY_SIZE=BODY_SIZE, DOCUMENT_SMALL_SIZE=SMALL_SIZE,
# DOCUMENT_FOOTER_SIZE=FOOTER_SIZE — noms conservés tels quels (déjà utilisés
# par bilan_ortho_gen.py et d'autres) pour ne rien casser ; seul
# DOCUMENT_META_SIZE (bloc patient/date) était réellement manquant.
TITLE_SIZE = 20
SECTION_TITLE_SIZE = 14
BODY_SIZE = 11
DOCUMENT_META_SIZE = 10.5  # bloc patient/date — niveau intermédiaire titre/corps
SMALL_SIZE = 9
TABLE_HEADER_SIZE = 9
TABLE_CELL_SIZE = 9.5
FOOTER_SIZE = 7.5
MIN_READABLE_SIZE = 7.0
LINE_HEIGHT_RATIO = 1.4

# === Largeurs de colonnes table métriques céphalo (%) ===
COL_METRIC_PCT = "40%"
COL_VALEUR_PCT = "18%"
COL_NORME_PCT = "28%"
COL_STATUT_PCT = "14%"

# === Tailles ReportLab (pts) — ordonnances/prescriptions ===
PRESCRIPTION_TITLE_SIZE = 17
PRESCRIPTION_PATIENT_SIZE = 10.5
PRESCRIPTION_DRUG_NAME_SIZE = 12.5
PRESCRIPTION_META_SIZE = 10        # forme/dosage
PRESCRIPTION_DOSAGE_SIZE = 10.5
PRESCRIPTION_INSTRUCTION_SIZE = 11.5  # posologie

# === Largeurs de colonnes fixes — grille médicament/forme/dosage (cm) ===
# Fixes et constantes pour TOUTES les lignes d'une même ordonnance : si les
# largeurs variaient selon la présence de forme/dosage sur chaque ligne, les
# colonnes ne s'alignaient plus verticalement entre médicaments.
PRESCRIPTION_COL_NAME_CM = 7.0
PRESCRIPTION_COL_FORME_CM = 3.0
PRESCRIPTION_COL_DOSE_CM = 1.8

# === Labels courts pour métriques céphalo ===
# Utilisés dans les tables PDF pour éviter les débordements de cellule
METRIC_SHORT_LABELS = {
    "Angle_Nasolabial": "Naso-labial",
    "Inter_Incisif": "Inter-incisif",
    "I_Francfort": "Inc./Francfort",
    "I_NA_mm": "Inc./NA (mm)",
    "I_NB_mm": "Inc./NB (mm)",
    "Décalage_A_B": "Décalage A-B",
    "Decalage_A_B": "Décalage A-B",
    "Profondeur_Faciale": "Prof. Faciale",
    "Situation_A": "Situ. A",
    "Situation_B": "Situ. B",
}

def short_label(metric_name: str) -> str:
    """Retourne le label court pour une métrique céphalo.

    Utilisé uniquement pour les noms de métriques dans les tables,
    jamais pour les valeurs cliniques (qui restent inchangées).
    Ne retourne jamais une chaîne vide (évite une cellule d'en-tête blanche).
    """
    if not metric_name:
        return "Métrique"
    return METRIC_SHORT_LABELS.get(metric_name, metric_name.replace("_", " "))
