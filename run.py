import sys
import os


def _first_boot_bootstrap() -> None:
    """Génère %APPDATA%/DigitalCrown/.env au tout premier démarrage de l'EXE
    packagé, s'il n'existe pas encore — secrets aléatoires, jamais écrasé.

    Doit s'exécuter AVANT `from backend.main import app` : `backend/main.py`
    appelle `load_backend_env()` dès son import (niveau module), qui lit ce
    fichier s'il existe déjà. Sans ce bootstrap, un EXE fraîchement installé
    n'a aucun `.env` et `SECRET_KEY` retombe sur un placeholder faible — le
    lifespan de `backend/main.py` refuse alors de démarrer (garde-fou
    sécurité volontaire, cf. `validate_environment_invariants`).

    Ne s'exécute JAMAIS hors du build PyInstaller (`sys.frozen`) : lancer
    `python run.py` en dev garde le comportement actuel (`backend/.env` ou
    `.env.local`, `ENVIRONMENT=development` par défaut) — aucun changement
    pour les postes de développement.

    N'importe volontairement que `backend.env_loader` (aucune dépendance sur
    `backend.config`/`backend.database`) pour ne jamais déclencher la lecture
    des settings avant que ce fichier n'existe.
    """
    if not getattr(sys, "frozen", False):
        return

    from backend.env_loader import _appdata_env_path

    env_path = _appdata_env_path()
    if env_path is None or env_path.exists():
        return  # installation déjà configurée — ne jamais écraser un .env existant

    import secrets
    import socket

    def _detect_lan_ip() -> str | None:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                return s.getsockname()[0]
        except Exception:
            return None

    origins = "http://127.0.0.1:8005"
    lan_ip = _detect_lan_ip()
    if lan_ip:
        origins += f",http://{lan_ip}:8005"

    env_content = (
        "# Généré automatiquement au premier démarrage — ne pas modifier à la main,\n"
        "# ne jamais partager ce fichier (contient des secrets uniques à ce poste).\n"
        "ENVIRONMENT=cabinet\n"
        f"SECRET_KEY={secrets.token_hex(32)}\n"
        f"CABINET_MASTER_KEY_HEX={secrets.token_hex(32)}\n"
        f"ALLOWED_ORIGINS={origins}\n"
    )
    env_path.parent.mkdir(parents=True, exist_ok=True)
    env_path.write_text(env_content, encoding="utf-8")


def _setup_frozen_logging() -> None:
    """Redirige les logs applicatifs vers un fichier quand l'EXE est packagé
    sans console (`console=False` dans `DigitalCrown.spec`).

    Sans ça, tout `logging`/`print` part dans le vide dès que la console
    disparaît — un problème de démarrage devient impossible à diagnostiquer
    sans terminal. Configure le root logger AVANT `from backend.main import
    app` : `backend/main.py` appelle `logging.basicConfig(level=logging.INFO)`
    à son import, qui ne fait rien si le root logger a déjà un handler — donc
    tous les logs applicatifs (y compris ceux de `backend.main` et ses
    routers) atterrissent dans ce fichier, sans dupliquer la config.

    No-op hors build PyInstaller (comportement console actuel inchangé en dev).
    """
    if not getattr(sys, "frozen", False):
        return

    import logging
    from logging.handlers import RotatingFileHandler
    from backend.core.paths import AppPaths

    log_dir = AppPaths.get_user_data_dir() / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(
        log_dir / "digitalcrown.log", maxBytes=5_000_000, backupCount=5, encoding="utf-8"
    )
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logging.basicConfig(level=logging.INFO, handlers=[handler])

    def _log_uncaught_exception(exc_type, exc_value, exc_tb):
        # Sans console, une exception non interceptée disparaît silencieusement
        # (l'EXE se ferme sans aucune trace). On la journalise avant de laisser
        # le comportement par défaut s'appliquer.
        logging.getLogger("uncaught").critical(
            "Exception non interceptée — arrêt de l'application",
            exc_info=(exc_type, exc_value, exc_tb),
        )
        sys.__excepthook__(exc_type, exc_value, exc_tb)

    sys.excepthook = _log_uncaught_exception


_first_boot_bootstrap()
_setup_frozen_logging()

import uvicorn
import multiprocessing
import threading
import time
import webbrowser
import urllib.request
from backend.main import app


def _resolve_host_port():
    """Résout l'adresse d'écoute selon l'environnement.

    - CABINET_HOST / CABINET_PORT explicites : toujours prioritaires.
    - ENVIRONMENT=cabinet : 0.0.0.0 par défaut (la PWA mobile du cabinet doit
      pouvoir joindre le backend depuis le LAN — appairage QR, snapshot).
      Restreindre l'accès au sous-réseau du cabinet via le pare-feu Windows
      (cf. docs/CABINET_ONPREM_GUIDE.md §2).
    - Tout autre environnement (dev/local/test/production) : 127.0.0.1,
      défaut sûr — jamais d'exposition réseau implicite.
    """
    env = os.environ.get("ENVIRONMENT", "development").lower()
    default_host = "0.0.0.0" if env == "cabinet" else "127.0.0.1"
    host = os.environ.get("CABINET_HOST", default_host)
    port = int(os.environ.get("CABINET_PORT", "8005"))
    return host, port


def _resolve_tls_config():
    """Retourne les fichiers TLS configurés, ou refuse une configuration partielle."""
    cert_file = os.environ.get("CABINET_SSL_CERTFILE", "").strip()
    key_file = os.environ.get("CABINET_SSL_KEYFILE", "").strip()
    https_enabled = os.environ.get("CABINET_HTTPS_ENABLED", "false").lower() in {"1", "true", "yes"}
    if not https_enabled:
        return None, None
    if not cert_file or not key_file:
        raise RuntimeError("CABINET_HTTPS_ENABLED exige CABINET_SSL_CERTFILE et CABINET_SSL_KEYFILE.")
    if not os.path.isfile(cert_file) or not os.path.isfile(key_file):
        raise RuntimeError("Certificat ou clé TLS cabinet introuvable.")
    return cert_file, key_file


def _frontend_url(port: int, scheme: str = "http") -> str:
    return f"{scheme}://127.0.0.1:{port}"


def _server_is_ready(port: int, scheme: str = "http") -> bool:
    """Vérifie le serveur local sans démarrer un second backend."""
    try:
        with urllib.request.urlopen(_frontend_url(port, scheme), timeout=0.8) as response:
            return response.status < 500
    except Exception:
        return False


def open_browser_when_ready(port: int, scheme: str = "http", timeout_seconds: float = 30.0):
    """Ouvre l'interface seulement lorsque le backend sert réellement le frontend."""
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if _server_is_ready(port, scheme):
            webbrowser.open(_frontend_url(port, scheme))
            return
        time.sleep(0.25)


if __name__ == '__main__':
    multiprocessing.freeze_support()

    host, port = _resolve_host_port()
    ssl_certfile, ssl_keyfile = _resolve_tls_config()
    scheme = "https" if ssl_certfile else "http"

    if getattr(sys, 'frozen', False):
        # Un clic sur le raccourci alors que Digital Crown tourne déjà doit
        # simplement rouvrir l'interface, sans conflit de port ni terminal.
        if _server_is_ready(port, scheme):
            webbrowser.open(_frontend_url(port, scheme))
            raise SystemExit(0)
        threading.Thread(target=open_browser_when_ready, args=(port, scheme), daemon=True).start()

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        ssl_certfile=ssl_certfile,
        ssl_keyfile=ssl_keyfile,
    )
