"""Tests routers/prescriptions.py and actes_router — habits, safety, actes CRUD."""
from datetime import datetime, timedelta


def _make_patient(db, dentiste, nom="PRXPAT"):
    from backend import models
    pat = models.Patient(
        nom=nom, prenom="Test",
        date_naissance=datetime(1990, 1, 1),
        sexe="F",
        employer_id=dentiste.id,
    )
    db.add(pat)
    db.flush()
    db.add(models.DossierClinique(patient_id=pat.id, is_ortho_active=False))
    db.commit()
    db.refresh(pat)
    return pat


# ── medication search ────────────────────────────────────────────────────────

class TestMedicationSearch:
    def test_requires_auth(self, client):
        r = client.get("/api/prescriptions/search?q=amox")
        assert r.status_code == 401

    def test_search_returns_list(self, client, auth_headers):
        r = client.get("/api/prescriptions/search?q=amox", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_unknown_medication_returns_empty(self, client, auth_headers):
        r = client.get("/api/prescriptions/search?q=zzzunknown999", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_search_with_existing_medication(self, client, db, auth_headers):
        from backend import models
        med = models.Medication(nom="Amoxicilline 500mg", dosage="500mg", forme="Gélule")
        db.add(med)
        db.commit()

        r = client.get("/api/prescriptions/search?q=Amoxicilline", headers=auth_headers)
        assert r.status_code == 200
        names = [m["nom"] for m in r.json()]
        assert any("Amoxicilline" in n for n in names)


# ── suggest protocols ────────────────────────────────────────────────────────

class TestSuggestProtocols:
    def test_requires_auth(self, client):
        r = client.get("/api/prescriptions/suggest?category_id=1")
        assert r.status_code == 401

    def test_nonexistent_category_returns_empty(self, client, auth_headers):
        r = client.get("/api/prescriptions/suggest?category_id=999999", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == []


# ── habits endpoints ─────────────────────────────────────────────────────────

class TestPrescriptionHabits:
    def test_habits_suggest_requires_auth(self, client):
        r = client.get("/api/prescriptions/habits/suggest")
        assert r.status_code == 401

    def test_habits_suggest_returns_200(self, client, auth_headers):
        r = client.get("/api/prescriptions/habits/suggest?q=amox", headers=auth_headers)
        assert r.status_code == 200

    def test_habits_suggest_empty_query(self, client, auth_headers):
        r = client.get("/api/prescriptions/habits/suggest", headers=auth_headers)
        assert r.status_code == 200

    def test_habits_details_requires_auth(self, client):
        r = client.get("/api/prescriptions/habits/details?med_name=Amox")
        assert r.status_code == 401

    def test_habits_details_returns_result(self, client, auth_headers):
        r = client.get("/api/prescriptions/habits/details?med_name=Amox", headers=auth_headers)
        assert r.status_code == 200

    def test_habits_presets_requires_auth(self, client):
        r = client.get("/api/prescriptions/habits/presets")
        assert r.status_code == 401

    def test_habits_presets_returns_list(self, client, auth_headers):
        r = client.get("/api/prescriptions/habits/presets", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_saved_prescription_can_be_listed_and_deleted(self, client, auth_headers):
        payload = {
            "act_code": "Post extraction",
            "drugs": [{"name": "DOLIPRANE", "dosage": "1G", "forme": "COMPRIMÉS", "posologie": "1 cp x 3/j"}],
        }
        saved = client.post("/api/prescriptions/preferences", json=payload, headers=auth_headers)
        assert saved.status_code == 200

        listed = client.get("/api/prescriptions/habits/presets", headers=auth_headers)
        assert listed.status_code == 200
        assert any(p["act_context"] == "POST EXTRACTION" for p in listed.json())

        deleted = client.delete("/api/prescriptions/preferences/POST%20EXTRACTION", headers=auth_headers)
        assert deleted.status_code == 200
        listed_again = client.get("/api/prescriptions/habits/presets", headers=auth_headers)
        assert all(p["act_context"] != "POST EXTRACTION" for p in listed_again.json())

    def test_deleting_unknown_saved_prescription_returns_404(self, client, auth_headers):
        r = client.delete("/api/prescriptions/preferences/INCONNUE", headers=auth_headers)
        assert r.status_code == 404

    def test_record_habit_requires_auth(self, client):
        r = client.post("/api/prescriptions/habits/record", json={"medication_name": "Amox"})
        assert r.status_code == 401

    def test_record_habit_missing_name_returns_400(self, client, auth_headers):
        r = client.post("/api/prescriptions/habits/record", json={}, headers=auth_headers)
        assert r.status_code == 400

    def test_record_habit_success(self, client, auth_headers):
        r = client.post(
            "/api/prescriptions/habits/record",
            json={"medication_name": "Amoxicilline 500mg", "dosage": "500mg", "posologie": "3x/j"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "success"

    def test_record_habit_batch_success(self, client, auth_headers):
        r = client.post(
            "/api/prescriptions/habits/record-batch",
            json=[
                {"medication_name": "Ibuprofène 400mg", "dosage": "400mg"},
                {"medication_name": "Metronidazole 500mg", "dosage": "500mg"},
            ],
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "success"

    def test_record_habit_batch_skips_empty_names(self, client, auth_headers):
        r = client.post(
            "/api/prescriptions/habits/record-batch",
            json=[{"medication_name": ""}, {"dosage": "100mg"}],
            headers=auth_headers,
        )
        assert r.status_code == 200


# ── safety check ─────────────────────────────────────────────────────────────

class TestSafetyCheck:
    def test_requires_auth(self, client):
        r = client.post("/api/prescriptions/safety/check", json={"patient_id": 1, "drug_names": []})
        assert r.status_code == 401

    def test_missing_patient_id_returns_400(self, client, auth_headers):
        r = client.post(
            "/api/prescriptions/safety/check",
            json={"drug_names": ["Amox"]},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_valid_check_returns_200(self, client, db, auth_headers, dentiste):
        pat = _make_patient(db, dentiste, "SAFEPAT")
        r = client.post(
            "/api/prescriptions/safety/check",
            json={"patient_id": pat.id, "drug_names": ["Amoxicilline", "Ibuprofène"]},
            headers=auth_headers,
        )
        assert r.status_code == 200

    def test_empty_drug_names_ok(self, client, db, auth_headers, dentiste):
        pat = _make_patient(db, dentiste, "SAFENODRUG")
        r = client.post(
            "/api/prescriptions/safety/check",
            json={"patient_id": pat.id, "drug_names": []},
            headers=auth_headers,
        )
        assert r.status_code == 200


# ── smart suggest ─────────────────────────────────────────────────────────────

class TestSmartSuggest:
    def test_requires_auth(self, client):
        r = client.get("/api/prescriptions/smart-suggest/1")
        assert r.status_code == 401

    def test_foreign_patient_returns_403_or_404(self, client, auth_headers):
        r = client.get("/api/prescriptions/smart-suggest/999999", headers=auth_headers)
        assert r.status_code in (403, 404)

    def test_valid_patient_returns_dict(self, client, db, auth_headers, dentiste):
        pat = _make_patient(db, dentiste, "SMARTSUG")
        r = client.get(f"/api/prescriptions/smart-suggest/{pat.id}", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), dict)


# ── actes CRUD ────────────────────────────────────────────────────────────────

class TestActesCRUD:
    def test_catalog_search_requires_auth(self, client):
        r = client.get("/api/actes/catalog/search")
        assert r.status_code == 401

    def test_catalog_search_empty_query_returns_list(self, client, auth_headers):
        r = client.get("/api/actes/catalog/search", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_catalog_search_with_query(self, client, auth_headers):
        r = client.get("/api/actes/catalog/search?q=carie", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_duration_requires_auth(self, client):
        r = client.get("/api/actes/duration?q=carie")
        assert r.status_code == 401

    def test_get_duration_returns_duration(self, client, auth_headers):
        r = client.get("/api/actes/duration?q=orthodontie", headers=auth_headers)
        assert r.status_code == 200
        assert "duration" in r.json()

    def test_brain_summary_requires_auth(self, client):
        r = client.get("/api/actes/brain/summary")
        assert r.status_code == 401

    def test_brain_summary_returns_structure(self, client, auth_headers):
        r = client.get("/api/actes/brain/summary", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert "frequent_acts" in body
        assert "frequent_drugs" in body
        assert "total_knowledge_points" in body

    def test_create_acte_requires_auth(self, client):
        r = client.post("/api/actes/", json={"patient_id": 1, "libelle": "Carie"})
        assert r.status_code == 401

    def test_create_acte_missing_patient_id_returns_400(self, client, auth_headers):
        r = client.post(
            "/api/actes/",
            json={"libelle": "Carie", "montant": 500},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_create_acte_foreign_patient_returns_403_or_404(self, client, auth_headers):
        r = client.post(
            "/api/actes/",
            json={"patient_id": 999999, "libelle": "Carie", "montant": 500},
            headers=auth_headers,
        )
        assert r.status_code in (403, 404)

    def test_create_acte_success(self, client, db, auth_headers, dentiste):
        pat = _make_patient(db, dentiste, "ACTECREAT")
        r = client.post(
            "/api/actes/",
            json={"patient_id": pat.id, "libelle": "Détartrage", "montant": 300.0, "type_acte": "SOIN"},
            headers=auth_headers,
        )
        assert r.status_code == 201
        body = r.json()
        assert body["status"] == "success"
        assert "act_id" in body
        assert body["labjob_created"] is False

    def test_create_acte_prothese_creates_labjob(self, client, db, auth_headers, dentiste):
        pat = _make_patient(db, dentiste, "ACTEPROTH")
        r = client.post(
            "/api/actes/",
            json={"patient_id": pat.id, "libelle": "Couronne Zircone", "montant": 8000.0, "type_acte": "PROTHESE"},
            headers=auth_headers,
        )
        assert r.status_code == 201
        assert r.json()["labjob_created"] is True

    def test_get_patient_actes_requires_auth(self, client):
        r = client.get("/api/actes/patient/1")
        assert r.status_code == 401

    def test_get_patient_actes_foreign_returns_403_or_404(self, client, auth_headers):
        r = client.get("/api/actes/patient/999999", headers=auth_headers)
        assert r.status_code in (403, 404)

    def test_get_patient_actes_returns_list(self, client, db, auth_headers, dentiste):
        pat = _make_patient(db, dentiste, "ACTEGET")
        from backend import models
        act = models.Acte(
            patient_id=pat.id,
            praticien_id=dentiste.id,
            type_acte=models.ActeType.SOIN,
            libelle="Détartrage",
            montant=300.0,
            date_debut=datetime.now(),
            statut_paiement=models.PaiementStatut.EN_ATTENTE,
        )
        db.add(act)
        db.commit()

        r = client.get(f"/api/actes/patient/{pat.id}", headers=auth_headers)
        assert r.status_code == 200
        actes = r.json()
        assert len(actes) >= 1
        assert actes[0]["libelle"] == "Détartrage"

    def test_get_patient_actes_empty_list(self, client, db, auth_headers, dentiste):
        pat = _make_patient(db, dentiste, "ACTEEMPTY")
        r = client.get(f"/api/actes/patient/{pat.id}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_update_acte_requires_auth(self, client):
        r = client.put("/api/actes/1", json={"montant": 400})
        assert r.status_code == 401

    def test_update_acte_nonexistent_returns_404(self, client, auth_headers):
        r = client.put("/api/actes/999999", json={"montant": 400}, headers=auth_headers)
        assert r.status_code == 404

    def test_update_acte_montant_and_status(self, client, db, auth_headers, dentiste):
        pat = _make_patient(db, dentiste, "ACTEUPD")
        from backend import models
        act = models.Acte(
            patient_id=pat.id,
            praticien_id=dentiste.id,
            type_acte=models.ActeType.SOIN,
            libelle="Composite",
            montant=700.0,
            date_debut=datetime.now(),
            statut_paiement=models.PaiementStatut.EN_ATTENTE,
        )
        db.add(act)
        db.commit()
        db.refresh(act)

        r = client.put(
            f"/api/actes/{act.id}",
            json={"montant": 750.0, "statut_paiement": "PAYE"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["acte"]["montant"] == 750.0

    def test_update_acte_notes_cliniques(self, client, db, auth_headers, dentiste):
        pat = _make_patient(db, dentiste, "ACTENOTES")
        from backend import models
        act = models.Acte(
            patient_id=pat.id,
            praticien_id=dentiste.id,
            type_acte=models.ActeType.SOIN,
            libelle="Extraction",
            montant=600.0,
            date_debut=datetime.now(),
            statut_paiement=models.PaiementStatut.EN_ATTENTE,
        )
        db.add(act)
        db.commit()
        db.refresh(act)

        r = client.put(
            f"/api/actes/{act.id}",
            json={"notes_cliniques": "Extraction sans complication"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["acte"]["notes_cliniques"] == "Extraction sans complication"


# ── catalog quick-add ─────────────────────────────────────────────────────────

class TestCatalogQuickAdd:
    def test_requires_auth(self, client):
        r = client.post("/api/actes/catalog/quick-add", json={"name": "Test"})
        assert r.status_code == 401

    def test_missing_name_returns_400(self, client, auth_headers):
        r = client.post("/api/actes/catalog/quick-add", json={}, headers=auth_headers)
        assert r.status_code == 400

    def test_new_act_created_in_divers(self, client, auth_headers):
        r = client.post(
            "/api/actes/catalog/quick-add",
            json={"name": "Acte Test Quick 1", "base_price": 500.0},
            headers=auth_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "Acte Test Quick 1"
        assert body["base_price"] == 500.0
        assert "category" in body

    def test_existing_act_returned_without_price_change(self, client, auth_headers):
        client.post(
            "/api/actes/catalog/quick-add",
            json={"name": "Acte Existant Unique", "base_price": 300.0},
            headers=auth_headers,
        )
        r = client.post(
            "/api/actes/catalog/quick-add",
            json={"name": "Acte Existant Unique", "base_price": 999.0},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["base_price"] == 300.0

    def test_custom_category_used(self, client, auth_headers):
        r = client.post(
            "/api/actes/catalog/quick-add",
            json={"name": "Acte Unique XYZ999", "base_price": 100.0, "category": "Chirurgie"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["category"] == "CHIRURGIE"
