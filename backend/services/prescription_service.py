import logging
from typing import List, Dict, Any, Optional
from sqlalchemy import func, desc, case
from sqlalchemy.orm import Session
from backend import models
from backend.services.clinical_rules_engine import clinical_rules
from backend.services.habits_engine import habits_engine

logger = logging.getLogger(__name__)

class PrescriptionService:
    """
    Service d'intelligence de prescription (Phase 2 & 3).
    Gère la hiérarchie : Préférences Doc > Protocoles Système > IA.
    """

    def resolve_smart_prescription(self, db: Session, patient_id: int, acts: List[str], doctor_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Génère un plan de prescription intelligent basé sur le contexte.
        """
        # 1. Récupérer les données patient
        patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
        if not patient:
            raise ValueError("Patient introuvable")

        patient_data = {
            "age": self._calculate_age(patient.date_naissance),
            "poids": 70, # TODO: Récupérer le poids réel si dispo
            "antecedents": patient.antecedents_medicaux or ""
        }

        # 2. ANALYSE SÉCURITÉ (CRE)
        safety_analysis = clinical_rules.analyze_case(patient_data, acts)
        
        # 3. RÉCUPÉRATION DES HABITUDES (HABITS ENGINE)
        # On prend le premier acte majeur pour les habitudes
        main_act = clinical_rules._normalize_act_name(acts[0]) if acts else "DEFAULT"
        habit = db.query(models.DoctorPrescriptionPreference).filter(
            models.DoctorPrescriptionPreference.doctor_id == doctor_id,
            models.DoctorPrescriptionPreference.act_code == main_act
        ).first()

        plan_source = "Système (Standard)"
        raw_suggested_drugs = []

        if habit:
            plan_source = "Habituelle (Praticien)"
            raw_suggested_drugs = habit.drugs_json
        else:
            # Fallback sur les molécules recommandées par le CRE
            for rec in safety_analysis["recommandations_moleculaires"]:
                raw_suggested_drugs.append({
                    "name": rec["noms_commerciaux"][0],
                    "dosage": rec["dosage_defaut"],
                    "forme": rec["forme"],
                    "posologie": "Selon prescription", 
                    "relevance": habits_engine.get_relevance_score(db, doctor_id, main_act, rec["noms_commerciaux"][0]) if doctor_id else 0.5
                })

        # 4. FILTRAGE CROISÉ (Sécurité Profonde)
        final_suggested_drugs = []
        for drug in raw_suggested_drugs:
            # Vérifier si ce médicament spécifique déclenche une alerte de sécurité
            drug_warnings = self.check_safety(db, patient_id, [drug.get("name", "")])
            if any(w["severity"] == "high" for w in drug_warnings):
                logger.warning(f"⚠️ Molécule filtrée pour {patient_id} : {drug.get('name')} (Risque détecté)")
                continue # On retire la suggestion dangereuse
            final_suggested_drugs.append(drug)

        return {
            "source": plan_source,
            "act_context": main_act,
            "drugs": final_suggested_drugs,
            "safety": {
                "risques": safety_analysis["risques_identifies"],
                "dosage_note": safety_analysis["dosage_note"],
                "is_child": safety_analysis["is_child"]
            },
            "moteur": f"HabitsEngine v1.0 + {safety_analysis['moteur']}"
        }

    def learn_habit(self, db: Session, doctor_id: int, act_code: str, drugs: List[Dict[str, Any]]):
        """
        Enregistre ou met à jour une habitude de prescription.
        """
        try:
            # Nettoyer les données pour le stockage
            cleaned_drugs = []
            for d in drugs:
                cleaned_drugs.append({
                    "name": d.get("name", d.get("nom", "")),
                    "dosage": d.get("dosage", ""),
                    "forme": d.get("forme", ""),
                    "posologie": d.get("posologie", "")
                })

            existing = db.query(models.DoctorPrescriptionPreference).filter(
                models.DoctorPrescriptionPreference.doctor_id == doctor_id,
                models.DoctorPrescriptionPreference.act_code == act_code
            ).first()

            if existing:
                existing.drugs_json = cleaned_drugs
            else:
                new_habit = models.DoctorPrescriptionPreference(
                    doctor_id=doctor_id,
                    act_code=act_code,
                    drugs_json=cleaned_drugs
                )
                db.add(new_habit)
            
            db.commit()
            logger.info(f"✅ Habitude enregistrée pour {doctor_id} sur l'acte {act_code}")
        except Exception as e:
            db.rollback()
            logger.error(f"❌ Erreur apprentissage habitude : {e}")
            raise
            
    def record_medication_usage(self, db: Session, doctor_id: int, med_name: str, dosage: str = None, posologie: str = None):
        """
        Enregistre l'usage d'un médicament pour l'apprentissage futur.
        """
        try:
            med_name = med_name.strip().upper()
            existing = db.query(models.DoctorMedicationHabit).filter(
                models.DoctorMedicationHabit.doctor_id == doctor_id,
                models.DoctorMedicationHabit.medication_name == med_name,
                models.DoctorMedicationHabit.dosage == dosage,
                models.DoctorMedicationHabit.posologie == posologie
            ).first()

            if existing:
                existing.usage_count += 1
            else:
                new_habit = models.DoctorMedicationHabit(
                    doctor_id=doctor_id,
                    medication_name=med_name,
                    dosage=dosage,
                    posologie=posologie
                )
                db.add(new_habit)
            
            # Incrémenter aussi le compteur global
            global_med = db.query(models.Medication).filter(models.Medication.nom == med_name).first()
            if global_med:
                global_med.usage_count += 1
                
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"❌ Erreur record_medication_usage : {e}")

    def get_personalized_suggestions(self, db: Session, doctor_id: int, query: str = "") -> Dict[str, List[str]]:
        """
        Retourne des suggestions prioritaires basées sur les habitudes du docteur.
        Priorise les correspondances au début du nom (Start-with priority).
        """
        query = query.strip().upper()
        if not query:
            return {"medications": [], "dosages": [], "posologies": []}
        
        # 1. Médicaments favoris (Habits)
        # On utilise une expression CASE pour prioriser les correspondances au début
        med_habits = db.query(
            models.DoctorMedicationHabit.medication_name,
            func.sum(models.DoctorMedicationHabit.usage_count).label("total")
        ).filter(
            models.DoctorMedicationHabit.doctor_id == doctor_id,
            models.DoctorMedicationHabit.medication_name.ilike(f"%{query}%")
        ).group_by(models.DoctorMedicationHabit.medication_name).order_by(
            # Priorité 1 : Commence par la requête (0 = oui, 1 = non)
            case(
                (models.DoctorMedicationHabit.medication_name.ilike(f"{query}%"), 0),
                else_=1
            ),
            # Priorité 2 : Fréquence d'usage
            desc("total")
        ).limit(10).all()
        
        meds = [m[0] for m in med_habits]
        
        import urllib.request, urllib.parse, re
        # 2. Compléter avec la base globale si besoin (< 5 résultats)
        if len(meds) < 10:
            global_meds = db.query(models.Medication.nom).filter(
                models.Medication.nom.ilike(f"%{query}%"),
                ~models.Medication.nom.in_(meds)
            ).order_by(
                # Priorité 1 : Commence par la requête
                case(
                    (models.Medication.nom.ilike(f"{query}%"), 0),
                    else_=1
                ),
                # Priorité 2 : Fréquence globale
                models.Medication.usage_count.desc()
            ).limit(10 - len(meds)).all()
            meds.extend([m[0] for m in global_meds])
            
        # 3. Si toujours peu de résultats, interroger medicament.ma en direct
        if len(meds) < 3 and len(query) >= 3:
            try:
                url = f'https://medicament.ma/?choice=specialite&keyword=starts&s={urllib.parse.quote(query.strip())}'
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=3) as response:
                    html = response.read().decode('utf-8', errors='ignore')
                    matches = re.findall(r'<p class="primary">([^<]+)</p>', html)
                    for match in matches[:5]:
                        name = match.split(',', 1)[0].strip()
                        dosage_match = re.search(r'\b(\d+(?:,\d+)?\s*(?:MG|G|ML|UI|UI/ML|%|MCG))\b', name, re.IGNORECASE)
                        if dosage_match:
                            name = name.replace(dosage_match.group(1), "").strip()
                        if name not in meds:
                            meds.append(name)
            except Exception as e:
                logger.error(f"Erreur scraping medicament.ma: {e}")
        
        return {
            "medications": meds,
            "dosages": [],
            "posologies": []
        }

    def get_medication_details(self, db: Session, doctor_id: int, med_name: str) -> Dict[str, List[str]]:
        """
        Récupère les dosages et posologies habituels pour un médicament donné.
        Fallback sur le dictionnaire global si pas d'habitudes.
        """
        med_name = med_name.strip().upper()
        
        # 1. Rechercher dans les habitudes
        habits = db.query(models.DoctorMedicationHabit).filter(
            models.DoctorMedicationHabit.doctor_id == doctor_id,
            models.DoctorMedicationHabit.medication_name == med_name
        ).order_by(models.DoctorMedicationHabit.usage_count.desc()).all()
        
        dosages = list(set([h.dosage for h in habits if h.dosage]))
        posologies = list(set([h.posologie for h in habits if h.posologie]))
        
        # 2. Si vide, chercher dans le dictionnaire global
        if not dosages:
            global_meds = db.query(models.Medication).filter(
                models.Medication.nom == med_name
            ).all()
            dosages = list(set([m.dosage for m in global_meds if m.dosage]))
            # Si on n'a pas encore de posologie habituelle pour ce méd, on laisse vide 
            # ou on pourrait suggérer une posologie par défaut si elle existait en BDD.
        
        return {
            "dosages": dosages[:5],
            "posologies": posologies[:5]
        }

    def _normalize_to_molecule(self, drug_name: str) -> str:
        name = drug_name.upper().strip()
        
        brand_to_molecule = {
            "CLAMEXYL": "AMOXICILLINE",
            "AMOXIL": "AMOXICILLINE",
            "AMOXIPEN": "AMOXICILLINE",
            "BRISTAMOX": "AMOXICILLINE",
            
            "AUGMENTIN": "AMOXICILLINE/ACIDE_CLAVULANIQUE",
            "CLAVULIN": "AMOXICILLINE/ACIDE_CLAVULANIQUE",
            "AMOKLAVIN": "AMOXICILLINE/ACIDE_CLAVULANIQUE",
            "CURAM": "AMOXICILLINE/ACIDE_CLAVULANIQUE",
            
            "ADVIL": "IBUPROFENE",
            "NUREFLEX": "IBUPROFENE",
            "IBUPRON": "IBUPROFENE",
            "ALGOFENE": "IBUPROFENE",
            "DOLIPRANE": "PARACETAMOL",
            "DAFALGAN": "PARACETAMOL",
            "EFFERALGAN": "PARACETAMOL",
            
            "PROFENID": "KETOPROFENE",
            "KETUM": "KETOPROFENE",
            "BI-PROFENID": "KETOPROFENE",
            
            "VOLTARENE": "DICLOFENAC",
            "CLOFEN": "DICLOFENAC",
            
            "ZECLAR": "CLARITHROMYCINE",
            "CLACID": "CLARITHROMYCINE",
            "ROVAMYCINE": "SPIRAMYCINE",
            "BIRODOGYL": "SPIRAMYCINE/METRONIDAZOLE",
            "RODOGYL": "SPIRAMYCINE/METRONIDAZOLE",
            
            "FLAGYL": "METRONIDAZOLE",
            
            "TAHOR": "SIMVASTATINE",
            "ZOCOR": "SIMVASTATINE",
            "LIPITOR": "SIMVASTATINE",
            
            "CORDARONE": "AMIODARONE",
            
            "PREVISCAN": "WARFARINE",
            "COUMADINE": "WARFARINE",
            "SINTROM": "WARFARINE",
            "XARELTO": "RIVAROXABAN",
            "ELIQUIS": "APIXABAN",
            
            "ALCOOL": "ALCOOL"
        }
        
        for brand, molecule in brand_to_molecule.items():
            if brand in name:
                return molecule
                
        if "AMOXICILLINE" in name or "AMOXICILLIN" in name:
            return "AMOXICILLINE"
        if "IBUPROFENE" in name or "IBUPROFEN" in name:
            return "IBUPROFENE"
        if "PARACETAMOL" in name:
            return "PARACETAMOL"
        if "KETOPROFENE" in name or "KETOPROFEN" in name:
            return "KETOPROFENE"
        if "DICLOFENAC" in name:
            return "DICLOFENAC"
        if "CLARITHROMYCINE" in name or "CLARITHROMYCIN" in name:
            return "CLARITHROMYCINE"
        if "METRONIDAZOLE" in name or "METRONIDAZOL" in name:
            return "METRONIDAZOLE"
        if "SPIRAMYCINE" in name:
            return "SPIRAMYCINE"
        if "AMIODARONE" in name:
            return "AMIODARONE"
        if "SIMVASTATINE" in name or "SIMVASTATIN" in name:
            return "SIMVASTATINE"
        if "ASPIRINE" in name or "ASPIRIN" in name:
            return "ASPIRINE"
        
        return name

    def check_drug_interactions(self, drug_names: List[str]) -> List[Dict[str, Any]]:
        """
        Analyse les interactions dangereuses entre les molécules co-prescrites.
        """
        if len(drug_names) < 2:
            return []
            
        molecules = [self._normalize_to_molecule(d) for d in drug_names]
        warnings = []
        
        mol_set = set(molecules)
        
        ains_family = {"IBUPROFENE", "KETOPROFENE", "DICLOFENAC"}
        macrolide_family = {"CLARITHROMYCINE", "SPIRAMYCINE", "SPIRAMYCINE/METRONIDAZOLE"}
        anticoagulant_family = {"WARFARINE", "RIVAROXABAN", "APIXABAN"}
        metronidazole_family = {"METRONIDAZOLE", "SPIRAMYCINE/METRONIDAZOLE"}
        
        # 1. Macrolides + Statines (CRITICAL)
        if mol_set.intersection(macrolide_family) and "SIMVASTATINE" in mol_set:
            macrolide_present = list(mol_set.intersection(macrolide_family))[0]
            warnings.append({
                "type": "ddi",
                "severity": "high",
                "drug": "macrolides-simvastatine",
                "message": f"❌ Contre-indication absolue : Association Macrolides ({macrolide_present.title()}) + Simvastatine. Risque majeur de rhabdomyolyse sévère (destruction musculaire)."
            })
            
        # 2. Macrolides + Amiodarone (CRITICAL)
        if mol_set.intersection(macrolide_family) and "AMIODARONE" in mol_set:
            macrolide_present = list(mol_set.intersection(macrolide_family))[0]
            warnings.append({
                "type": "ddi",
                "severity": "high",
                "drug": "macrolides-amiodarone",
                "message": f"❌ Contre-indication absolue : Association Macrolides ({macrolide_present.title()}) + Amiodarone. Risque d'arythmie cardiaque fatale (torsades de pointes)."
            })
            
        # 3. Métronidazole + Alcool (CRITICAL)
        if mol_set.intersection(metronidazole_family) and "ALCOOL" in mol_set:
            metro_present = list(mol_set.intersection(metronidazole_family))[0]
            warnings.append({
                "type": "ddi",
                "severity": "high",
                "drug": "metronidazole-alcool",
                "message": f"❌ Contre-indication absolue : Association Métronidazole ({metro_present.title()}) + Alcool. Effet antabuse sévère (vomissements, détresse respiratoire)."
            })
            
        # 4. AINS + AINS duplication (WARNING)
        ains_present = list(mol_set.intersection(ains_family))
        if len(ains_present) >= 2:
            warnings.append({
                "type": "ddi",
                "severity": "medium",
                "drug": "ains-ains",
                "message": f"⚠️ Association déconseillée : Co-prescription de plusieurs AINS ({', '.join([a.title() for a in ains_present])}). Majoration critique de la toxicité rénale et digestive sans gain thérapeutique."
            })
            
        # 5. AINS + Aspirine (WARNING)
        if mol_set.intersection(ains_family) and "ASPIRINE" in mol_set:
            ains_present_name = list(mol_set.intersection(ains_family))[0]
            warnings.append({
                "type": "ddi",
                "severity": "medium",
                "drug": "ains-aspirine",
                "message": f"⚠️ Précaution d'emploi : Association AINS ({ains_present_name.title()}) + Aspirine. Majoration des risques hémorragiques gastro-intestinaux."
            })
            
        # 6. AINS + Anticoagulants (WARNING)
        if mol_set.intersection(ains_family) and mol_set.intersection(anticoagulant_family):
            ains_present_name = list(mol_set.intersection(ains_family))[0]
            anti_present_name = list(mol_set.intersection(anticoagulant_family))[0]
            warnings.append({
                "type": "ddi",
                "severity": "medium",
                "drug": "ains-anticoagulant",
                "message": f"⚠️ Précaution d'emploi : Association AINS ({ains_present_name.title()}) + Anticoagulant ({anti_present_name.title()}). Augmentation critique du risque d'hémorragie digestive majeure."
            })
            
        return warnings

    def check_safety(self, db: Session, patient_id: int, drug_names: List[str]) -> List[Dict[str, Any]]:
        """
        Vérifie la sécurité complète d'une ordonnance :
        1. Les contre-indications sémantiques liées aux antécédents du patient.
        2. Les interactions médicamenteuses croisées (DDI) au sein de l'ordonnance.
        3. Double-contrôle (Cross-Check) clinique : alerte si antibiotiques sans acte étiologique lié dans la séance du jour.
        4. Détection d'Omissions : suggestion de prophylaxie si aucun détartrage depuis 12 mois.
        """
        warnings = []
        
        # 1. Vérification par rapport aux antécédents si disponibles
        patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
        if patient and patient.antecedents_medicaux:
            antecedents = patient.antecedents_medicaux.lower()
            risk_map = {
                "diabète": ["sucre", "glucose", "corticoïde"],
                "hypertension": ["anti-inflammatoire", "nsaid", "ibuprofène", "diclofénac", "adrénaline"],
                "allergie": ["amoxicilline", "augmentin", "pénicilline", "clamexyl"],
                "pénicilline": ["amoxicilline", "augmentin", "pénicilline", "clamexyl"],
                "asthme": ["aspirine", "ibuprofène", "nsaid"],
                "grossesse": ["tétracycline", "ibuprofène", "aspirine"],
                "cardiaque": ["adrénaline", "anesthésie avec adrénaline"]
            }
            
            for ant, risks in risk_map.items():
                if ant in antecedents:
                    for drug in drug_names:
                        if any(r in drug.lower() for r in risks):
                            warnings.append({
                                "type": "safety",
                                "severity": "high",
                                "antecedent": ant.capitalize(),
                                "drug": drug,
                                "message": f"⚠️ Attention : Antécédent ({ant.capitalize()}) détecté. Risque avec {drug}."
                            })
        
        # 2. Vérification systématique des interactions médicamenteuses croisées (DDI)
        ddi_warnings = self.check_drug_interactions(drug_names)
        warnings.extend(ddi_warnings)

        # 3. Double-contrôle (Cross-Check) clinique : antibiotiques sans acte étiologique
        # Déterminer si un antibiotique est présent
        antibiotic_mols = {
            "AMOXICILLINE", "AMOXICILLINE/ACIDE_CLAVULANIQUE", "METRONIDAZOLE",
            "SPIRAMYCINE", "SPIRAMYCINE/METRONIDAZOLE", "CLINDAMYCINE",
            "PRISTINAMYCINE", "AZITHROMYCINE"
        }
        has_antibiotic = False
        for drug in drug_names:
            mol = self._normalize_to_molecule(drug)
            if mol in antibiotic_mols:
                has_antibiotic = True
                break

        if has_antibiotic:
            from datetime import date, timedelta
            today_date = date.today()
            past_date = today_date - timedelta(days=7)
            future_date = today_date + timedelta(days=14)

            # Rechercher les rendez-vous dans la fenêtre temporelle [-7 jours, +14 jours]
            appts_window = db.query(models.Appointment).filter(
                models.Appointment.patient_id == patient_id,
                func.date(models.Appointment.datetime_start) >= past_date,
                func.date(models.Appointment.datetime_start) <= future_date,
                models.Appointment.status != models.AppointmentStatus.ANNULE
            ).all()

            # Rechercher les actes dans la fenêtre temporelle [-7 jours, +14 jours]
            acts_window = db.query(models.Acte).filter(
                models.Acte.patient_id == patient_id,
                func.date(models.Acte.date_debut) >= past_date,
                func.date(models.Acte.date_debut) <= future_date
            ).all()

            surgical_keywords = {
                "extraction", "avulsion", "implant", "endo", "canal", "pulpite", 
                "dépulper", "depulper", "chirurgie", "parodontite", "paro", 
                "curetage", "sinus", "greffe", "lambeau", "suture", "sagesse"
            }

            has_surgical_context = False
            for appt in appts_window:
                text = f"{appt.motif or ''} {appt.notes or ''}".lower()
                if any(kw in text for kw in surgical_keywords):
                    has_surgical_context = True
                    break

            if not has_surgical_context:
                for acte in acts_window:
                    text = (acte.libelle or "").lower()
                    if any(kw in text for kw in surgical_keywords):
                        has_surgical_context = True
                        break

            if not has_surgical_context:
                warnings.append({
                    "type": "coherence",
                    "severity": "medium",
                    "drug": "antibiotique-injustifie",
                    "message": "🤖 Incohérence clinique : Prescription d'antibiothérapie sans acte chirurgical ou endodontique récent (7 derniers jours) ou planifié (14 prochains jours)."
                })

        # 4. Détection d'Omissions prophylactiques (détartrage depuis 12 mois)
        from datetime import datetime, timedelta
        one_year_ago = datetime.now() - timedelta(days=365)
        prophy_keywords = {
            "détartrage", "detartrage", "prophylaxie", "surfaçage", 
            "surfaciage", "polissage", "fluoration", "hygiène", "hygiene"
        }

        # Rechercher les actes des 12 derniers mois
        recent_acts = db.query(models.Acte).filter(
            models.Acte.patient_id == patient_id,
            models.Acte.date_debut >= one_year_ago
        ).all()

        has_prophy_recently = False
        for act in recent_acts:
            if any(kw in (act.libelle or "").lower() for kw in prophy_keywords):
                has_prophy_recently = True
                break

        if not has_prophy_recently:
            recent_appts = db.query(models.Appointment).filter(
                models.Appointment.patient_id == patient_id,
                models.Appointment.datetime_start >= one_year_ago,
                models.Appointment.status == models.AppointmentStatus.TERMINE
            ).all()
            for appt in recent_appts:
                text = f"{appt.motif or ''} {appt.notes or ''}".lower()
                if any(kw in text for kw in prophy_keywords):
                    has_prophy_recently = True
                    break

        if not has_prophy_recently:
            warnings.append({
                "type": "omission",
                "severity": "info",
                "drug": "omission-prophylaxie",
                "message": "🤖 Prévention : Aucun détartrage ou soin prophylactique détecté au cours des 12 derniers mois."
            })
        
        return warnings

    def get_doctor_presets(self, db: Session, doctor_id: int) -> List[Dict[str, Any]]:
        """
        Récupère les ordonnances types (presets) enregistrées par le docteur.
        """
        presets = db.query(models.DoctorPrescriptionPreference).filter(
            models.DoctorPrescriptionPreference.doctor_id == doctor_id
        ).order_by(models.DoctorPrescriptionPreference.updated_at.desc()).limit(10).all()
        
        return [
            {
                "id": p.id,
                "act_context": p.act_code,
                "drugs": p.drugs_json
            } for p in presets
        ]

    def delete_doctor_preset(self, db: Session, doctor_id: int, act_code: str):
        deleted = db.query(models.DoctorPrescriptionPreference).filter(
            models.DoctorPrescriptionPreference.doctor_id == doctor_id,
            models.DoctorPrescriptionPreference.act_code == act_code
        ).delete(synchronize_session=False)
        db.commit()
        return deleted > 0

    def get_doctor_habits_summary(self, db: Session, doctor_id: int) -> Dict[str, Any]:
        """
        Récupère une synthèse des habitudes globales du docteur pour le contexte IA.
        """
        # 1. Top médicaments
        med_habits = db.query(
            models.DoctorMedicationHabit.medication_name,
            func.sum(models.DoctorMedicationHabit.usage_count).label("total")
        ).filter(models.DoctorMedicationHabit.doctor_id == doctor_id
        ).group_by(models.DoctorMedicationHabit.medication_name
        ).order_by(desc("total")).limit(5).all()

        # 2. Top Presets (Actes)
        presets = db.query(models.DoctorPrescriptionPreference.act_code).filter(
            models.DoctorPrescriptionPreference.doctor_id == doctor_id
        ).limit(5).all()

        return {
            "top_medications": [m[0] for m in med_habits],
            "favorite_acts": [p[0] for p in presets]
        }

    def _calculate_age(self, birth_date) -> int:
        from datetime import date
        today = date.today()
        return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))

prescription_service = PrescriptionService()
