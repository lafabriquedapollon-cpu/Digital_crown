"""
Router API pour la gestion des cabinets (Setup Wizard & Configuration).
"""
import os
import uuid
import shutil
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Request
from sqlalchemy.orm import Session

from backend import models, schemas, database
from backend.database import get_db
from backend.routers.auth import get_current_user
from backend.services.card_extractor import card_extractor
from backend.services.logo_processor import LogoProcessor
from backend.services.license_service import LicenseService

router = APIRouter()


@router.post("/recheck-license")
async def recheck_license(request: Request, current_user: models.User = Depends(get_current_user)):
    """Re-vérifie la licence (Admin only). Débloque l'app si la licence est redevenue valide."""
    if current_user.role != models.UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Non autorisé.")
        
    clinic_id = os.getenv("CLINIC_ID", "default_clinic")
    license_ok = await LicenseService().validate_license(clinic_id)
    
    request.app.state.license_ok = license_ok
    
    if not license_ok:
        raise HTTPException(status_code=402, detail="La licence est toujours invalide.")
        
    return {"message": "Licence validée avec succès. Application déverrouillée."}


@router.get("/init-status")
def check_init_status(db: Session = Depends(get_db)):
    """
    Vérifie si le cabinet est initialisé. 
    Règle absolue : S'il y a un Dentiste/Admin en DB, on considère le cabinet initialisé et on bypass le Wizard.
    """
    admin_user = db.query(models.User).filter(
        models.User.role.in_([models.UserRole.ADMIN, models.UserRole.DENTISTE])
    ).first()

    if admin_user:
        any_config = db.query(models.CabinetConfig).first()
        if not any_config:
            new_config = models.CabinetConfig(
                owner_id=admin_user.id,
                nom_cabinet=admin_user.nom_complet or "Mon Cabinet",
                nom_praticien=admin_user.nom_complet or "Docteur",
                is_initialized=True
            )
            db.add(new_config)
            db.commit()
        elif not any_config.is_initialized:
            any_config.is_initialized = True
            db.commit()
            
        return {
            "is_initialized": True,
            "needs_setup": False
        }
    
    # Mode "Nouveau Client" (pas de dentiste créé / base de donnée vide)
    return {
        "is_initialized": False,
        "needs_setup": True
    }


@router.post("/")
def create_clinic(
    config: schemas.CabinetConfigCreate,
    db: Session = Depends(get_db)
):
    """
    Créer la configuration d'un nouveau cabinet (Wizard étape 1).
    """
    existing_cabinet = db.query(models.CabinetConfig).first()
    if existing_cabinet:
        raise HTTPException(status_code=400, detail="Un cabinet existe déjà. Contactez l'administrateur.")
    
    admin_user = db.query(models.User).filter(
        models.User.role == models.UserRole.ADMIN
    ).first()
    
    if not admin_user:
        admin_email = os.getenv("SUPERADMIN_EMAIL", "")
        admin_initial_pwd = os.getenv("SUPERADMIN_INITIAL_PASSWORD", "")
        if not admin_email or not admin_initial_pwd:
            raise HTTPException(
                status_code=500,
                detail="SUPERADMIN_EMAIL et SUPERADMIN_INITIAL_PASSWORD doivent être définis dans l'environnement avant le setup."
            )
        from backend.database import pwd_context
        admin_user = models.User(
            email=admin_email,
            hashed_password=pwd_context.hash(admin_initial_pwd),
            role=models.UserRole.ADMIN,
            nom_complet=config.header_lines_fr[0] if config.header_lines_fr else "Administrateur"
        )
        db.add(admin_user)
        db.flush()
    
    db_config = models.CabinetConfig(
        owner_id=admin_user.id,
        nom_cabinet=config.nom_cabinet,
        header_lines_fr=config.header_lines_fr,
        header_lines_ar=config.header_lines_ar,
        footer_address=config.footer_address,
        footer_phones=config.footer_phones,
        primary_color=config.primary_color,
        font_fr=config.font_fr,
        font_ar=config.font_ar,
        watermark_enabled=config.watermark_enabled,
        watermark_opacity=config.watermark_opacity,
        selected_theme=config.selected_theme,
        cabinet_type=models.CabinetType(config.cabinet_type),
        is_initialized=True
    )
    
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    
    return db_config


