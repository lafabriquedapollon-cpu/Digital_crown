from pydantic import BaseModel, ConfigDict, Field
import datetime
from typing import Optional, Dict, List, Literal, Any, Union

from .base import DocumentType, DocumentStatus, ConflictResolution


# --- DOCUMENT FACTORY ---

class MedicationItem(BaseModel):
    nom: str
    dosage: Optional[str] = ""
    forme: Optional[str] = "Sachets"
    posologie: Optional[str] = ""
    type: Optional[str] = "MEDICAMENT"


class OrdonnanceData(BaseModel):
    medications: List[MedicationItem] = []
    doc_date: Optional[datetime.date] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    show_legal_annotations: bool = False


class CertificatData(BaseModel):
    reason: Optional[str] = "Certificat Médical"
    days: Optional[int] = 1
    start_date: Optional[datetime.date] = None
    is_work_stop: bool = False
    age: Optional[int] = None
    gender: Optional[str] = None


class ToothTreatmentInfo(BaseModel):
    code: str
    name: str
    price: float


class ToothData(BaseModel):
    tooth_number: int
    treatments: List[ToothTreatmentInfo]
    surfaces: List[str] = []
    notes: Optional[str] = None


class InstallmentBase(BaseModel):
    label: str
    amount: float
    due_date: datetime.date
    paid_date: Optional[datetime.date] = None
    status: str = "EN_ATTENTE"
    notes: Optional[str] = None


class InstallmentCreate(InstallmentBase):
    pass


class InstallmentOut(InstallmentBase):
    id: int
    plan_id: int
    model_config = ConfigDict(from_attributes=True)


class InstallmentPlanBase(BaseModel):
    title: str
    total_amount: float


class InstallmentPlanCreate(InstallmentPlanBase):
    patient_id: int
    installments: List[InstallmentCreate]


class InstallmentPlanOut(InstallmentPlanBase):
    id: int
    patient_id: int
    created_at: datetime.datetime
    installments: List[InstallmentOut]
    model_config = ConfigDict(from_attributes=True)


class DevisItem(BaseModel):
    acte: str = ""
    dent: str = ""
    dents: List[Union[int, str]] = []
    prix_unitaire: float = 0.0


class InstallmentItem(BaseModel):
    date: Optional[datetime.date] = None
    amount: float = 0.0
    label: str = "Versement"


class DevisData(BaseModel):
    items: List[DevisItem] = []
    doc_date: Optional[datetime.date] = None
    teeth_data: List[ToothData] = []
    age: Optional[int] = None
    gender: Optional[str] = None
    installments: List[InstallmentItem] = []


class PaymentItem(BaseModel):
    date: Optional[datetime.date] = None
    acte: str = ""
    dent: str = "-"
    dents: List[Union[int, str]] = []
    montant: float = 0.0
    mode_reglement: str = "Espèces"


class HonorairesData(BaseModel):
    payments: List[PaymentItem] = []
    doc_date: Optional[datetime.date] = None
    teeth_data: List[ToothData] = []
    age: Optional[int] = None
    gender: Optional[str] = None
    installments: List[InstallmentItem] = []


class LibreData(BaseModel):
    titre: str = Field(default='DOCUMENT MÉDICAL', alias='title')
    contenu: str = Field(default='', alias='content')
    doc_date: Optional[datetime.date] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    custom_patient: Optional[str] = None
    custom_date: Optional[str] = None
    hide_patient_header: bool = False
    page_size: str = "A5"
    alignment: str = "justify"
    model_config = ConfigDict(populate_by_name=True)


class DocumentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["ordonnance", "certificat", "devis", "note", "honoraires", "libre", "lettre"]
    patient_id: int
    data: Dict
    is_accounted: bool = True
    payment_status: Optional[str] = "EN_ATTENTE" # EN_ATTENTE, PAYE, PARTIEL


# --- SMART ORDONNANCE ---

class MedicationOut(BaseModel):
    id: int
    nom: str
    dosage: Optional[str] = None
    forme: Optional[str] = None
    usage_count: int
    model_config = ConfigDict(from_attributes=True)


class ClinicalCategoryOut(BaseModel):
    id: int
    label: str
    model_config = ConfigDict(from_attributes=True)


class ClinicalProtocolOut(BaseModel):
    id: int
    category_id: int
    variant_name: str
    medications_json: Any
    model_config = ConfigDict(from_attributes=True)


