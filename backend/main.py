import os
import sys
import time
import asyncio
import logging
import contextlib
from datetime import datetime
from dotenv import load_dotenv
# Charger .env explicitement avant toute lecture de os.getenv()
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=True)
from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError

from backend import models, database
from backend.services.sync_manager import sync_manager
from backend.seed_templates import run_full_seed
from backend.seed_user import seed_admin_user
from backend.seed_clinical import seed_clinical_data
from backend.services.panoramic_service import panoramic_engine
from backend.core.paths import AppPaths
from backend.services.license_service import LicenseService
import webbrowser
import sentry_sdk

sentry_dsn = os.getenv("SENTRY_DSN")
if sentry_dsn:
    sentry_sdk.init(
        dsn=sentry_dsn,
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )

# --- CONFIGURATION LOGGING ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- CONFIGURATION CHEMINS ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
os.makedirs(STATIC_DIR, exist_ok=True)

# --- CACHE LICENCES PER-USER ---
# Structure : {email: (is_ok: bool, reason: str, cached_at: float)}
# TTL = 60s — après expiration, SQLite est re-consulté
_license_cache: dict[str, tuple[bool, str, float]] = {}
_CACHE_TTL = 60  # secondes
_SUPERADMIN_EMAIL = os.getenv("SUPERADMIN_EMAIL", "").lower().strip()
if not _SUPERADMIN_EMAIL:
    logger.warning(
        "SUPERADMIN_EMAIL non défini. Les vérifications superadmin seront désactivées. "
        "Définissez SUPERADMIN_EMAIL dans votre fichier .env."
    )


def invalidate_license_cache(email: str) -> None:
    """Supprime l'entrée du cache pour forcer une re-vérification immédiate."""
    _license_cache.pop(email, None)


from fastapi.concurrency import run_in_threadpool

def _get_user_status_sync(email: str):
    with database.SessionLocal() as db:
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            return (False, "USER_NOT_FOUND")
        elif user.is_suspended:
            return (False, "SUSPENDED")
        elif user.is_archived:
            return (False, "ARCHIVED")
        elif not user.is_licensed:
            return (False, "NOT_LICENSED")
        elif user.license_expires_at and datetime.utcnow() > user.license_expires_at:
            return (False, "LICENSE_EXPIRED")
        else:
            return (True, "OK")

async def get_user_license_status(email: str) -> tuple[bool, str]:
    """Vérifie la licence d'un utilisateur depuis SQLite avec cache TTL 60s.
    Retourne (is_ok, reason) où reason ∈ {OK, NOT_LICENSED, LICENSE_EXPIRED, SUSPENDED, ARCHIVED, USER_NOT_FOUND}.
    """
    now = time.time()
    cached = _license_cache.get(email)
    if cached and (now - cached[2]) < _CACHE_TTL:
        return cached[0], cached[1]

    try:
        result = await run_in_threadpool(_get_user_status_sync, email)
    except Exception as e:
        logger.error(f"Erreur vérification licence pour {email}: {e}")
        # Fail-open : si la DB est inaccessible, ne pas bloquer l'utilisateur
        result = (True, "DB_ERROR_FAIL_OPEN")

    _license_cache[email] = (*result, now)
    return result

