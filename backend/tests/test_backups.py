"""Tests for BackupService — aligned with the current API."""
import pytest
from pathlib import Path
from unittest.mock import patch
from cryptography.fernet import Fernet

from backend.services.backup_service import BackupService


def test_get_or_create_key_creates_file(tmp_path):
    """First call generates and persists a key file; returns a Fernet instance."""
    with patch("backend.services.backup_service.AppPaths.get_user_data_dir", return_value=tmp_path):
        cipher = BackupService._get_or_create_key()
        key_path = tmp_path / "backup.key"
        assert key_path.exists()
        assert isinstance(cipher, Fernet)


def test_get_or_create_key_reuses_existing_key(tmp_path):
    """Subsequent calls load the same key (no new file generated)."""
    with patch("backend.services.backup_service.AppPaths.get_user_data_dir", return_value=tmp_path):
        cipher1 = BackupService._get_or_create_key()
        key1 = (tmp_path / "backup.key").read_bytes()

        cipher2 = BackupService._get_or_create_key()
        key2 = (tmp_path / "backup.key").read_bytes()

        assert key1 == key2


def _make_sqlite_db(path: Path) -> None:
    """Create a minimal valid SQLite database at *path*."""
    import sqlite3
    conn = sqlite3.connect(str(path))
    conn.execute("CREATE TABLE records (id INTEGER PRIMARY KEY, name TEXT)")
    conn.execute("INSERT INTO records VALUES (1, 'test')")
    conn.commit()
    conn.close()


def test_encrypt_and_save_produces_different_bytes(tmp_path):
    """Encrypted file must differ from the plaintext source."""
    source = tmp_path / "clinical_vault.db"
    _make_sqlite_db(source)
    target = tmp_path / "backup.enc"

    cipher = Fernet(Fernet.generate_key())
    BackupService._encrypt_and_save(source, target, cipher)

    assert target.exists()
    assert target.read_bytes() != source.read_bytes()


def test_restore_backup_roundtrip(tmp_path):
    """Encrypt then restore must preserve database content."""
    import sqlite3

    source = tmp_path / "clinical_vault.db"
    _make_sqlite_db(source)

    enc_file = tmp_path / "backup.enc"
    restored = tmp_path / "restored.db"

    cipher = Fernet(Fernet.generate_key())
    BackupService._encrypt_and_save(source, enc_file, cipher)

    # Stub _get_or_create_key so restore uses the same cipher
    with patch.object(BackupService, "_get_or_create_key", return_value=cipher):
        BackupService.restore_backup(enc_file, restored)

    # sqlite3.backup() may change internal header counters, so verify content not raw bytes
    conn = sqlite3.connect(str(restored))
    rows = conn.execute("SELECT id, name FROM records").fetchall()
    conn.close()
    assert rows == [(1, "test")]


def test_restore_backup_missing_file_raises(tmp_path):
    """restore_backup must raise FileNotFoundError for a non-existent enc file."""
    with pytest.raises(FileNotFoundError):
        BackupService.restore_backup(tmp_path / "ghost.enc", tmp_path / "out.db")


def test_cleanup_old_backups_keeps_n_most_recent(tmp_path):
    """_cleanup_old_backups must delete files beyond the keep limit."""
    backups_dir = tmp_path / "backups"
    backups_dir.mkdir()
    prefix = "clinical_vault_backup_"

    # Create 10 fake backup files with distinct mtimes
    files = []
    for i in range(10):
        f = backups_dir / f"{prefix}2026010{i:01d}_120000.enc"
        f.write_bytes(b"x")
        files.append(f)

    BackupService._cleanup_old_backups(backups_dir, prefix=prefix, keep=7)

    remaining = list(backups_dir.glob(f"{prefix}*.enc"))
    assert len(remaining) == 7


def test_run_daily_backup_returns_true_when_db_exists(tmp_path):
    """run_daily_backup returns True and creates an encrypted .enc file."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    db_file = data_dir / "clinical_vault.db"
    _make_sqlite_db(db_file)

    with patch("backend.services.backup_service.AppPaths.get_user_data_dir", return_value=data_dir):
        result = BackupService.run_daily_backup()

    assert result is True
    enc_files = list((data_dir / "backups").glob("clinical_vault_backup_*.enc"))
    assert len(enc_files) == 1


def test_run_daily_backup_returns_true_when_db_missing(tmp_path):
    """run_daily_backup should still return True (logs warning) when DB is absent."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    with patch("backend.services.backup_service.AppPaths.get_user_data_dir", return_value=data_dir):
        result = BackupService.run_daily_backup()

    assert result is True