class PrescriptionLearnRequest(BaseModel):
    medications: List[MedicationItem]


# --- CATALOGUE DES ACTES ---

class ClinicalActCatalogBase(BaseModel):
    name: str
    base_price: float


class ClinicalActCatalogOut(ClinicalActCatalogBase):
    id: int
    usage_count: int
    model_config = ConfigDict(from_attributes=True)


class ActLearnRequestItem(BaseModel):
    name: str
    price_applied: float


class ActLearnRequest(BaseModel):
    acts: List[ActLearnRequestItem]


# --- ERP & IA PHARMACOLOGIQUE ---

class AIPrescriptionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    acte: str
    age: Optional[int] = None


class BIStatsOut(BaseModel):
    ca_mensuel: float
    ca_annuel: float
    repartition_actes: Dict[str, float]
    evolution_mensuelle: List[Dict[str, Any]]


# --- ARCHIVAGE DOCUMENTAIRE ---

class DocumentArchiveBase(BaseModel):
    document_type: DocumentType
    title: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = []


class DocumentArchiveCreate(DocumentArchiveBase):
    patient_id: int
    analysis_id: Optional[int] = None
    clinical_data: Optional[Dict] = None


class DocumentVersionInfo(BaseModel):
    version_number: int
    created_at: datetime.datetime
    file_size: int
    is_latest: bool


class DocumentArchiveOut(DocumentArchiveBase):
    id: Union[int, str]
    patient_id: int
    filename: str
    original_filename: str
    file_size: int
    file_hash: str
    document_group_id: str
    version_number: int
    is_latest_version: bool
    status: DocumentStatus
    created_at: datetime.datetime
    updated_at: datetime.datetime
    deleted_at: Optional[datetime.datetime] = None
    thumbnail_url: Optional[str] = None
    download_url: str
    file_exists: bool = False
    all_versions: List[DocumentVersionInfo] = []

    class Config:
        from_attributes = True


class DocumentConflictCheck(BaseModel):
    has_conflict: bool
    existing_document: Optional[DocumentArchiveOut] = None
    conflict_reason: Optional[str] = None
    suggested_action: Optional[ConflictResolution] = None


class DocumentArchiveRequest(BaseModel):
    document_type: DocumentType
    title: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = []
    check_conflicts: bool = True
    on_conflict: ConflictResolution = ConflictResolution.CREATE_VERSION


class DocumentArchiveResponse(BaseModel):
    success: bool
    message: str
    document: Optional[DocumentArchiveOut] = None
    conflict_info: Optional[DocumentConflictCheck] = None
    requires_action: bool = False


class DocumentListParams(BaseModel):
    patient_id: Optional[int] = None
    document_type: Optional[DocumentType] = None
    status: Optional[DocumentStatus] = DocumentStatus.ACTIF
    tags: List[str] = []
    search_query: Optional[str] = None
    date_from: Optional[datetime.datetime] = None
    date_to: Optional[datetime.datetime] = None
    page: int = 1
    page_size: int = 20


class DocumentListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    documents: List[DocumentArchiveOut]


class DocumentTrashResponse(BaseModel):
    message: str
    document_id: Union[int, str]
    deleted_at: datetime.datetime
    permanent_delete_at: datetime.datetime


class DocumentRestoreResponse(BaseModel):
    message: str
    document_id: Union[int, str]
    restored_at: datetime.datetime


class DocumentBatchDeleteRequest(BaseModel):
    document_ids: List[Union[int, str]]
    permanent: bool = False


class DocumentBatchResponse(BaseModel):
    success: List[int]
    failed: List[Dict[int, str]]


class DocumentShareLink(BaseModel):
    token: str
    expires_at: datetime.datetime
    download_url: str
    max_downloads: int = 5


class DocumentPreviewResponse(BaseModel):
    document_id: Union[int, str]
    preview_url: str
    thumbnail_url: Optional[str] = None
    file_type: str
    can_preview: bool


class HonoraireItem(BaseModel):
    id: Union[int, str]
    patient_id: int
    patient_name: str
    assurance: Optional[str] = "AUCUNE"
    date: datetime.datetime
    title: str
    amount: float
    file_url: str
    payment_status: Optional[str] = "EN_ATTENTE"
    validated_by: Optional[str] = None


class HonoraireListResponse(BaseModel):
    total: int
    total_amount: float
    total_collected: float = 0.0
    items: List[HonoraireItem]
    summary_by_title: dict = {}
