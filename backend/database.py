import os
import sys
import sqlite3
import logging
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from passlib.context import CryptContext
from backend.core.paths import AppPaths

# Charger les variables d'environnement depuis le fichier .env dans le dossier backend
base_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(base_dir, ".env"))

# --- PASSWORD HASHING ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- CONFIGURATION DE LA CONNEXION ---
# En mode dev/prod locale, on utilise SQLite via AppPaths.
# En mode Cloud (si DATABASE_URL est présent), on garde PostgreSQL.
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", AppPaths.get_db_url())

logger = logging.getLogger(__name__)

# --- CONFIGURATION & ENCRYPTION SQLCIPHER POUR SQLITE ---
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    # Récupérer la clé principale Cabinet (ZKA) ou dériver depuis SECRET_KEY
    passphrase = os.getenv("CABINET_MASTER_KEY_HEX", os.getenv("SECRET_KEY", "default-dc-fallback-key"))
    
    # Si base sur disque (pas de :memory:), vérifier et migrer la base existante si elle est en clair
    if ":memory:" not in SQLALCHEMY_DATABASE_URL:
        db_file_path = SQLALCHEMY_DATABASE_URL.replace("sqlite:///", "")
        db_file_path = os.path.abspath(db_file_path)
        
        if os.path.exists(db_file_path):
            is_plaintext = False
            conn_test = None
            try:
                # Test d'ouverture en standard (sans clé)
                conn_test = sqlite3.connect(db_file_path)
                conn_test.execute("SELECT name FROM sqlite_master WHERE type='table'")
                is_plaintext = True
            except sqlite3.DatabaseError:
                # La base est chiffrée ou corrompue
                is_plaintext = False
            except Exception:
                is_plaintext = False
            finally:
                if conn_test:
                    try:
                        conn_test.close()
                    except Exception as e:
                        logger.debug(f"Could not close test connection: {e}")
            
            # Si elle est lisible en clair, on effectue la migration vers SQLCipher
            if is_plaintext:
                logger.warning(f"⚠️ Détection d'une base locale non chiffrée : {db_file_path}")
                logger.warning("🚀 Lancement de la migration transparente à chaud vers SQLCipher AES-256...")
                
                temp_unencrypted = db_file_path + ".unencrypted.tmp"
                try:
                    if os.path.exists(temp_unencrypted):
                        os.remove(temp_unencrypted)
                    os.rename(db_file_path, temp_unencrypted)
                    
                    # Créer la base chiffrée avec SQLCipher
                    from sqlcipher3 import dbapi2 as sqlcipher
                    enc_conn = sqlcipher.connect(db_file_path)
                    # Escape single quotes to prevent SQL injection in PRAGMA statements
                    safe_passphrase = passphrase.replace("'", "''")
                    safe_temp_path = temp_unencrypted.replace("'", "''")
                    enc_conn.execute(f"PRAGMA key = '{safe_passphrase}'")

                    # Attacher et copier
                    enc_conn.execute(f"ATTACH DATABASE '{safe_temp_path}' AS plaintext KEY ''")
                    enc_conn.execute("SELECT sqlcipher_export('main', 'plaintext')")
                    enc_conn.execute("DETACH DATABASE plaintext")
                    enc_conn.close()
                    
                    # Supprimer le fichier en clair temporaire
                    os.remove(temp_unencrypted)
                    logger.info("✅ Migration transparente vers SQLCipher terminée avec succès.")
                except Exception as e:
                    logger.error(f"❌ Échec de la migration transparente vers SQLCipher : {e}")
                    # En cas d'erreur fatale, restaurer le fichier d'origine
                    if os.path.exists(temp_unencrypted) and not os.path.exists(db_file_path):
                        os.rename(temp_unencrypted, db_file_path)

    # Injecter sqlcipher3 dans sys.modules pour que SQLAlchemy l'utilise comme pysqlcipher3
    try:
        import sqlcipher3
        sys.modules['pysqlcipher3'] = sqlcipher3
        
        # Mettre à jour la chaîne de connexion SQLAlchemy pour utiliser sqlite+pysqlcipher
        if ":memory:" in SQLALCHEMY_DATABASE_URL:
            SQLALCHEMY_DATABASE_URL = f"sqlite+pysqlcipher://:{passphrase}@/:memory:"
        else:
            db_file_path = SQLALCHEMY_DATABASE_URL.replace("sqlite:///", "")
            db_file_path = os.path.abspath(db_file_path).replace("\\", "/")
            SQLALCHEMY_DATABASE_URL = f"sqlite+pysqlcipher://:{passphrase}@/{db_file_path}"
        logger.info("🔒 Connexion SQLite sécurisée par chiffrement SQLCipher (AES-256).")
    except ImportError:
        logger.error("❌ Module 'sqlcipher3' non trouvé. La base SQLite ne sera pas chiffrée.")

# --- INITIALISATION DU MOTEUR ---
# Si SQLite, on utilise le dialecte pysqlcipher sécurisé
if "pysqlcipher" in SQLALCHEMY_DATABASE_URL or SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, 
        connect_args={"check_same_thread": False} # Requis pour FastAPI
    )
    
    from sqlalchemy import event
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
else:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_size=10,
        max_overflow=5,
        pool_timeout=30,
        pool_recycle=1800,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(
    autocommit=False, 
    autoflush=False, 
    bind=engine
)



def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- AUTO-MIGRATION (Self-Healing) ---
