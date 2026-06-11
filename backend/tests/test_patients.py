"""Tests d'intégration — CRUD patients."""


VALID_PATIENT = {
    "nom": "Benali",
    "prenom": "Sara",
    "date_naissance": "1990-05-15",
    "sexe": "F",
    "telephone": "0612345678",
}


class TestCreatePatient:
    def test_create_patient_success(self, client, auth_headers):
        resp = client.post("/api/patients/", json=VALID_PATIENT, headers=auth_headers)
        assert resp.status_code in (200, 201)
        body = resp.json()
        assert body["nom"] == "BENALI"        # backend normalise en majuscules
        assert body["prenom"] == "Sara"
        assert "id" in body

    def test_create_patient_unauthenticated(self, client):
        resp = client.post("/api/patients/", json=VALID_PATIENT)
        assert resp.status_code == 401

    def test_create_patient_missing_required_field(self, client, auth_headers):
        bad = {k: v for k, v in VALID_PATIENT.items() if k != "nom"}
        resp = client.post("/api/patients/", json=bad, headers=auth_headers)
        assert resp.status_code == 422


class TestListPatients:
    def test_list_returns_empty_initially(self, client, auth_headers):
        resp = client.get("/api/patients/", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_contains_created_patient(self, client, auth_headers):
        client.post("/api/patients/", json=VALID_PATIENT, headers=auth_headers)
        resp = client.get("/api/patients/", headers=auth_headers)
        noms = [p["nom"] for p in resp.json()]
        assert "BENALI" in noms

    def test_list_unauthenticated(self, client):
        resp = client.get("/api/patients/")
        assert resp.status_code == 401


class TestGetPatient:
    def _create(self, client, auth_headers):
        r = client.post("/api/patients/", json=VALID_PATIENT, headers=auth_headers)
        return r.json()["id"]

    def test_get_existing_patient(self, client, auth_headers):
        pid = self._create(client, auth_headers)
        resp = client.get(f"/api/patients/{pid}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == pid

    def test_get_nonexistent_returns_404(self, client, auth_headers):
        resp = client.get("/api/patients/999999", headers=auth_headers)
        assert resp.status_code == 404

    def test_get_unauthenticated(self, client, auth_headers):
        pid = self._create(client, auth_headers)
        client.cookies.clear()  # drop cookie set during auth_headers login
        resp = client.get(f"/api/patients/{pid}")
        assert resp.status_code == 401


class TestUpdatePatient:
    def _create(self, client, auth_headers):
        r = client.post("/api/patients/", json=VALID_PATIENT, headers=auth_headers)
        return r.json()["id"]

    def test_update_nom(self, client, auth_headers):
        pid = self._create(client, auth_headers)
        # Envoie uniquement le champ modifié (exclude_unset côté Pydantic)
        resp = client.put(
            f"/api/patients/{pid}",
            json={"nom": "Alami"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["nom"] == "ALAMI"   # backend normalise en majuscules

    def test_update_unauthenticated(self, client, auth_headers):
        pid = self._create(client, auth_headers)
        client.cookies.clear()  # drop cookie set during auth_headers login
        resp = client.put(f"/api/patients/{pid}", json={**VALID_PATIENT, "nom": "X"})
        assert resp.status_code == 401


class TestMultiTenantIsolation:
    """Un médecin ne doit pas voir les patients d'un autre."""

    def test_doctor_b_cannot_see_doctor_a_patient(self, client, db):
        from backend import models
        from backend.security import get_password_hash

        doc_a = models.User(email="a@x.ma", hashed_password=get_password_hash("Pass123!"), role="DENTISTE", is_active=True, is_licensed=True)
        doc_b = models.User(email="b@x.ma", hashed_password=get_password_hash("Pass123!"), role="DENTISTE", is_active=True, is_licensed=True)
        db.add_all([doc_a, doc_b])
        db.commit()

        # Use cookie-based auth: login sets access_token cookie, no explicit header needed.
        # get_current_user prioritises the cookie, so we clear between sessions.
        client.cookies.clear()
        client.post("/api/auth/login", data={"username": "a@x.ma", "password": "Pass123!"})
        r = client.post("/api/patients/", json=VALID_PATIENT)
        pid = r.json()["id"]

        client.cookies.clear()
        client.post("/api/auth/login", data={"username": "b@x.ma", "password": "Pass123!"})
        resp = client.get(f"/api/patients/{pid}")
        assert resp.status_code in (403, 404)
