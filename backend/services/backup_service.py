import os
import shutil
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from cryptography.fernet import Fernet
from backend.core.paths import AppPaths

logger = logging.getLogger(__name__)

class BackupService:
    @staticmethod
    def _get_or_create_key() -> Fernet:
        data_dir = AppPaths.get_user_data_dir()
        key_path = data_dir / "backup.key"
        
        if not key_path.exists():
            key = Fernet.generate_key()
            key_path.write_bytes(key)
            logger.info("Nouvelle clé de chiffrement générée pour les backups.")
        else:
            key = key_path.read_bytes()
            
        return Fernet(key)

    @staticmethod
    def _encrypt_and_save(source_db: Path, target_enc: Path, cipher_suite: Fernet):
        temp_db = target_enc.with_suffix('.temp.db')
        try:
            # sqlite3 native backup API is WAL-safe; fallback to shutil for non-DB files
            if source_db.suffix == '.db':
                import sqlite3 as _sqlite3
                src_conn = None
                dst_conn = None
                try:
                    src_conn = _sqlite3.connect(str(source_db))
                    dst_conn = _sqlite3.connect(str(temp_db))
                    src_conn.backup(dst_conn)
                finally:
                    if dst_conn:
                        dst_conn.close()
                    if src_conn:
                        src_conn.close()
            else:
                shutil.copy2(source_db, temp_db)

            data = temp_db.read_bytes()
            encrypted_data = cipher_suite.encrypt(data)
            target_enc.write_bytes(encrypted_data)
        finally:
            if temp_db.exists():
                temp_db.unlink()

    @staticmethod
    def run_daily_backup():
        try:
            data_dir = AppPaths.get_user_data_dir()
            db_path_clinical = data_dir / "clinical_vault.db"
            
            backups_dir = data_dir / "backups"
            backups_dir.mkdir(parents=True, exist_ok=True)
            
            cipher_suite = BackupService._get_or_create_key()
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            # Chiffrement base clinique (Main DB)
            if db_path_clinical.exists():
                backup_clinical = backups_dir / f"clinical_vault_backup_{timestamp}.enc"
                BackupService._encrypt_and_save(db_path_clinical, backup_clinical, cipher_suite)
            else:
                logger.warning(f"Database file not found at {db_path_clinical}.")
                

            logger.info(f"Sauvegarde chiffrée réussie pour le {timestamp}")
            
            # Nettoyage des anciennes sauvegardes
            BackupService._cleanup_old_backups(backups_dir, prefix="clinical_vault_backup_", keep=7)
            
            return True
        except Exception as e:
            logger.error(f"Erreur lors de la sauvegarde chiffrée : {e}")
            return False

    @staticmethod
    def restore_backup(enc_file: Path, restore_db: Path):
        cipher_suite = BackupService._get_or_create_key()
        if not enc_file.exists():
            raise FileNotFoundError(f"Fichier chiffré introuvable : {enc_file}")
            
        encrypted_data = enc_file.read_bytes()
        decrypted_data = cipher_suite.decrypt(encrypted_data)
        restore_db.write_bytes(decrypted_data)
        logger.info(f"Restauration réussie vers {restore_db}")

    @staticmethod
    def _cleanup_old_backups(backups_dir: Path, prefix: str, keep: int = 7):
        try:
            backups = sorted(
                backups_dir.glob(f"{prefix}*.enc"),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            
            if len(backups) > keep:
                for old_backup in backups[keep:]:
                    old_backup.unlink()
                    logger.info(f"Ancienne sauvegarde chiffrée supprimée : {old_backup.name}")
        except Exception as e:
            logger.warning(f"Erreur lors du nettoyage : {e}")

backup_service = BackupService()