# --- LIFESPAN ---
@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Demarrage de Digital Crown API...")

    # Sécurité : refuser le démarrage si la clé secrète par défaut est utilisée
    from backend.config import settings as _cfg
    _weak_keys = {"SET_A_REAL_SECRET_KEY_IN_ENV", "dev_only_secret_key_change_me", "changeme", "secret"}
    if _cfg.SECRET_KEY in _weak_keys or len(_cfg.SECRET_KEY) < 32:
        raise RuntimeError(
            "SECURITE : SECRET_KEY non configurée. "
            "Ajoutez SECRET_KEY=<clé_aléatoire_longue> dans votre fichier .env avant de démarrer."
        )

    try:
        # 1. Initialisation DB dans %APPDATA% via AppPaths
        models.Base.metadata.create_all(bind=database.engine)

        # Activation de la synchronisation Zero-Knowledge (Observer Mode)
        sync_manager.start_listening()

        with database.SessionLocal() as db:
            run_full_seed(db)
            seed_clinical_data(db)

        # S'assure que l'admin par defaut existe
        seed_admin_user()

        # 2. Vérification des licences Firebase (par cabinet via public_id)
        #    Chaque CabinetConfig.public_id est l'identifiant unique du document Firestore
        await _sync_all_licenses_from_firebase()

        # 3. Initialisation asynchrone du moteur panoramique (OPG)
        await panoramic_engine.initialize()

        # Ghost Hub — FTS5 bulk index au démarrage (background)
        import threading
        def _bulk_index():
            try:
                from backend.services.fts_indexer import bulk_index_unindexed_patients
                with database.SessionLocal() as idx_db:
                    bulk_index_unindexed_patients(idx_db)
            except Exception as _e:
                logger.warning("FTS bulk index startup failed: %s", _e)
        threading.Thread(target=_bulk_index, daemon=True).start()

        # E1 — Scheduler quotidien alertes proactives
        from backend.services.daily_scheduler import start_daily_scheduler
        start_daily_scheduler()

        # 4. Tâche background : re-synchronisation Firebase toutes les 6h
        firebase_sync_task = asyncio.create_task(_periodic_firebase_sync())

        # 5. Ouverture automatique du navigateur (Build mode uniquement)
        if hasattr(sys, '_MEIPASS'):
            webbrowser.open("http://127.0.0.1:8000")

    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.error(f"Erreur Initialisation : {e}")
        raise

    yield

    firebase_sync_task.cancel()
    logger.info("Arret de l'API...")


async def _sync_all_licenses_from_firebase() -> None:
    """Vérifie Firebase pour chaque CabinetConfig et met à jour users.is_licensed.
    CLINIC_ID = cabinet_config.public_id (UUID hex 16 chars, unique par cabinet).
    """
    license_service = LicenseService()
    try:
        with database.SessionLocal() as db:
            configs = db.query(models.CabinetConfig).all()
            if not configs:
                logger.warning("Aucun cabinet trouvé en DB. Vérification Firebase ignorée.")
                return

            for config in configs:
                public_id = config.public_id
                clinic_id = config.clinic_id if config.clinic_id else public_id
                owner = db.query(models.User).filter(models.User.id == config.owner_id).first()
                if not owner:
                    continue

                # SuperAdmin : toujours licencié, jamais bloqué
                if owner.email == _SUPERADMIN_EMAIL:
                    if not owner.is_licensed:
                        owner.is_licensed = True
                        owner.license_expires_at = None
                        db.commit()
                    continue

                # Vérification Firebase avec le clinic_id
                firebase_result = await license_service.validate_license_with_expiry(clinic_id)
                license_ok = firebase_result["active"]
                expiry = firebase_result.get("expiration_date")

                # Mise à jour SQLite depuis Firebase
                owner.is_licensed = license_ok
                if expiry:
                    owner.license_expires_at = expiry
                db.commit()

                # Invalider le cache pour forcer re-vérification
                invalidate_license_cache(owner.email)

                status = "✅ ACTIVE" if license_ok else "❌ EXPIRÉE/INVALIDE"
                logger.info(f"Licence cabinet '{clinic_id}' (public_id: {public_id}, user: {owner.email}) : {status}")

    except Exception as e:
        logger.error(f"Erreur sync licences Firebase : {e}")


async def _periodic_firebase_sync() -> None:
    """Tâche background : re-vérifie Firebase toutes les 6 heures."""
    while True:
        try:
            await asyncio.sleep(6 * 3600)
            logger.info("🔄 Re-synchronisation périodique des licences depuis Firebase...")
            await _sync_all_licenses_from_firebase()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Erreur sync périodique licences : {e}")