@router.get("/me")
def get_my_clinic(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    """Récupérer la configuration du cabinet."""
    employer_id = current_user.get_employer_id()
    config = db.query(models.CabinetConfig).filter(models.CabinetConfig.owner_id == employer_id).first()
    
    if not config:
        # Création à la volée pour les nouveaux utilisateurs / admins (auto-corrective)
        config = models.CabinetConfig(
            owner_id=employer_id,
            nom_cabinet=current_user.nom_complet or "Mon Cabinet",
            nom_praticien=current_user.nom_complet or "Docteur",
            primary_color="#003380",
            secondary_color="#1e40af",
            accent_color="#60a5fa",
            font_fr="Inter",
            font_ar="Amiri",
            qr_code_enabled=False,
            qr_code_style="dots",
            qr_code_type="VCARD",
            watermark_enabled=False,
            margin_top=3.6,
            margin_bottom=3.2
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    
    return config


@router.put("/me")
def update_my_clinic(
    config_update: schemas.CabinetConfigUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Mettre à jour la configuration du cabinet."""
    employer_id = current_user.get_employer_id()
    config = db.query(models.CabinetConfig).filter(models.CabinetConfig.owner_id == employer_id).first()
    
    if not config:
        # Création à la volée pour les nouveaux utilisateurs / admins (auto-corrective)
        config = models.CabinetConfig(
            owner_id=employer_id,
            nom_cabinet=current_user.nom_complet or "Mon Cabinet",
            nom_praticien=current_user.nom_complet or "Docteur",
            primary_color="#003380",
            secondary_color="#1e40af",
            accent_color="#60a5fa",
            font_fr="Inter",
            font_ar="Amiri",
            qr_code_enabled=False,
            qr_code_style="dots",
            qr_code_type="VCARD",
            watermark_enabled=False,
            margin_top=3.6,
            margin_bottom=3.2
        )
        db.add(config)
        db.flush()
    
    update_dict = config_update.model_dump(exclude_unset=True)
    
    # Mapping intelligent des alias vers les colonnes physiques
    if "adresse" in update_dict:
        if "footer_address" not in update_dict:
            update_dict["footer_address"] = update_dict.pop("adresse")
        else:
            update_dict.pop("adresse")
            
    if "telephone" in update_dict:
        if "footer_phones" not in update_dict:
            update_dict["footer_phones"] = update_dict.pop("telephone")
        else:
            update_dict.pop("telephone")
            
    if "nom" in update_dict:
        nom_val = update_dict.pop("nom")
        update_dict["nom_praticien"] = nom_val
        if "nom_cabinet" not in update_dict:
            update_dict["nom_cabinet"] = nom_val
            
        current_headers = list(config.header_lines_fr) if config.header_lines_fr else []
        if current_headers:
            current_headers[0] = nom_val
        else:
            current_headers = [nom_val]
        update_dict["header_lines_fr"] = current_headers
        
    for key, value in update_dict.items():
        if hasattr(config, key):
            setattr(config, key, value)
    
    db.commit()
    db.refresh(config)
    return config


@router.post("/me/logo")
async def upload_clinic_logo(
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Uploader le logo du cabinet."""
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Format non supporté. Utilisez PNG, JPG ou SVG")
    
    employer_id = current_user.get_employer_id()
    config = db.query(models.CabinetConfig).filter(models.CabinetConfig.owner_id == employer_id).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Cabinet non configuré")
    
    static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
    clinic_dir = os.path.join(static_dir, "uploads", "clinics", config.public_id)
    os.makedirs(clinic_dir, exist_ok=True)
    
    file_ext = file.filename.split(".")[-1].lower()
    file_bytes = await file.read()
    
    if file.content_type == "image/svg+xml":
        final_bytes = file_bytes
        file_ext = "svg"
    else:
        # Traitement Premium (IA Détourage + Normalisation)
        png_bytes = LogoProcessor.process_logo(file_bytes)
        final_bytes = png_bytes
        file_ext = "png"

    unique_name = f"logo_{uuid.uuid4().hex[:8]}.{file_ext}"
    file_path = os.path.join(clinic_dir, unique_name)
    
    with open(file_path, "wb") as buffer:
        buffer.write(final_bytes)
    
    relative_path = f"clinics/{config.public_id}/{unique_name}"
    config.logo_path = relative_path
    db.commit()
    
    return {"logo_url": f"/static/uploads/{relative_path}"}


@router.post("/me/letterhead")
async def upload_clinic_letterhead(
    file: UploadFile = File(...),
    hide_header: bool = True,
    hide_footer: bool = True,
    margins_top: float = 3.6,
    margins_bottom: float = 3.2,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Uploader le papier en-tête (Letterhead) du cabinet."""
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Format non supporté. Utilisez PNG, JPG ou PDF")
    
    # Check size
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 5Mo)")
    
    employer_id = current_user.get_employer_id()
    config = db.query(models.CabinetConfig).filter(models.CabinetConfig.owner_id == employer_id).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Cabinet non configuré")
    
    static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
    clinic_dir = os.path.join(static_dir, "uploads", "clinics", config.public_id)
    os.makedirs(clinic_dir, exist_ok=True)
    
    file_ext = file.filename.split(".")[-1]
    if file_ext.lower() == "pdf":
        file_ext = "png"
    unique_name = f"letterhead_{uuid.uuid4().hex[:8]}.{file_ext}"
    file_path = os.path.join(clinic_dir, unique_name)
    
    with open(file_path, "wb") as buffer:
        buffer.write(content)
    
    relative_path = f"clinics/{config.public_id}/{unique_name}"
    config.letterhead_path = relative_path
    config.margin_top = margins_top
    config.margin_bottom = margins_bottom
    config.hide_header = hide_header
    config.hide_footer = hide_footer
    db.commit()
    
    return {
        "letterhead_url": f"/static/uploads/{relative_path}",
        "hide_default_header": hide_header,
        "hide_default_footer": hide_footer,
        "message": "Letterhead uploadé avec succès."
    }

@router.post("/extract-card")
async def extract_business_card(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user)
):
    """Extraction IA d'une carte de visite pour remplissage auto."""
    allowed_types = {"image/jpeg", "image/jpg", "image/png"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Format non supporté. Utilisez JPEG ou PNG uniquement.")

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 2 Mo).")

    import tempfile
    fd, temp_path = tempfile.mkstemp(suffix=".jpg")
    try:
        with os.fdopen(fd, "wb") as tmp:
            tmp.write(content)
        data = await card_extractor.extract(temp_path)
        return data
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
