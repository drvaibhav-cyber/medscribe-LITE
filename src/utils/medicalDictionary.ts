export interface MedicalTerm {
  term: string;
  category: 'Prescription Frequency' | 'Timing' | 'Clinical Heading' | 'Systemic Exam' | 'Common Abbreviation';
  meaning: string;
  example: string;
}

export const MEDICAL_ABBREVIATIONS: MedicalTerm[] = [
  { term: 'Rx', category: 'Prescription Frequency', meaning: 'Prescription / Recipe (Take thou)', example: 'Rx Tab Augmentin' },
  { term: 'OD', category: 'Prescription Frequency', meaning: 'Omni die (Once a day / 1-0-0)', example: 'Tab Telma 40mg OD in morning' },
  { term: 'BD / BID', category: 'Prescription Frequency', meaning: 'Bis in die (Twice a day / 1-0-1)', example: 'Tab Augmentin 625mg BD x 5 days' },
  { term: 'TDS / TID', category: 'Prescription Frequency', meaning: 'Ter die sumendum (Three times a day / 1-1-1)', example: 'Tab Paracetamol 650mg TDS' },
  { term: 'QID', category: 'Prescription Frequency', meaning: 'Quater in die (Four times a day / 1-1-1-1)', example: 'Eye drops 1 drop QID' },
  { term: 'SOS', category: 'Prescription Frequency', meaning: 'Si opus sit (If needed / As required)', example: 'Tab Ondansetron 4mg SOS for nausea' },
  { term: 'Stat', category: 'Prescription Frequency', meaning: 'Statim (Immediately / Emergency single dose)', example: 'Inj Diclofenac 75mg IM stat' },
  { term: 'HS', category: 'Prescription Frequency', meaning: 'Hora somni (At bedtime / night)', example: 'Tab Clonazepam 0.5mg HS' },
  { term: 'PRN', category: 'Prescription Frequency', meaning: 'Pro re nata (According to necessity)', example: 'Nebulization PRN for breathlessness' },
  { term: 'a/c', category: 'Timing', meaning: 'Ante cibum (Before food / empty stomach)', example: 'Cap Pantocid 40mg a/c (30 min before breakfast)' },
  { term: 'p/c', category: 'Timing', meaning: 'Post cibum (After food)', example: 'Tab Ibuprofen 400mg p/c' },
  { term: 'F/u', category: 'Clinical Heading', meaning: 'Follow-up (Follow-up consultation / visit)', example: 'F/u c/o Burning — on medication, good relief' },
  { term: 'r/w', category: 'Clinical Heading', meaning: 'Review (Re-evaluate / To review after specified duration)', example: 'To r/w after 1 month' },
  { term: 'S/B', category: 'Clinical Heading', meaning: 'Seen by (Treating / Examining Doctor)', example: 'S/B Attending Doctor' },
  { term: 'c/o', category: 'Clinical Heading', meaning: 'Complains of (Chief complaints)', example: 'c/o Fever x 3 days, dry cough x 2 days' },
  { term: 'h/o', category: 'Clinical Heading', meaning: 'History of', example: 'h/o Bronchial asthma in childhood' },
  { term: 'k/c/o', category: 'Clinical Heading', meaning: 'Known case of (Pre-existing comorbidity)', example: 'k/c/o T2DM x 8 yrs, HTN x 5 yrs' },
  { term: 'o/e', category: 'Clinical Heading', meaning: 'On examination (Physical findings)', example: 'o/e P/A soft NT, Bladder np' },
  { term: 'G/C', category: 'Systemic Exam', meaning: 'General condition', example: 'G/C Fair, conscious, oriented' },
  { term: 'P/A', category: 'Systemic Exam', meaning: 'Per Abdomen (Abdominal examination)', example: 'P/A Soft, non-tender, no organomegaly' },
  { term: 'CVS', category: 'Systemic Exam', meaning: 'Cardiovascular System', example: 'CVS S1 S2 heard, no murmurs' },
  { term: 'RS', category: 'Systemic Exam', meaning: 'Respiratory System', example: 'RS Bilateral vesicular breath sounds, no wheeze' },
  { term: 'CNS', category: 'Systemic Exam', meaning: 'Central Nervous System', example: 'CNS Pupils reactive, no focal neurological deficit' },
  { term: 'UHID', category: 'Common Abbreviation', meaning: 'Unique Hospital Identification Number', example: 'UHID: 2024-88492' },
  { term: 'OPD', category: 'Common Abbreviation', meaning: 'Outpatient Department', example: 'OPD Reg # 4109' },
  { term: 'RBS / GRBS', category: 'Common Abbreviation', meaning: 'Random / General Blood Sugar', example: 'GRBS: 138 mg/dL' },
  { term: 'SpO2', category: 'Common Abbreviation', meaning: 'Blood Oxygen Saturation (Pulse Oximetry)', example: 'SpO2: 99% on room air' },
  { term: 'BP', category: 'Common Abbreviation', meaning: 'Blood Pressure', example: 'BP: 120/80 mmHg' },
  { term: 'PR', category: 'Common Abbreviation', meaning: 'Pulse Rate', example: 'PR: 76 / min regular' },
];