app = FastAPI(
    title="Digital Crown API - SANINOVA Edition",
    version="1.2.0",
    lifespan=lifespan
)

# --- EXCEPTION HANDLERS ---
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation Error: {str(exc.errors())}")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

# --- MIDDLEWARES ---
# CORS is added further down after HTTP middlewares

@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start) * 1000)
    # Ne pas logger les assets statiques pour éviter le bruit
    if not request.url.path.startswith(("/static", "/api/static")):
        user_agent = request.headers.get("user-agent", "")[:40]
        logger.info(
            f"{request.method} {request.url.path} → {response.status_code} ({duration_ms}ms)"
        )
    return response

@app.middleware("http")
async def license_check_middleware(request: Request, call_next):
    # Routes toujours autorisées (Statique, Auth, Setup Wizard)
    allowed_prefixes = (
        "/static", "/api/static", "/assets",
        "/api/auth", "/api/clinics/recheck-license", "/api/clinics/license-status",
        "/api/clinics/init-status",  # Route publique : vérif setup wizard
        "/health"
    )
    if request.url.path.startswith(allowed_prefixes) or request.method == "OPTIONS":
        return await call_next(request)

    # Extraire et décoder le JWT (cookie-first, fallback Authorization header)
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        # Pas de token → laisser FastAPI gérer l'auth (il renverra 401)
        return await call_next(request)
    try:
        from jose import jwt
        from backend.security import SECRET_KEY, ALGORITHM
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub", "")
    except Exception as e:
        err_str = str(e).lower()
        if "expired" in err_str or "signature" in err_str:
            logger.warning(f"JWT Expiré (Normal): {e}")
            return JSONResponse(
                status_code=401,
                content={"detail": "TOKEN_EXPIRED", "message": "Session expirée. Veuillez vous reconnecter."}
            )
        # Token invalide/corrompu → laisser FastAPI gérer
        logger.error(f"JWT Decode error in middleware: {e}")
        return await call_next(request)

    # SuperAdmin : bypass total, jamais bloqué
    if email.lower() == _SUPERADMIN_EMAIL:
        return await call_next(request)

    # Vérification licence per-user (SQLite + cache TTL 60s)
    is_ok, reason = await get_user_license_status(email)
    if not is_ok:
        if request.method in ["POST", "PUT", "PATCH", "DELETE"]:
            messages = {
                "NOT_LICENSED": "Mode lecture seule : Votre cabinet n'a pas de licence active.",
                "LICENSE_EXPIRED": "Mode lecture seule : Votre licence a expiré.",
                "SUSPENDED": "Votre accès a été suspendu.",
                "ARCHIVED": "Ce compte est archivé.",
                "USER_NOT_FOUND": "Compte introuvable. Veuillez vous reconnecter.",
            }
            # Utilise 403 au lieu de 402 pour éviter le Hard-Lock global de l'UI
            return JSONResponse(
                status_code=403,
                content={
                    "detail": reason,
                    "message": messages.get(reason, "Accès refusé. Vérifiez votre licence.")
                }
            )

    return await call_next(request)

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# --- INCLUSION DES ROUTERS ---
from backend.config import settings as _settings
ALLOWED_ORIGINS = [o.strip() for o in _settings.ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    expose_headers=["X-Total-Count"],
)
from backend.routers import (
    auth, clinics, patients, ia, documents, stats, admin,
    appointments, templates, prescriptions, accounting, team,
    intelligence, clinical_data, mobile, installments, lab_jobs,
    bot, catalog, verification, analytics, agenda_settings
)
from backend.routers import ai_feedback as ai_feedback_router

