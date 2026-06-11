"""Tests d'intégration — endpoints /api/auth/"""


class TestLogin:
    def test_login_success_returns_tokens(self, client, dentiste):
        resp = client.post(
            "/api/auth/login",
            data={"username": dentiste.email, "password": "TestPass123!"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert "refresh_token" in body
        assert body["token_type"] == "bearer"

    def test_login_wrong_password(self, client, dentiste):
        resp = client.post(
            "/api/auth/login",
            data={"username": dentiste.email, "password": "mauvais"},
        )
        assert resp.status_code == 401

    def test_login_unknown_email(self, client):
        resp = client.post(
            "/api/auth/login",
            data={"username": "fantome@inexistant.ma", "password": "abc"},
        )
        assert resp.status_code == 401

    def test_login_inactive_user(self, client, db):
        from backend.tests.conftest import make_user
        inactive = make_user(db, password="Pass123!", active=False)
        resp = client.post(
            "/api/auth/login",
            data={"username": inactive.email, "password": "Pass123!"},
        )
        assert resp.status_code == 403


class TestMe:
    def test_me_returns_user(self, client, auth_headers, dentiste):
        resp = client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["email"] == dentiste.email

    def test_me_without_token(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_me_with_bad_token(self, client):
        resp = client.get("/api/auth/me", headers={"Authorization": "Bearer fake.token.here"})
        assert resp.status_code == 401


class TestRefresh:
    def test_refresh_returns_new_tokens(self, client, dentiste, refresh_token):
        resp = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert "refresh_token" in body
        # Les nouveaux tokens doivent être différents (rotation)
        assert body["refresh_token"] != refresh_token

    def test_refresh_old_token_is_revoked(self, client, dentiste, refresh_token):
        """Après une rotation, l'ancien refresh token ne doit plus fonctionner."""
        client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
        resp2 = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
        assert resp2.status_code == 401

    def test_refresh_with_access_token_fails(self, client, dentiste, auth_headers):
        """Un access token ne doit pas être accepté comme refresh token."""
        access = auth_headers["Authorization"].split(" ")[1]
        resp = client.post("/api/auth/refresh", json={"refresh_token": access})
        assert resp.status_code == 401

    def test_refresh_with_garbage_fails(self, client):
        resp = client.post("/api/auth/refresh", json={"refresh_token": "garbage"})
        assert resp.status_code == 401


class TestLogout:
    def test_logout_revokes_access_token(self, client, dentiste):
        login = client.post(
            "/api/auth/login",
            data={"username": dentiste.email, "password": "TestPass123!"},
        )
        tokens = login.json()
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}

        # Logout
        resp = client.post(
            "/api/auth/logout",
            json={"refresh_token": tokens["refresh_token"]},
            headers=headers,
        )
        assert resp.status_code == 204

        # L'access token ne doit plus fonctionner
        me = client.get("/api/auth/me", headers=headers)
        assert me.status_code == 401

    def test_logout_requires_auth(self, client, dentiste, refresh_token):
        # refresh_token fixture logs in via TestClient, setting access_token cookie;
        # clear it to simulate a truly unauthenticated request.
        client.cookies.clear()
        resp = client.post("/api/auth/logout", json={"refresh_token": refresh_token})
        assert resp.status_code == 401
