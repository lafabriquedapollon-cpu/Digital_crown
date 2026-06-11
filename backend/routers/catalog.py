from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend import models
from backend.database import SessionLocal, get_db
from backend.schemas.catalog import (
    SpecialtyCreate, SpecialtyUpdate, SpecialtyOut,
    PathologyCreate, PathologyUpdate, PathologyOut,
    CatalogActCreate, CatalogActUpdate, CatalogActOut
)
from backend.routers.auth import get_current_user

router = APIRouter(tags=["Catalog (Specialties, Acts, Pathologies)"])

# ==============================================================================
# --- SPECIALTIES ---
# ==============================================================================

@router.get("/specialties", response_model=List[SpecialtyOut])
def get_specialties(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Specialty).all()

@router.post("/specialties", response_model=SpecialtyOut, status_code=status.HTTP_201_CREATED)
def create_specialty(payload: SpecialtyCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    specialty = models.Specialty(**payload.model_dump())
    db.add(specialty)
    db.commit()
    db.refresh(specialty)
    return specialty

@router.put("/specialties/{specialty_id}", response_model=SpecialtyOut)
def update_specialty(specialty_id: int, payload: SpecialtyUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    specialty = db.query(models.Specialty).filter(models.Specialty.id == specialty_id).first()
    if not specialty:
        raise HTTPException(status_code=404, detail="Specialty not found")
    
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(specialty, key, value)
    
    db.commit()
    db.refresh(specialty)
    return specialty

# ==============================================================================
# --- PATHOLOGIES ---
# ==============================================================================

@router.post("/specialties/{specialty_id}/pathologies", response_model=PathologyOut, status_code=status.HTTP_201_CREATED)
def create_pathology(specialty_id: int, payload: PathologyCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    specialty = db.query(models.Specialty).filter(models.Specialty.id == specialty_id).first()
    if not specialty:
        raise HTTPException(status_code=404, detail="Specialty not found")
        
    pathology = models.Pathology(specialty_id=specialty_id, **payload.model_dump())
    db.add(pathology)
    db.commit()
    db.refresh(pathology)
    return pathology

@router.put("/pathologies/{pathology_id}", response_model=PathologyOut)
def update_pathology(pathology_id: int, payload: PathologyUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    pathology = db.query(models.Pathology).filter(models.Pathology.id == pathology_id).first()
    if not pathology:
        raise HTTPException(status_code=404, detail="Pathology not found")
        
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(pathology, key, value)
        
    db.commit()
    db.refresh(pathology)
    return pathology

# ==============================================================================
# --- ACTS ---
# ==============================================================================

@router.post("/specialties/{specialty_id}/acts", response_model=CatalogActOut, status_code=status.HTTP_201_CREATED)
def create_act(specialty_id: int, payload: CatalogActCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    specialty = db.query(models.Specialty).filter(models.Specialty.id == specialty_id).first()
    if not specialty:
        raise HTTPException(status_code=404, detail="Specialty not found")
        
    act = models.CatalogAct(specialty_id=specialty_id, **payload.model_dump())
    db.add(act)
    db.commit()
    db.refresh(act)
    return act

@router.put("/acts/{act_id}", response_model=CatalogActOut)
def update_act(act_id: int, payload: CatalogActUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    act = db.query(models.CatalogAct).filter(models.CatalogAct.id == act_id).first()
    if not act:
        raise HTTPException(status_code=404, detail="Act not found")
        
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(act, key, value)
        
    db.commit()
    db.refresh(act)
    return act