app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(clinics.router, prefix="/api/clinics", tags=["Clinics"])
app.include_router(patients.router, prefix="/api/patients", tags=["Patients"])
app.include_router(ia.router, prefix="/api/ia", tags=["IA & Analysis"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(verification.router, prefix="/api/documents", tags=["Vérification publique"])
app.include_router(stats.router, prefix="/api/stats", tags=["Statistiques"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics & Finance"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(appointments.router, prefix="/api/appointments", tags=["Agenda"])
app.include_router(agenda_settings.router, prefix="/api", tags=["Agenda Settings"])
app.include_router(templates.router, prefix="/api/templates", tags=["Templates"])
app.include_router(prescriptions.prescription_router, prefix="/api/prescriptions", tags=["Prescriptions"])
app.include_router(prescriptions.actes_router, prefix="/api/actes", tags=["Actes Cliniques"])
app.include_router(accounting.router, prefix="/api/accounting", tags=["Accounting & Payments"])
app.include_router(team.router, prefix="/api/team", tags=["Team Management"])
app.include_router(intelligence.router, prefix="/api/intelligence", tags=["Elite Intelligence"])
app.include_router(clinical_data.router, prefix="/api/clinical-data", tags=["Données Cliniques"])
app.include_router(mobile.router, prefix="/api/mobile", tags=["Mobile ZKA"])
app.include_router(ai_feedback_router.router, prefix="/api/ai", tags=["Ghost Hub Feedback"])
app.include_router(installments.router, prefix="/api/installments", tags=["Installments"])
app.include_router(lab_jobs.router, prefix="/api/lab-jobs", tags=["Lab Jobs"])
app.include_router(bot.router, prefix="/api/bot", tags=["Crown Bot"])
app.include_router(catalog.router, prefix="/api/catalog", tags=["Catalog"])

from backend.routers import superadmin
app.include_router(superadmin.router, prefix="/api/superadmin", tags=["Super Admin"])

# --- HEALTH CHECK ---
@app.get("/health", include_in_schema=False)
async def health_check():
    try:
        with database.SessionLocal() as db:
            from sqlalchemy import text
            db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "degraded", "db": str(e)})

# --- STATIC FILES & UI ---

@app.get('/favicon.ico', include_in_schema=False)
async def favicon():
    return Response(status_code=204)

# 1. Dossier Static des Médias (Photos patients, etc.)
# En prod, on utilise un dossier dans %APPDATA%
MEDIA_DIR = AppPaths.get_user_data_dir() / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

# Mount pour les uploads locaux (dev & reports)
UPLOAD_DIR = os.path.join(BASE_DIR, "static", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# /api/static/uploads est prioritaire pour le dossier local dev
app.mount("/api/static/uploads", StaticFiles(directory=UPLOAD_DIR), name="api_uploads")
# /api/static sert le reste depuis MEDIA_DIR (logo, etc.)
app.mount("/api/static", StaticFiles(directory=str(MEDIA_DIR)), name="static")
# Mount legacy pour compatibilité
app.mount("/static/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# 2. Servage du Frontend React (SPA)
FRONTEND_DIST = AppPaths.get_static_dir()

if FRONTEND_DIST.exists():
    from fastapi.responses import FileResponse

    # Assets statiques (JS, CSS, images, sw.js, manifest.json…)
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="frontend_assets")

    # Fichiers à la racine du dist (sw.js, manifest.json, logo_gold.png…)
    _dist_root_files = {p.name for p in FRONTEND_DIST.iterdir() if p.is_file()}

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str, request: Request):
        if full_path.startswith("api/"):
            if not full_path.endswith("/"):
                from fastapi.responses import RedirectResponse
                return RedirectResponse(url=f"/{full_path}/", status_code=307)
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="API Route Not Found")
            
        # Fichier statique connu à la racine du dist → le servir directement
        if full_path in _dist_root_files:
            return FileResponse(str(FRONTEND_DIST / full_path))
        # Toute autre route SPA → index.html (React Router gère)
        return FileResponse(str(FRONTEND_DIST / "index.html"))

    logger.info(f"Frontend servit depuis : {FRONTEND_DIST}")
else:
    @app.get("/")
    def root():
        return {"status": "online", "message": "API Active (Frontend non trouve)"}
