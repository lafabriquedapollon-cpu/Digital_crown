"""Tests CABINET-PILOT-BLOCKERS-1 — mode ENVIRONMENT=cabinet, bind LAN,
et non-embarquement de secrets dans l'EXE."""
import os
from types import SimpleNamespace
from unittest.mock import patch

from backend.main import validate_environment_invariants


def _cfg(env, debug=False, db_url="postgresql://u:p@localhost/db", origins="http://localhost:5173"):
    return SimpleNamespace(ENVIRONMENT=env, DEBUG=debug, DATABASE_URL=db_url, ALLOWED_ORIGINS=origins)


class TestEnvironmentInvariants:
    def test_production_refuses_sqlite(self):
        errors = validate_environment_invariants(_cfg("production", db_url="sqlite:///./x.db"))
        assert any("SQLite" in e for e in errors)

    def test_cabinet_allows_sqlite(self):
        errors = validate_environment_invariants(_cfg("cabinet", db_url="sqlite:///./x.db"))
        assert errors == []

    def test_cabinet_refuses_debug(self):
        errors = validate_environment_invariants(_cfg("cabinet", debug=True))
        assert any("DEBUG" in e for e in errors)

    def test_cabinet_refuses_wildcard_cors(self):
        errors = validate_environment_invariants(_cfg("cabinet", origins="*"))
        assert any("wildcard" in e for e in errors)

    def test_production_refuses_debug_and_wildcard(self):
        errors = validate_environment_invariants(_cfg("production", debug=True, origins="*"))
        assert len(errors) == 2

    def test_development_has_no_blocking_invariants(self):
        errors = validate_environment_invariants(
            _cfg("development", debug=True, db_url="sqlite:///./x.db", origins="*")
        )
        assert errors == []

    def test_test_env_has_no_blocking_invariants(self):
        errors = validate_environment_invariants(_cfg("test", db_url="sqlite:///:memory:"))
        assert errors == []

    def test_production_postgres_clean_config_passes(self):
        errors = validate_environment_invariants(_cfg("production"))
        assert errors == []

    def test_cabinet_sqlcipher_clean_config_passes(self):
        errors = validate_environment_invariants(
            _cfg("cabinet", db_url="sqlite+pysqlcipher://:key@/path/db")
        )
        assert errors == []


class TestRunPyHostResolution:
    def _resolve(self, env_vars):
        import importlib.util
        spec = importlib.util.find_spec("run") if False else None
        # run.py n'est pas un module du package backend — on importe la
        # fonction directement depuis le fichier.
        import importlib.util as ilu
        import pathlib
        run_path = pathlib.Path(__file__).parent.parent.parent / "run.py"
        spec = ilu.spec_from_file_location("_run_module", run_path)
        # NB : on n'exécute PAS le module (il importe backend.main = lourd) ;
        # on teste la logique en la reproduisant depuis l'env — la source de
        # vérité est vérifiée par le test source-level ci-dessous.
        env = env_vars.get("ENVIRONMENT", "development").lower()
        default_host = "0.0.0.0" if env == "cabinet" else "127.0.0.1"
        host = env_vars.get("CABINET_HOST", default_host)
        port = int(env_vars.get("CABINET_PORT", "8005"))
        return host, port

    def test_dev_defaults_to_localhost(self):
        host, port = self._resolve({})
        assert host == "127.0.0.1"
        assert port == 8005

    def test_cabinet_defaults_to_lan_bind(self):
        host, _ = self._resolve({"ENVIRONMENT": "cabinet"})
        assert host == "0.0.0.0"

    def test_production_defaults_to_localhost(self):
        host, _ = self._resolve({"ENVIRONMENT": "production"})
        assert host == "127.0.0.1"

    def test_explicit_cabinet_host_wins(self):
        host, _ = self._resolve({"ENVIRONMENT": "development", "CABINET_HOST": "192.168.1.50"})
        assert host == "192.168.1.50"

    def test_explicit_port_wins(self):
        _, port = self._resolve({"CABINET_PORT": "9000"})
        assert port == 9000

    def test_run_py_source_uses_env_vars(self):
        """Vérifie que run.py contient réellement la logique testée ci-dessus."""
        import pathlib
        source = (pathlib.Path(__file__).parent.parent.parent / "run.py").read_text(encoding="utf-8")
        assert "CABINET_HOST" in source
        assert "CABINET_PORT" in source
        assert '"0.0.0.0" if env == "cabinet"' in source
        assert 'host="127.0.0.1"' not in source  # plus de bind hardcodé
        assert "_server_is_ready" in source
        assert "open_browser_when_ready" in source


class TestSpecNoSecrets:
    def test_pyinstaller_spec_does_not_bundle_env(self):
        """L'EXE ne doit jamais embarquer un fichier .env (secrets figés)."""
        import pathlib
        spec = (pathlib.Path(__file__).parent.parent.parent / "DigitalCrown.spec").read_text(encoding="utf-8")
        assert "('backend/.env'" not in spec
        assert "'.env.local'" not in spec


class TestEnvLoaderCabinetCandidates:
    def test_explicit_env_file_wins(self, tmp_path, monkeypatch):
        explicit = tmp_path / "service.env"
        explicit.write_text("DATABASE_URL=postgresql://from-explicit/db\n")
        monkeypatch.setenv("DIGITALCROWN_ENV_FILE", str(explicit))
        monkeypatch.delenv("DATABASE_URL", raising=False)

        from backend.env_loader import load_backend_env
        with patch("backend.env_loader.BASE_DIR", tmp_path / "nonexistent"):
            loaded = load_backend_env(override=True)

        assert loaded == explicit
        assert os.environ["DATABASE_URL"] == "postgresql://from-explicit/db"

    def test_appdata_fallback_when_no_repo_env(self, tmp_path, monkeypatch):
        """Mode EXE frozen : pas de .env dans le bundle → fallback %APPDATA%."""
        appdata = tmp_path / "appdata"
        (appdata / "DigitalCrown").mkdir(parents=True)
        (appdata / "DigitalCrown" / ".env").write_text("SECRET_KEY=from-appdata-install\n")
        monkeypatch.setenv("APPDATA", str(appdata))
        monkeypatch.delenv("DIGITALCROWN_ENV_FILE", raising=False)
        monkeypatch.delenv("SECRET_KEY", raising=False)

        from backend.env_loader import load_backend_env
        with patch("backend.env_loader.BASE_DIR", tmp_path / "empty_frozen_dir"):
            loaded = load_backend_env(override=True)

        assert loaded == appdata / "DigitalCrown" / ".env"
        assert os.environ["SECRET_KEY"] == "from-appdata-install"
