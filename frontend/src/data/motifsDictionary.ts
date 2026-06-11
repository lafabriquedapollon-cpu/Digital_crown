export interface MotifItem {
  id: string;
  label: string;
  urgency: 'urgence' | 'normal' | 'planifié';
  specialty_hints: string[];
  act_hints: string[];
}

export interface MotifCategory {
  id: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  motifs: MotifItem[];
}

export const MOTIFS_DICTIONARY: MotifCategory[] = [
  {
    id: 'DOULEUR',
    label: 'Douleur',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    motifs: [
      { id: 'douleur_aigue', label: 'Douleur dentaire aiguë', urgency: 'urgence', specialty_hints: ['ENDODONTIE'], act_hints: ['Traitement canalaire mono-radiculé', 'Pulpotomie'] },
      { id: 'douleur_mastication', label: 'Douleur à la mastication', urgency: 'urgence', specialty_hints: ['CONSERVATRICE', 'PROTHESE'], act_hints: ['Composite 1 face', 'Couronne zircone'] },
      { id: 'douleur_pression', label: 'Douleur à la pression / percussion', urgency: 'urgence', specialty_hints: ['ENDODONTIE'], act_hints: ['Traitement canalaire bi-radiculé', 'Retraitement canalaire'] },
      { id: 'sensibilite_chaud_froid', label: 'Sensibilité au chaud / froid', urgency: 'normal', specialty_hints: ['CONSERVATRICE', 'ENDODONTIE'], act_hints: ['Traitement hypersensibilité', 'Pulpectomie'] },
      { id: 'douleur_nocturne', label: 'Douleur nocturne', urgency: 'urgence', specialty_hints: ['ENDODONTIE'], act_hints: ['Traitement canalaire mono-radiculé'] },
      { id: 'douleur_gingivale', label: 'Douleur gingivale / gencive enflée', urgency: 'normal', specialty_hints: ['PARODONTOLOGIE', 'CHIRURGIE'], act_hints: ['Détartrage & Polissage', 'Curetage parodontal'] },
    ],
  },
  {
    id: 'URGENCE',
    label: 'Urgence',
    color: 'text-rose-700',
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-300',
    motifs: [
      { id: 'abces', label: 'Abcès dentaire', urgency: 'urgence', specialty_hints: ['ENDODONTIE', 'CHIRURGIE'], act_hints: ['Pulpectomie', 'Extraction chirurgicale'] },
      { id: 'gonflement_facial', label: 'Gonflement facial', urgency: 'urgence', specialty_hints: ['CHIRURGIE'], act_hints: ['Extraction chirurgicale', 'Alvéolectomie'] },
      { id: 'traumatisme_dent', label: 'Traumatisme / dent fracturée', urgency: 'urgence', specialty_hints: ['CONSERVATRICE', 'ENDODONTIE'], act_hints: ['Composite 3 faces', 'Traitement canalaire mono-radiculé'] },
      { id: 'avulsion', label: 'Avulsion / dent expulsée', urgency: 'urgence', specialty_hints: ['CHIRURGIE', 'IMPLANTOLOGIE'], act_hints: ['Pose implant', 'Couronne sur implant'] },
      { id: 'couronne_descellée', label: 'Couronne / bridge descellé(e)', urgency: 'urgence', specialty_hints: ['PROTHESE'], act_hints: ['Couronne zircone', 'Bridge 3 éléments'] },
    ],
  },
  {
    id: 'PARODONTAL',
    label: 'Parodontal',
    color: 'text-teal-700',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    motifs: [
      { id: 'saignement_gingival', label: 'Saignement gingival', urgency: 'normal', specialty_hints: ['PARODONTOLOGIE'], act_hints: ['Détartrage & Polissage', 'Bilan parodontal'] },
      { id: 'mobilite_dentaire', label: 'Mobilité dentaire', urgency: 'normal', specialty_hints: ['PARODONTOLOGIE', 'CHIRURGIE'], act_hints: ['Bilan parodontal', 'Lambeau parodontal'] },
      { id: 'recession_gingivale', label: 'Récession gingivale', urgency: 'planifié', specialty_hints: ['PARODONTOLOGIE'], act_hints: ['Surfaçage radiculaire (secteur)', 'Curetage parodontal'] },
      { id: 'halitose', label: 'Mauvaise haleine (halitose)', urgency: 'normal', specialty_hints: ['PARODONTOLOGIE'], act_hints: ['Détartrage & Polissage', 'Bilan parodontal'] },
      { id: 'tartre_important', label: 'Dépôts de tartre importants', urgency: 'normal', specialty_hints: ['PARODONTOLOGIE'], act_hints: ['Détartrage & Polissage'] },
    ],
  },
  {
    id: 'ESTHETIQUE',
    label: 'Esthétique',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
    borderColor: 'border-pink-200',
    motifs: [
      { id: 'dents_colorees', label: 'Dents colorées / tachées', urgency: 'planifié', specialty_hints: ['ESTHETIQUE'], act_hints: ['Blanchiment dentaire (cabinet)', 'Gouttière blanchiment'] },
      { id: 'dent_ebrechee', label: 'Dent ébréchée / fracturée', urgency: 'normal', specialty_hints: ['CONSERVATRICE', 'ESTHETIQUE'], act_hints: ['Composite 2 faces', 'Reconstitution esthétique'] },
      { id: 'diasteme', label: 'Diastème / espacement entre dents', urgency: 'planifié', specialty_hints: ['ORTHODONTIE', 'ESTHETIQUE'], act_hints: ['Facette céramique', 'Semestre ODF multibagues'] },
      { id: 'sourire_gingival', label: 'Sourire gingival', urgency: 'planifié', specialty_hints: ['PARODONTOLOGIE', 'ESTHETIQUE'], act_hints: ['Lambeau parodontal'] },
      { id: 'facettes', label: 'Demande de facettes', urgency: 'planifié', specialty_hints: ['PROTHESE', 'ESTHETIQUE'], act_hints: ['Facette céramique'] },
    ],
  },
  {
    id: 'CONSERVATRICE',
    label: 'Soins Conservateurs',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    motifs: [
      { id: 'carie', label: 'Carie dentaire', urgency: 'normal', specialty_hints: ['CONSERVATRICE'], act_hints: ['Composite 1 face', 'Composite 2 faces', 'Composite 3 faces'] },
      { id: 'carie_multiple', label: 'Caries multiples', urgency: 'normal', specialty_hints: ['CONSERVATRICE', 'PREVENTION'], act_hints: ['Composite 1 face', 'Scellement de fissures', 'Fluorisation'] },
      { id: 'dent_fissure', label: 'Dent fissurée', urgency: 'normal', specialty_hints: ['CONSERVATRICE', 'ENDODONTIE'], act_hints: ['Composite 3 faces', 'Inlay/Onlay céramique'] },
      { id: 'obturation_defectueuse', label: 'Obturation défectueuse / secondaire', urgency: 'normal', specialty_hints: ['CONSERVATRICE'], act_hints: ['Composite 2 faces'] },
    ],
  },
  {
    id: 'PROTHESE',
    label: 'Prothèse',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    motifs: [
      { id: 'remplacement_dent', label: 'Remplacement d\'une dent manquante', urgency: 'planifié', specialty_hints: ['PROTHESE', 'IMPLANTOLOGIE'], act_hints: ['Couronne zircone', 'Pose implant', 'Bridge 3 éléments'] },
      { id: 'prothese_amovible', label: 'Prothèse amovible cassée / inadaptée', urgency: 'normal', specialty_hints: ['PROTHESE'], act_hints: ['Prothèse adjointe partielle', 'Prothèse complète'] },
      { id: 'bridge_defectueux', label: 'Bridge défectueux', urgency: 'normal', specialty_hints: ['PROTHESE'], act_hints: ['Bridge 3 éléments', 'Inlay core'] },
      { id: 'premiere_prothese', label: 'Première demande de prothèse', urgency: 'planifié', specialty_hints: ['PROTHESE'], act_hints: ['Prothèse complète', 'Prothèse adjointe partielle'] },
    ],
  },
  {
    id: 'ORTHODONTIE',
    label: 'Orthodontie',
    color: 'text-sky-600',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
    motifs: [
      { id: 'malocclusion', label: 'Malocclusion / dents mal alignées', urgency: 'planifié', specialty_hints: ['ORTHODONTIE'], act_hints: ['Bilan orthodontique', 'Semestre ODF multibagues'] },
      { id: 'decalage_maxillaire', label: 'Décalage maxillaire / mandibulaire', urgency: 'planifié', specialty_hints: ['ORTHODONTIE'], act_hints: ['Bilan orthodontique'] },
      { id: 'encombrement_dentaire', label: 'Encombrement dentaire', urgency: 'planifié', specialty_hints: ['ORTHODONTIE'], act_hints: ['Semestre ODF multibagues', 'Gouttière aligneur (par semestre)'] },
      { id: 'bilan_ortho_enfant', label: 'Bilan orthodontique enfant', urgency: 'planifié', specialty_hints: ['ORTHODONTIE'], act_hints: ['Bilan orthodontique'] },
      { id: 'aligneurs', label: 'Demande de gouttières / aligneurs', urgency: 'planifié', specialty_hints: ['ORTHODONTIE'], act_hints: ['Gouttière aligneur (par semestre)', 'Bilan orthodontique'] },
    ],
  },
  {
    id: 'IMPLANTOLOGIE',
    label: 'Implantologie',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
    motifs: [
      { id: 'bilan_implantaire', label: 'Bilan implantaire', urgency: 'planifié', specialty_hints: ['IMPLANTOLOGIE'], act_hints: ['Pose implant', 'Greffe osseuse'] },
      { id: 'implant_douloureux', label: 'Implant douloureux / mobile', urgency: 'urgence', specialty_hints: ['IMPLANTOLOGIE', 'CHIRURGIE'], act_hints: ['Élévation sinusienne'] },
      { id: 'eden_complet', label: 'Édentement complet (all-on-4)', urgency: 'planifié', specialty_hints: ['IMPLANTOLOGIE', 'PROTHESE'], act_hints: ['Prothèse implanto-portée', 'Greffe osseuse'] },
    ],
  },
  {
    id: 'PREVENTION',
    label: 'Prévention & Contrôle',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    motifs: [
      { id: 'controle_annuel', label: 'Visite de contrôle annuelle', urgency: 'planifié', specialty_hints: ['PREVENTION'], act_hints: ['Consultation standard', 'Détartrage & Polissage'] },
      { id: 'bilan_general', label: 'Bilan bucco-dentaire complet', urgency: 'planifié', specialty_hints: ['PREVENTION'], act_hints: ['Consultation standard', 'Radiographie panoramique'] },
      { id: 'suivi_traitement', label: 'Suivi post-traitement', urgency: 'planifié', specialty_hints: ['PREVENTION'], act_hints: ['Consultation standard'] },
      { id: 'bruxisme', label: 'Bruxisme / grincement de dents', urgency: 'normal', specialty_hints: ['PREVENTION', 'PROTHESE'], act_hints: ['Consultation standard', 'Gouttière blanchiment'] },
      { id: 'prise_en_charge_enfant', label: 'Première consultation enfant', urgency: 'planifié', specialty_hints: ['PREVENTION'], act_hints: ['Scellement de fissures', 'Fluorisation', 'Consultation standard'] },
    ],
  },
];

export const MOTIF_URGENCY_LABELS: Record<string, { label: string; color: string }> = {
  urgence: { label: 'Urgence', color: 'text-red-600 bg-red-50 border-red-200' },
  normal: { label: 'Normal', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  planifié: { label: 'Planifié', color: 'text-sky-600 bg-sky-50 border-sky-200' },
};

export function findMotifById(id: string): MotifItem | undefined {
  for (const cat of MOTIFS_DICTIONARY) {
    const found = cat.motifs.find(m => m.id === id);
    if (found) return found;
  }
  return undefined;
}

export function findCategoryForMotif(motifId: string): MotifCategory | undefined {
  return MOTIFS_DICTIONARY.find(cat => cat.motifs.some(m => m.id === motifId));
}

export function parseMotifs(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // legacy free text — return as single-item
    return raw ? [raw] : [];
  }
  return [];
}
