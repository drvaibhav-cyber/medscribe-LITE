import { SurgicalProtocolId } from '../types/ipd';

export interface ProtocolFieldDef {
  key: string;
  label: string;
  placeholder?: string;
  options?: string[]; // If provided, render quick select/radio chips
}

export interface ProtocolCheckItem {
  id: string;
  text: string;
  critical?: boolean;
}

export interface ProtocolStage {
  id: string;
  dayTag: string; // e.g. "POD 0", "POD 1", "POD 2", "POD 3–4", "Discharge"
  title: string;
  subtitle?: string;
  fields?: ProtocolFieldDef[];
  items: ProtocolCheckItem[];
}

export interface ProtocolSourceAsset {
  name: string;
  mimeType: string;
  url: string;
}

export interface SurgicalProtocolTemplate {
  id: SurgicalProtocolId;
  name: string;
  shortName: string;
  subtitle: string;
  pdfUrl?: string;
  sourceAssets?: ProtocolSourceAsset[];
  expectedStayDays: string;
  urgentEscalationText: string;
  defaultDischargeAdvice: string;
  defaultReturnWarnings: string;
  stages: ProtocolStage[];
  isCustom?: boolean;
  sourceFileName?: string;
  createdAt?: number;
  updatedAt?: number;
}

export const SURGICAL_PROTOCOLS: SurgicalProtocolTemplate[] = [
  {
    id: 'laparoscopic-nephrectomy',
    name: 'Laparoscopic Nephrectomy Pathway',
    shortName: 'Lap Nephrectomy',
    subtitle: 'Adult laparoscopic simple/radical nephrectomy (POD 0 to POD 4)',
    pdfUrl: '/assets/aistudio/Laparoscopic_nephrectomy_postoperative_orders_60a1155e.pdf',
    expectedStayDays: 'POD 3–4 Target Discharge',
    urgentEscalationText:
      'Urgent review: bleeding, falling Hb, hypotension, fever/rigors, low urine, rising creatinine/K, increasing abdominal pain/distension or vomiting (consider delayed bowel injury). Emergency response for chest pain, hypoxia, dyspnoea, collapse or confusion.',
    defaultDischargeAdvice:
      'Keep port/extraction wounds clean and dry; avoid heavy lifting or strenuous activity for 4–6 weeks; maintain good oral hydration; avoid unreviewed over-the-counter NSAIDs; monitor BP and long-term renal function as advised.',
    defaultReturnWarnings:
      'Return urgently for fever, wound discharge/redness, worsening abdominal pain, vomiting, low urine output or leg swelling. Seek emergency care for chest pain, dyspnoea or collapse.',
    stages: [
      {
        id: 'lap-pod0-handover',
        dayTag: 'POD 0',
        title: 'Immediate Postoperative Care & Orders',
        subtitle: 'Operative handover, observations, fluids, mobility & clot prevention',
        fields: [
          { key: 'side', label: 'Side', options: ['Right', 'Left'] },
          { key: 'type', label: 'Type', options: ['Simple', 'Radical'] },
          { key: 'approach', label: 'Approach', options: ['Retroperitoneal', 'Transperitoneal'] },
          { key: 'converted', label: 'Converted to open', options: ['No', 'Yes'] },
          { key: 'indication', label: 'Indication', placeholder: 'e.g. RCC / Non-functioning kidney' },
          { key: 'bloodLoss', label: 'Blood loss (mL)', placeholder: 'e.g. 100 mL' },
          { key: 'drainTypeSite', label: 'Drain type / site', placeholder: 'e.g. 16Fr abdominal drain' },
          { key: 'catheterFr', label: 'Catheter (Fr)', placeholder: 'e.g. 16 Fr' },
          { key: 'ivFluidOrder', label: 'IV fluid & rate (mL/h)', placeholder: 'e.g. RL / NS at 100 mL/h' },
          { key: 'dietOrder', label: 'Diet order', options: ['Oral sips/advance as tolerated', 'Nil by mouth'] },
          { key: 'operativeConcerns', label: 'Operative concerns / bowel plan', placeholder: 'Additional procedures or feeding plan' },
        ],
        items: [
          {
            id: 'lap-p0-obs',
            text: 'Recovery monitoring per anaesthesia protocol; ward BP, pulse, RR, SpO2, temperature, pain and consciousness every 2 hours.',
          },
          {
            id: 'lap-p0-uo',
            text: 'Urine output hourly initially, then every 2 hr if stable. Chart intake and separate drain output/character; review balance each shift.',
          },
          {
            id: 'lap-p0-labs',
            text: 'CBC/Hb, creatinine and electrolytes ordered and reviewed.',
          },
          {
            id: 'lap-p0-low-uo',
            text: 'Low urine protocol noted: check catheter, circulation and volume status; review before repeated fluid boluses.',
          },
          {
            id: 'lap-p0-iv',
            text: 'Review IV needs daily against oral intake, losses, renal function and fluid overload; adjust medicines for renal function and review nephrotoxins.',
          },
          {
            id: 'lap-p0-resp',
            text: 'Head-up if tolerated; deep breathing/supported cough, physiotherapy as needed; mobilise POD 1.',
          },
          {
            id: 'lap-p0-vte',
            text: 'Assess VTE/bleeding risk; select mechanical/drug prophylaxis under protocol (adjust for renal function; record if withheld).',
          },
        ],
      },
      {
        id: 'lap-pod1',
        dayTag: 'POD 1',
        title: 'POD 1 Progression',
        items: [
          {
            id: 'lap-p1-review',
            text: 'Review observations, Hb/renal function, fluid balance, pain, port sites and drain output.',
          },
          {
            id: 'lap-p1-mob',
            text: 'Mobilise out of bed with assistance; head-up position, breathing exercises and VTE plan.',
          },
          {
            id: 'lap-p1-diet',
            text: 'Clear fluids/sips when suitable (may start earlier); review NBM indication and advance as tolerated.',
          },
        ],
      },
      {
        id: 'lap-pod2',
        dayTag: 'POD 2',
        title: 'POD 2 & Urinary Catheter Plan',
        fields: [
          { key: 'drainRetainedReason', label: 'If drain retained: reason/review', placeholder: 'Reason & review date' },
          { key: 'catheterPlannedPod', label: 'Catheter planned removal POD/date', placeholder: 'e.g. POD 2' },
          { key: 'catheterRemovalTime', label: 'Catheter removal time', placeholder: 'e.g. 09:00 AM' },
          { key: 'voidTime', label: 'Void time', placeholder: 'e.g. 12:30 PM' },
          { key: 'voidVolumeMl', label: 'Void volume (mL)', placeholder: 'e.g. 260 mL' },
          { key: 'catheterRetainedReason', label: 'If catheter retained: reason/plan', placeholder: 'Reason / follow-up' },
        ],
        items: [
          {
            id: 'lap-p2-diet',
            text: 'Soft diet as tolerated; reduce IV fluids as intake improves. Continue mobilisation.',
          },
          {
            id: 'lap-p2-wound',
            text: 'Check port/extraction wounds and dressing; change if clinically indicated.',
          },
          {
            id: 'lap-p2-drain',
            text: 'If a drain is present, consider removal when output <50 mL over 24 hours, reassuring character and no suspected bleeding/leak (surgeon to authorise).',
          },
          {
            id: 'lap-p2-catheter',
            text: 'Remove urinary catheter when monitoring no longer requires it and patient is mobile; confirm comfortable voiding (review if no void by 6 hours, sooner if pain).',
          },
        ],
      },
      {
        id: 'lap-pod34',
        dayTag: 'POD 3–4',
        title: 'POD 3 & POD 4 Recovery',
        fields: [
          { key: 'flatus', label: 'Flatus passed', options: ['Yes', 'No'] },
          { key: 'stool', label: 'Stool passed', options: ['Yes', 'No'] },
          { key: 'extendedStayReason', label: 'If stay extended: reason/review', placeholder: 'Document reason if delayed' },
        ],
        items: [
          {
            id: 'lap-p3-diet',
            text: 'POD 3: full diet as tolerated; stop IV fluids when intake, renal function and volume status permit. Ensure oral pain control and assess discharge readiness.',
          },
          {
            id: 'lap-p4-discharge',
            text: 'POD 4: target discharge; check/change dressing as indicated. Review flatus/stool and exclude ileus or obstruction.',
          },
        ],
      },
      {
        id: 'lap-discharge',
        dayTag: 'Discharge',
        title: 'Discharge Readiness, Follow-up & Histopathology',
        fields: [
          { key: 'bloodThinnerPlan', label: 'Blood-thinner plan / responsible clinician', placeholder: 'Agent, restart date, clinician' },
          { key: 'bpRenalPlan', label: 'BP / long-term renal monitoring plan', placeholder: 'e.g. KFT & BP check in 2 weeks' },
          { key: 'woundReviewPlan', label: 'Wound review / suture or clip removal', placeholder: 'Date & clinic location' },
          { key: 'retainedDrainPlan', label: 'Retained drain/catheter care & removal plan', placeholder: 'If applicable' },
        ],
        items: [
          {
            id: 'lap-d-obs',
            text: 'Stable observations; no untreated infection/bleeding; renal function/electrolytes reviewed.',
          },
          {
            id: 'lap-d-func',
            text: 'Eating/drinking, oral pain control, mobility and voiding satisfactory; no significant vomiting/distension; wound/drain care arranged.',
          },
          {
            id: 'lap-d-meds',
            text: 'Medicines/renal doses reviewed; blood-thinner restart agreed; VTE duration/teaching checked.',
          },
          {
            id: 'lap-d-advice',
            text: 'Given wound/activity/driving/fluid advice; instructed to avoid unreviewed over-the-counter NSAIDs.',
          },
          {
            id: 'lap-d-return',
            text: 'Return urgently advice explained (fever, wound discharge/redness, pain, vomiting, low urine, leg swelling; emergency care for chest pain/dyspnoea/collapse).',
          },
          {
            id: 'lap-d-hpe',
            text: 'Specimen sent for HPE and result review appointment documented.',
          },
        ],
      },
    ],
  },
  {
    id: 'open-nephrectomy',
    name: 'Open Nephrectomy Pathway',
    shortName: 'Open Nephrectomy',
    subtitle: 'Adult open simple/radical nephrectomy (POD 0 to POD 5)',
    pdfUrl: '/assets/aistudio/Open_nephrectomy_postoperative_orders_d7c379e3.pdf',
    expectedStayDays: 'POD 4–5 Target Discharge',
    urgentEscalationText:
      'Urgent review: bleeding/increasing drain output, falling Hb, hypotension, fever/rigors, low/no urine, rising creatinine/K, severe abdominal pain/distension or vomiting. Emergency response for chest pain, hypoxia, dyspnoea, collapse or confusion.',
    defaultDischargeAdvice:
      'Keep surgical wound clean and dry; avoid heavy lifting or straining for 6 weeks; maintain adequate hydration; avoid unreviewed over-the-counter NSAIDs; adhere to BP and long-term renal monitoring plan.',
    defaultReturnWarnings:
      'Return urgently for fever, wound discharge/redness, severe pain, vomiting, low urine output or leg swelling. Emergency care for chest pain, dyspnoea or collapse.',
    stages: [
      {
        id: 'open-pod0',
        dayTag: 'POD 0',
        title: 'Immediate Postoperative Care & Prescribing',
        fields: [
          { key: 'side', label: 'Side', options: ['Right', 'Left'] },
          { key: 'type', label: 'Type', options: ['Simple', 'Radical'] },
          { key: 'indication', label: 'Indication', placeholder: 'e.g. Renal mass / Pyonephrosis' },
          { key: 'bloodLoss', label: 'Blood loss (mL)', placeholder: 'e.g. 250 mL' },
          { key: 'transfusion', label: 'Transfusion', placeholder: 'e.g. Nil / 1 unit PRBC' },
          { key: 'drainTypeSite', label: 'Drain type / site', placeholder: 'e.g. 24Fr flank drain' },
          { key: 'catheterFr', label: 'Catheter (Fr)', placeholder: 'e.g. 16 Fr' },
          { key: 'lowUrineThreshold', label: 'Notify if UO below (mL/h for 3h)', placeholder: 'e.g. 30 mL/h' },
          { key: 'ivFluidOrder', label: 'IV fluid & rate (mL/h)', placeholder: 'e.g. RL at 100 mL/h' },
          { key: 'oralFluidLimit', label: 'Oral fluid limit (if needed)', placeholder: 'e.g. Nil / 1.5 L/day' },
          { key: 'dietOrder', label: 'Diet order', options: ['Oral sips/advance as tolerated', 'Nil by mouth'] },
          { key: 'bowelPlan', label: 'Diet review time & bowel plan', placeholder: 'Surgeon-specific feeding plan' },
        ],
        items: [
          {
            id: 'open-p0-obs',
            text: 'Recovery monitoring per anaesthesia protocol; ward BP, pulse, RR, SpO2, temperature, pain and consciousness every 2 hours.',
          },
          {
            id: 'open-p0-uo',
            text: 'Urine output hourly initially, then every 3 hr if stable. Chart intake and separate drain output/character; review balance each shift.',
          },
          {
            id: 'open-p0-labs',
            text: 'CBC/Hb, creatinine and electrolytes timing scheduled and reviewed.',
          },
          {
            id: 'open-p0-low-uo',
            text: 'Low urine: check catheter, circulation and volume status; review before repeated fluid boluses.',
          },
          {
            id: 'open-p0-iv',
            text: 'Review IV needs daily against oral intake, losses, renal function and fluid overload; adjust drugs for renal function and avoid nephrotoxins.',
          },
          {
            id: 'open-p0-resp',
            text: 'Head-up if tolerated; deep breathing/supported cough, physiotherapy as needed; mobilise POD 1.',
          },
          {
            id: 'open-p0-vte',
            text: 'Assess VTE/bleeding risk; mechanical prophylaxis until mobile.',
          },
          {
            id: 'open-p0-epi',
            text: 'Coordinate anticoagulants with epidural procedures.',
            critical: true,
          },
        ],
      },
      {
        id: 'open-pod1',
        dayTag: 'POD 1',
        title: 'POD 1 Checklist',
        fields: [
          { key: 'pod1Deviation', label: 'Deviation and reason (if any)', placeholder: 'Document any deviation' },
        ],
        items: [
          {
            id: 'open-p1-obs',
            text: 'Review observations, Hb/renal function, fluid balance, pain, wound and drain output.',
          },
          {
            id: 'open-p1-mob',
            text: 'Out of bed with assistance; continue breathing exercises and VTE prevention.',
          },
          {
            id: 'open-p1-diet',
            text: 'Review oral intake/need for NBM and IV fluids; follow the individual feeding order.',
          },
        ],
      },
      {
        id: 'open-pod2',
        dayTag: 'POD 2',
        title: 'POD 2 Wound & Drain Review',
        items: [
          {
            id: 'open-p2-diet',
            text: 'Oral sips/liquid diet if tolerated and authorised; may already have advanced earlier.',
          },
          {
            id: 'open-p2-wound',
            text: 'Check wound/dressing; change if indicated using local aseptic wound-care protocol.',
          },
          {
            id: 'open-p2-drain',
            text: 'Remove drain if <50 mL over 24 hours, reassuring character and no suspected bleeding/leak.',
          },
        ],
      },
      {
        id: 'open-pod3',
        dayTag: 'POD 3',
        title: 'POD 3 Catheter Removal & Soft Diet',
        fields: [
          { key: 'catheterRemovalTime', label: 'Removal time', placeholder: 'e.g. 08:30 AM' },
          { key: 'voidTime', label: 'Void time', placeholder: 'e.g. 11:45 AM' },
          { key: 'voidVolumeMl', label: 'Void volume (mL)', placeholder: 'e.g. 240 mL' },
          { key: 'catheterRetainedReason', label: 'If catheter retained: reason/plan', placeholder: 'Reason / next review' },
        ],
        items: [
          {
            id: 'open-p3-cath',
            text: 'Remove catheter if authorised; check monitoring/epidural needs and confirm comfortable voiding (review if no void by 6 hours, sooner if pain).',
          },
          {
            id: 'open-p3-diet',
            text: 'Soft diet as tolerated after bowel review; reduce IV fluids as intake improves; switch to oral analgesia.',
          },
        ],
      },
      {
        id: 'open-pod45',
        dayTag: 'POD 4–5',
        title: 'POD 4 & POD 5 Target Discharge',
        fields: [
          { key: 'flatus', label: 'Flatus passed', options: ['Yes', 'No'] },
          { key: 'stool', label: 'Stool passed', options: ['Yes', 'No'] },
          { key: 'extendedStayReason', label: 'If stay extended: reason/review', placeholder: 'Document reason' },
        ],
        items: [
          {
            id: 'open-p45-diet',
            text: 'Full diet as tolerated; stop IV fluids when intake, renal function and volume status permit.',
          },
          {
            id: 'open-p45-wound',
            text: 'Check/change dressing as indicated. Review flatus/stool and exclude ileus or obstruction.',
          },
          {
            id: 'open-p45-target',
            text: 'Target discharge POD 4 or 5; bowel recovery assessed.',
          },
        ],
      },
      {
        id: 'open-discharge',
        dayTag: 'Discharge',
        title: 'Discharge Readiness & Follow-up',
        fields: [
          { key: 'bloodThinnerPlan', label: 'Blood-thinner plan / responsible clinician', placeholder: 'Agent, restart date' },
          { key: 'bpRenalPlan', label: 'BP / long-term renal monitoring plan', placeholder: 'Follow-up labs/BP' },
          { key: 'woundReviewPlan', label: 'Wound review / suture or clip removal', placeholder: 'Date & location' },
          { key: 'retainedDrainPlan', label: 'Retained drain/catheter care plan', placeholder: 'If applicable' },
        ],
        items: [
          {
            id: 'open-d-obs',
            text: 'Stable observations; no untreated infection/bleeding; renal function/electrolytes reviewed.',
          },
          {
            id: 'open-d-func',
            text: 'Eating/drinking, oral pain control, mobility and voiding satisfactory; no significant vomiting/distension; wound/drain care arranged.',
          },
          {
            id: 'open-d-meds',
            text: 'Medicines/renal doses reviewed; blood-thinner restart agreed; VTE duration/teaching checked.',
          },
          {
            id: 'open-d-advice',
            text: 'Give wound/activity/driving/fluid advice; avoid unreviewed over-the-counter NSAIDs.',
          },
          {
            id: 'open-d-return',
            text: 'Urgent return precautions explained (fever, wound discharge/redness, pain, vomiting, low urine, leg swelling; emergency care for chest pain/dyspnoea/collapse).',
          },
          {
            id: 'open-d-hpe',
            text: 'Specimen sent for HPE.',
          },
        ],
      },
    ],
  },
  {
    id: 'pcnl',
    name: 'PCNL Postoperative Pathway',
    shortName: 'PCNL',
    subtitle: 'Percutaneous nephrolithotomy immediate orders & POD 1–2 recovery',
    pdfUrl: '/assets/aistudio/PCNL_postoperative_protocol_1c5eb9cf.pdf',
    expectedStayDays: 'POD 2 Target Discharge',
    urgentEscalationText:
      'Urgent review: heavy bleeding/clots, falling Hb, flank pain/swelling, fever/rigors, low urine output, blocked drainage or marked leakage. Emergency response for circulatory deterioration, confusion, chest pain, breathlessness or hypoxia. Consider haemorrhage, sepsis, obstruction or thoracic injury; activate sepsis pathway promptly without waiting for cultures.',
    defaultDischargeAdvice:
      'Avoid sleeping on the operated side for 1 week; keep flank puncture site clean and dry; drink plenty of oral fluids (2.5–3 L/day unless restricted); follow activity limits, antibiotic course, and DJ stent removal/review schedule.',
    defaultReturnWarnings:
      'Return urgently for heavy/recurrent bleeding, clots, fever/rigors, flank pain/swelling, vomiting, low urine/retention or persistent flank leak. Emergency care for collapse, dyspnoea or chest pain.',
    stages: [
      {
        id: 'pcnl-pod0',
        dayTag: 'POD 0',
        title: 'Operative Handover, Drainage & Immediate Orders',
        fields: [
          { key: 'side', label: 'Side', options: ['Right', 'Left', 'Bilateral'] },
          { key: 'technique', label: 'Technique', options: ['Standard', 'Mini'] },
          { key: 'tracts', label: 'Number of tracts', placeholder: 'e.g. Single / 2 tracts' },
          { key: 'access', label: 'Access', options: ['Subcostal', 'Supracostal'] },
          { key: 'clearance', label: 'Clearance', options: ['Visually complete', 'Residual stone', 'Staged procedure planned'] },
          { key: 'nephrostomy', label: 'Nephrostomy', options: ['None', 'Present'] },
          { key: 'nephrostomyDetails', label: 'Nephrostomy side/type/size', placeholder: 'e.g. Right 14Fr Malecot' },
          { key: 'nephrostomyState', label: 'Nephrostomy state', options: ['Free drainage', 'Clamped'] },
          { key: 'catheterFr', label: 'Urethral catheter (Fr)', placeholder: 'e.g. 16 Fr' },
          { key: 'djStent', label: 'DJ stent', options: ['None', 'Right', 'Left', 'Bilateral'] },
          { key: 'ivFluidOrder', label: 'IV fluid / rate / review-stop', placeholder: 'e.g. NS at 100 mL/h' },
          { key: 'alphaBlocker', label: 'Alpha-blocker', options: ['Indicated for stent symptoms/fragments', 'Not indicated'] },
          { key: 'alphaBlockerRegimen', label: 'Alpha-blocker agent/dose/duration', placeholder: 'e.g. Tamsulosin 0.4 mg HS x 14d' },
        ],
        items: [
          {
            id: 'pcnl-p0-obs',
            text: 'Recovery observations per anaesthesia protocol; ward BP, pulse, RR, SpO2, temperature, pain and consciousness.',
          },
          {
            id: 'pcnl-p0-uo',
            text: 'Record intake and each urinary output; urine volumes. Check clots, patency, leakage and flank swelling.',
          },
          {
            id: 'pcnl-p0-labs',
            text: 'CBC/Hb and creatinine/electrolytes checked.',
          },
          {
            id: 'pcnl-p0-cxr',
            text: 'Chest imaging if indicated (e.g. respiratory signs or supracostal access).',
          },
          {
            id: 'pcnl-p0-diet',
            text: 'Oral fluids/diet once recovered from anaesthesia; advance as tolerated.',
          },
          {
            id: 'pcnl-p0-mob',
            text: 'Mobilise with assistance on POD 1 if stable.',
          },
          {
            id: 'pcnl-p0-cult',
            text: 'Review available urine/renal-pelvic/stone cultures; tailor treatment and track pending results (do not extend prophylaxis solely for nephrostomy/DJ stent).',
          },
        ],
      },
      {
        id: 'pcnl-pod1',
        dayTag: 'POD 1',
        title: 'POD 1 Mobilisation & PCN Drain Review',
        fields: [
          { key: 'pcnRetainedReason', label: 'If PCN retained: reason & next review', placeholder: 'Reason / next review date' },
        ],
        items: [
          {
            id: 'pcnl-p1-obs',
            text: 'Review observations, urine, Hb/renal function, wound and pain; mobilise if stable.',
          },
          {
            id: 'pcnl-p1-remove',
            text: 'Remove PCN only if stable, no major bleeding/untreated infection, adequate drainage, and no need to retain access for a second look (surgeon to authorise).',
          },
          {
            id: 'pcnl-p1-leak',
            text: 'Assess leakage/obstruction concerns.',
          },
          {
            id: 'pcnl-p1-dress',
            text: 'Dress site; monitor urine, pain and leakage. Escalate persistent/high-volume leak, fever or pain.',
          },
        ],
      },
      {
        id: 'pcnl-pod2',
        dayTag: 'POD 2',
        title: 'POD 2 Urethral Catheter Removal',
        fields: [
          { key: 'catheterRemovalTime', label: 'Removal time', placeholder: 'e.g. 08:00 AM' },
          { key: 'voidTime', label: 'Void time', placeholder: 'e.g. 10:30 AM' },
          { key: 'voidVolumeMl', label: 'Void volume (mL)', placeholder: 'e.g. 250 mL' },
          { key: 'catheterRetainedReason', label: 'If retained: reason & next review plan', placeholder: 'Reason / review date' },
        ],
        items: [
          {
            id: 'pcnl-p2-cath',
            text: 'Remove urethral catheter if authorized; confirm comfortable voiding (review if no void by 6 hours, sooner if discomfort).',
          },
        ],
      },
      {
        id: 'pcnl-discharge',
        dayTag: 'Discharge',
        title: 'Discharge Readiness, Stone Clearance & DJ Stent Tracking',
        fields: [
          { key: 'bloodThinnerPlan', label: 'Blood-thinner restart plan / prescriber', placeholder: 'Agent, restart date, prescriber' },
          { key: 'stagedProcedure', label: 'Staged procedure needed', options: ['No', 'Yes'] },
          { key: 'nextProcedurePlan', label: 'Reason / next procedure & target date', placeholder: 'If staged' },
          { key: 'stoneAnalysis', label: 'Stone analysis', options: ['Sent', 'No'] },
          { key: 'cultureResults', label: 'Culture results', placeholder: 'Pending / Sterile / Organism' },
          { key: 'djStentSideSize', label: 'DJ stent side & size/length', placeholder: 'e.g. Right 5Fr 26cm' },
          { key: 'djStentAction', label: 'DJ stent planned action', options: ['Remove', 'Exchange', 'At next procedure', 'No stent'] },
          { key: 'djStentTargetDate', label: 'DJ stent target date', placeholder: 'YYYY-MM-DD or 2–4 weeks' },
        ],
        items: [
          {
            id: 'pcnl-d-stable',
            text: 'Stable, afebrile, no major bleeding; Hb/renal function acceptable; oral symptom control, intake and mobility satisfactory.',
          },
          {
            id: 'pcnl-d-void',
            text: 'Voiding and wound/drainage acceptable; ongoing leak or retained tube has a care/review plan.',
          },
          {
            id: 'pcnl-d-meds',
            text: 'Medicines reconciled, including alpha-blocker decision and antibiotic indication/duration.',
          },
          {
            id: 'pcnl-d-advice',
            text: 'Surgeon advice given: avoid sleeping on operated side for 1 week; wound care, fluids, activity limits and anaesthetic precautions explained.',
          },
          {
            id: 'pcnl-d-return',
            text: 'Written return advice provided (heavy/recurrent bleeding, clots, fever/rigors, flank pain/swelling, vomiting, low urine/retention, persistent leak; emergency care for collapse/dyspnoea/chest pain).',
          },
          {
            id: 'pcnl-d-metabolic',
            text: 'Stone-prevention advice and metabolic evaluation planned where indicated.',
          },
          {
            id: 'pcnl-d-understanding',
            text: 'DJ stent / retained tube plan & patient/carer understanding checked and discharge authorised.',
          },
        ],
      },
    ],
  },
  {
    id: 'turp',
    name: 'TURP Postoperative Pathway',
    shortName: 'TURP',
    subtitle: 'Department of Urology — 4-Day TURP CBI & Trial Without Catheter Pathway',
    pdfUrl: '/assets/aistudio/TURP_postoperative_protocol_27f601f3.pdf',
    expectedStayDays: 'POD 4 Target Discharge (TWOC)',
    urgentEscalationText:
      'Urgent review for fresh heavy bleeding/clots, painful distension or blocked drainage, persistently low net urine output, fever/rigors, haemodynamic deterioration, new confusion, breathlessness or hypoxia. Consider bleeding, sepsis, fluid overload or TUR syndrome. If drainage stops or is less than irrigant infused: STOP irrigation inflow immediately, check for kinks, and seek urgent urology review.',
    defaultDischargeAdvice:
      'Maintain recommended oral fluid intake; avoid straining during stools (use stool softeners as prescribed) and avoid heavy lifting/cycling for 4 weeks; mild transient urinary frequency or intermittent pink staining can occur; review histopathology (HPE) report at 15 days.',
    defaultReturnWarnings:
      'Return urgently for inability to void, blocked catheter, heavy bleeding or clots, fever/rigors or worsening pain. Emergency care for chest pain, breathlessness or collapse.',
    stages: [
      {
        id: 'turp-pod0',
        dayTag: 'POD 0',
        title: 'Immediate Postoperative Orders & CBI Setup',
        fields: [
          { key: 'technique', label: 'Technique', options: ['Bipolar', 'Monopolar'] },
          { key: 'anaesthesia', label: 'Anaesthesia', placeholder: 'e.g. Spinal Anaesthesia' },
          { key: 'concerns', label: 'Operative concerns', placeholder: 'e.g. Nil / Capsular perforation' },
          { key: 'catheterFr', label: 'Three-way catheter (Fr)', placeholder: 'e.g. 22 Fr 3-way' },
          { key: 'balloonVolMl', label: 'Balloon volume at handover (mL)', placeholder: 'e.g. 30 mL' },
          { key: 'traction', label: 'Traction applied', options: ['Yes', 'No'] },
          { key: 'tractionReleasePlan', label: 'Traction review/release plan', placeholder: 'POD 1 or specific time' },
          { key: 'ivFluidOrder', label: 'IV fluid / rate / restriction', placeholder: 'e.g. NS at 80 mL/h' },
          { key: 'vtePlan', label: 'VTE prevention plan', placeholder: 'Mechanical / review date' },
        ],
        items: [
          {
            id: 'turp-p0-obs',
            text: 'Recovery observations per anaesthesia protocol; ward BP, pulse, RR, SpO2, temperature, pain and consciousness.',
          },
          {
            id: 'turp-p0-cbi-io',
            text: 'Record irrigation input, total catheter drainage and net urine output hourly during CBI (Net UO = total drainage − irrigation instilled).',
            critical: true,
          },
          {
            id: 'turp-p0-patency',
            text: 'Check urine colour, clots, catheter patency and suprapubic discomfort with each assessment; maintain closed drainage below bladder.',
          },
          {
            id: 'turp-p0-labs',
            text: 'Blood tests checked: Hb/CBC and Na/K/creatinine.',
          },
          {
            id: 'turp-p0-cbi-saline',
            text: 'CBI running with sterile 0.9% saline by gravity; titrate to clear or light-pink, clot-free drainage with unobstructed outflow.',
          },
          {
            id: 'turp-p0-traction',
            text: 'Traction only as documented by surgeon; review/release plan documented.',
          },
          {
            id: 'turp-p0-diet',
            text: 'Oral fluids/diet when awake and cleared after anaesthesia; advance as tolerated.',
          },
          {
            id: 'turp-p0-mob',
            text: 'Mobilise with assistance once anaesthesia resolved and traction released (target out of bed on POD 1); falls & VTE risk assessed.',
          },
        ],
      },
      {
        id: 'turp-pod1',
        dayTag: 'POD 1',
        title: 'POD 1 Traction Release & Balloon Adjustment',
        items: [
          {
            id: 'turp-p1-review',
            text: 'Review haematuria, observations, fluid balance, pain and available blood results.',
          },
          {
            id: 'turp-p1-traction',
            text: 'Remove traction/strapping if haemostasis satisfactory and surgeon authorises; resecure catheter without traction.',
          },
          {
            id: 'turp-p1-balloon',
            text: 'Balloon adjustment only on explicit surgeon order and within catheter specifications (target remaining volume 10 mL).',
          },
          {
            id: 'turp-p1-mob',
            text: 'Mobilise out of bed with assistance. Continue/titrate CBI according to drainage.',
          },
        ],
      },
      {
        id: 'turp-pod23',
        dayTag: 'POD 2–3',
        title: 'POD 2 Reduce CBI & POD 3 Stop CBI',
        items: [
          {
            id: 'turp-p2-cbi',
            text: 'POD 2: Reduce CBI if clear/light pink, clot-free and draining freely.',
          },
          {
            id: 'turp-p3-stop',
            text: 'POD 3: Stop CBI after surgeon review if urine remains satisfactory on low-flow irrigation and no clots; leave catheter on free drainage.',
          },
          {
            id: 'turp-p3-rebleed',
            text: 'Confirmed no recurrent bleeding/clots off CBI (if clots recur, assess patency and contact urology).',
          },
        ],
      },
      {
        id: 'turp-pod4',
        dayTag: 'POD 4 (TWOC)',
        title: 'POD 4 & Trial Without Catheter',
        fields: [
          { key: 'catheterRemovalDateTime', label: 'Catheter removal date/time', placeholder: 'e.g. POD 4, 08:00 AM' },
          { key: 'void1', label: 'Void 1 time & volume (mL)', placeholder: 'e.g. 10:30 AM · 220 mL' },
          { key: 'void2', label: 'Void 2 time & volume (mL)', placeholder: 'e.g. 01:15 PM · 260 mL' },
          { key: 'pvrMl', label: 'Post-void residual PVR (mL)', placeholder: 'e.g. 35 mL' },
          { key: 'failedVoidPlan', label: 'If voiding trial fails: catheter/repeat-trial plan', placeholder: 'Document plan if failed' },
        ],
        items: [
          {
            id: 'turp-p4-remove',
            text: 'Remove catheter if urine remains clear off CBI, no fresh haematuria/clot retention, and surgeon authorises.',
          },
          {
            id: 'turp-p4-void',
            text: 'Record voids (Void 1 & Void 2) and bladder-scan PVR; confirm adequate emptying (review if no void by 6 hours, earlier if discomfort).',
          },
          {
            id: 'turp-p4-fail',
            text: 'Voiding trial outcome documented (or urology review & catheter/repeat-trial plan recorded if failed).',
          },
        ],
      },
      {
        id: 'turp-discharge',
        dayTag: 'Discharge',
        title: 'Discharge Readiness & 15-Day HPE Follow-up',
        fields: [
          { key: 'bloodThinnerPlan', label: 'Blood-thinner restart plan (agent/dose/date)', placeholder: 'Agreed with prescriber & urologist' },
          { key: 'responsibleClinician', label: 'Responsible clinician / contact', placeholder: 'Clinician name/phone' },
          { key: 'hpeFollowupDate', label: 'HPE review follow-up at 15 days', placeholder: 'Date / OPD slot' },
          { key: 'emergencyContact', label: 'Patient emergency contact number given', placeholder: 'Hospital emergency number' },
        ],
        items: [
          {
            id: 'turp-d-obs',
            text: 'Stable observations; afebrile; pain controlled with oral treatment; drinking/eating and mobilising safely; no fresh significant haematuria or clots.',
          },
          {
            id: 'turp-d-void',
            text: 'Satisfactory voiding and emptying documented, or explicit discharge-with-catheter plan, catheter-care teaching and removal appointment provided.',
          },
          {
            id: 'turp-d-meds',
            text: 'Medication reconciliation completed, including whether prostate medicines continue.',
          },
          {
            id: 'turp-d-thinner',
            text: 'Blood-thinner restart agreed with treating prescriber and urologist.',
          },
          {
            id: 'turp-d-advice',
            text: 'Explained fluid intake limits, activity/straining precautions, and expected transient urinary symptoms or mild intermittent blood staining.',
          },
          {
            id: 'turp-d-return',
            text: 'Urgent return advice explained (inability to void, blocked catheter, heavy bleeding/clots, fever/rigors, worsening pain; emergency care for chest pain/breathlessness/collapse).',
          },
          {
            id: 'turp-d-hpe',
            text: 'Histopathology specimen sent; 15-day HPE follow-up scheduled & discharge authorised.',
          },
        ],
      },
    ],
  },
  {
    id: 'ursl',
    name: 'URSL Postoperative Pathway',
    shortName: 'URSL',
    subtitle: 'Ureteroscopic lithotripsy immediate orders & POD 1 discharge pathway',
    pdfUrl: '/assets/aistudio/URSL_postoperative_protocol_332d0696.pdf',
    expectedStayDays: 'POD 1 Target Discharge',
    urgentEscalationText:
      'Urgent review: fever/rigors, worsening flank pain, vomiting, heavy bleeding/clots, retention, low urine output or blocked catheter. Emergency response for confusion, hypotension, breathlessness or instability. Suspected sepsis: activate local pathway immediately; cultures must not delay treatment; assess for ureteric obstruction (a bladder catheter does NOT relieve ureteric obstruction).',
    defaultDischargeAdvice:
      'Mild dysuria, urinary frequency, mild pink haematuria and DJ stent discomfort are expected; maintain generous oral fluid intake (2.5–3 L/day); avoid strenuous activity; remember DJ stent requires scheduled removal.',
    defaultReturnWarnings:
      'Return urgently for fever/rigors, worsening flank pain, vomiting, urinary retention, low urine output or heavy bleeding/clots. Seek emergency care for collapse or severe illness.',
    stages: [
      {
        id: 'ursl-pod0',
        dayTag: 'POD 0',
        title: 'Operative Handover, Recovery & Culture Review',
        fields: [
          { key: 'side', label: 'Side', options: ['Right', 'Left', 'Bilateral'] },
          { key: 'stoneSiteSize', label: 'Stone site / size', placeholder: 'e.g. Left lower ureteric 11 mm' },
          { key: 'clearance', label: 'Clearance', options: ['Visually complete', 'Residual stone', 'Staged procedure planned'] },
          { key: 'operativeConcerns', label: 'Ureteric injury / impacted stone concerns', placeholder: 'e.g. Mild mucosal oedema at impacted site' },
          { key: 'djStent', label: 'DJ stent', options: ['None', 'Right', 'Left', 'Bilateral'] },
          { key: 'catheter', label: 'Urethral catheter', options: ['No', 'Yes'] },
          { key: 'catheterFr', label: 'Catheter size (Fr)', placeholder: 'e.g. 16 Fr' },
          { key: 'ivFluidOrder', label: 'IV fluid / rate / stop', placeholder: 'e.g. RL at 100 mL/h' },
          { key: 'alphaBlocker', label: 'Alpha-blocker', options: ['Prescribed for stent symptoms/fragment passage', 'Not indicated'] },
          { key: 'alphaBlockerRegimen', label: 'Agent / dose / frequency / duration', placeholder: 'e.g. Tamsulosin 0.4 mg HS x 14d' },
          { key: 'urineCultureDate', label: 'Urine culture date', placeholder: 'YYYY-MM-DD' },
          { key: 'urineCultureResult', label: 'Urine culture result', options: ['Negative', 'Positive', 'Pending', 'Not available'] },
        ],
        items: [
          {
            id: 'ursl-p0-obs',
            text: 'Recovery observations per anaesthesia protocol; ward BP, pulse, RR, SpO2, temperature, pain and consciousness.',
          },
          {
            id: 'ursl-p0-uo',
            text: 'Record intake, urine output/colour regularly; assess drainage, pain and nausea.',
          },
          {
            id: 'ursl-p0-diet',
            text: 'Oral fluids and diet once awake and cleared after anaesthesia; advance as tolerated.',
          },
          {
            id: 'ursl-p0-mob',
            text: 'Mobilise when recovered from anaesthesia.',
          },
          {
            id: 'ursl-p0-labs',
            text: 'Tests ordered if indicated (CBC, Creatinine/electrolytes, or other).',
          },
          {
            id: 'ursl-p0-cult',
            text: 'Review urine cultures and tailor antibiotics to susceptibilities; track pending results (do not routinely extend prophylaxis solely for DJ stent).',
          },
        ],
      },
      {
        id: 'ursl-pod1',
        dayTag: 'POD 1',
        title: 'POD 1 Catheter Removal & Voiding Check',
        fields: [
          { key: 'retainedReason', label: 'If catheter retained: reason', options: ['Not retained', 'Fever/infection requiring review', 'Haematuria', 'Retention/monitoring', 'Other'] },
          { key: 'retainedNextReview', label: 'Specific indication & next review', placeholder: 'If retained' },
          { key: 'voidTime', label: 'Void time', placeholder: 'e.g. 10:15 AM' },
          { key: 'voidVolumeMl', label: 'Void volume (mL)', placeholder: 'e.g. 240 mL' },
          { key: 'pvrMl', label: 'PVR if indicated (mL)', placeholder: 'e.g. 25 mL' },
          { key: 'failedVoidPlan', label: 'Failed-voiding plan (if no void by 6h)', placeholder: 'Document plan if needed' },
        ],
        items: [
          {
            id: 'ursl-p1-obs',
            text: 'Review observations, pain, urine output/colour and relevant results before discharge.',
          },
          {
            id: 'ursl-p1-cath',
            text: 'Remove urethral catheter on POD 1 if appropriate and authorised (DJ stent remains in place).',
          },
          {
            id: 'ursl-p1-void',
            text: 'Confirm comfortable voiding (review if no void by 6 hours, sooner if discomfort).',
          },
        ],
      },
      {
        id: 'ursl-discharge',
        dayTag: 'Discharge',
        title: 'Discharge Readiness, DJ Stent Tracking & Stone Follow-up',
        fields: [
          { key: 'catheterDischargePlan', label: 'If discharged with catheter: care/removal appt', placeholder: 'If applicable' },
          { key: 'bloodThinnerPlan', label: 'Blood-thinner plan / responsible prescriber', placeholder: 'If applicable' },
          { key: 'djStentSideSize', label: 'DJ stent side & size/length', placeholder: 'e.g. Left 5Fr 26cm' },
          { key: 'djStentAction', label: 'DJ stent planned action', options: ['Removal', 'Exchange', 'At next procedure', 'No stent'] },
          { key: 'djStentTargetDate', label: 'DJ stent target removal date', placeholder: 'e.g. After 2 weeks' },
          { key: 'stagedProcedure', label: 'Staged procedure', options: ['No', 'Yes'] },
          { key: 'nextProcedurePlan', label: 'Next procedure & target date', placeholder: 'If staged' },
          { key: 'stoneAnalysis', label: 'Stone analysis', options: ['Sent', 'No fragment available', 'Other'] },
        ],
        items: [
          {
            id: 'ursl-d-stable',
            text: 'Stable, afebrile, no untreated infection; pain/nausea controlled; eating/drinking and mobile.',
          },
          {
            id: 'ursl-d-urine',
            text: 'Clear urine and satisfactory voiding; clinician review of mild staining; no heavy bleeding/clots.',
          },
          {
            id: 'ursl-d-meds',
            text: 'Medicines reconciled; alpha-blocker decision and antibiotic indication/duration recorded.',
          },
          {
            id: 'ursl-d-stent-reg',
            text: 'DJ stent registered for tracking; written date/contact given and explained that DJ stent needs separate removal.',
            critical: true,
          },
          {
            id: 'ursl-d-advice',
            text: 'Explained dysuria, frequency, mild haematuria and stent discomfort; fluid/activity advice given.',
          },
          {
            id: 'ursl-d-return',
            text: 'Written return advice given (fever/rigors, worsening flank pain, vomiting, retention, low urine output, heavy bleeding/clots; emergency care for collapse/severe illness) & patient/carer understanding checked.',
          },
        ],
      },
    ],
  },
];

export const SURGICAL_PROTOCOLS_CHANGED_EVENT = 'medtranscribe_surgical_protocols_changed';

const CUSTOM_PROTOCOLS_STORAGE_PREFIX = 'medtranscribe_custom_surgical_protocols_v1_';
const BUILTIN_PROTOCOL_IDS = new Set<string>(SURGICAL_PROTOCOLS.map((p) => p.id));

let runtimeCustomProtocols: SurgicalProtocolTemplate[] = [];
let runtimeDeletedProtocolIds: Set<string> = new Set();

export function isBuiltinProtocolId(id?: string): boolean {
  return Boolean(id && BUILTIN_PROTOCOL_IDS.has(id));
}

function slugifyProtocolToken(input: string, fallback: string, maxLen = 40): string {
  const cleaned = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, maxLen);
  return cleaned || fallback;
}

export function generateCustomProtocolId(name: string): string {
  const slug = slugifyProtocolToken(name, 'protocol', 36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `custom-${slug}-${rand}`;
}

export function sanitizeCustomSurgicalProtocol(
  raw: Partial<SurgicalProtocolTemplate> | null | undefined
): SurgicalProtocolTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim().slice(0, 140);
  if (!name) return null;

  let id = String(raw.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 75);
  if (!id) {
    id = generateCustomProtocolId(name);
  }
  const isBuiltinOverride = BUILTIN_PROTOCOL_IDS.has(id);

  const shortName =
    String(raw.shortName || '').trim().slice(0, 48) ||
    name.split(/\s+/).slice(0, 3).join(' ').slice(0, 32);
  const subtitle = String(raw.subtitle || '').trim().slice(0, 220);
  const expectedStayDays = String(raw.expectedStayDays || '').trim().slice(0, 80) || 'As per clinician';
  const urgentEscalationText = String(raw.urgentEscalationText || '').trim().slice(0, 1500);
  const defaultDischargeAdvice = String(raw.defaultDischargeAdvice || '').trim().slice(0, 1500);
  const defaultReturnWarnings = String(raw.defaultReturnWarnings || '').trim().slice(0, 1500);
  const sourceFileName = raw.sourceFileName
    ? String(raw.sourceFileName).trim().slice(0, 180)
    : undefined;
  const rawPdfUrl = typeof raw.pdfUrl === 'string' ? raw.pdfUrl.trim().slice(0, 300) : '';
  const safePdfUrl =
    rawPdfUrl &&
    (rawPdfUrl.startsWith('/assets/') ||
      rawPdfUrl.startsWith('/api/surgical-protocols/') ||
      rawPdfUrl.startsWith('https://'))
      ? rawPdfUrl
      : undefined;
  const safeSourceAssets: ProtocolSourceAsset[] = Array.isArray(raw.sourceAssets)
    ? raw.sourceAssets
        .slice(0, 10)
        .map((a) => {
          const url = typeof a?.url === 'string' ? a.url.trim().slice(0, 300) : '';
          if (
            !url ||
            !(
              url.startsWith('/assets/') ||
              url.startsWith('/api/surgical-protocols/') ||
              url.startsWith('data:image/') ||
              url.startsWith('data:application/pdf')
            )
          ) {
            return null;
          }
          return {
            name: String(a?.name || 'Protocol file').trim().slice(0, 140),
            mimeType: String(a?.mimeType || 'application/pdf').trim().slice(0, 80),
            url,
          };
        })
        .filter((x): x is ProtocolSourceAsset => Boolean(x))
    : [];

  const rawStages = Array.isArray(raw.stages) ? raw.stages : [];
  const usedStageIds = new Set<string>();
  const usedItemIds = new Set<string>();

  const stages: ProtocolStage[] = rawStages
    .slice(0, 24)
    .map((st, sIdx) => {
      const dayTag = String(st?.dayTag || `Stage ${sIdx + 1}`).trim().slice(0, 48) || `Stage ${sIdx + 1}`;
      const title = String(st?.title || dayTag).trim().slice(0, 140) || dayTag;
      const stSubtitle = st?.subtitle ? String(st.subtitle).trim().slice(0, 200) : undefined;

      let stageId = slugifyProtocolToken(st?.id || `${id}-s${sIdx + 1}-${dayTag}`, `stage-${sIdx + 1}`, 48);
      if (usedStageIds.has(stageId)) stageId = `${stageId}-${sIdx + 1}`;
      usedStageIds.add(stageId);

      const usedFieldKeys = new Set<string>();
      const fields: ProtocolFieldDef[] = Array.isArray(st?.fields)
        ? st.fields
            .slice(0, 30)
            .map((f, fIdx) => {
              const label = String(f?.label || '').trim().slice(0, 100);
              if (!label) return null;
              let key = String(f?.key || '')
                .trim()
                .replace(/[^a-zA-Z0-9_-]/g, '')
                .slice(0, 48);
              if (!key) {
                key = slugifyProtocolToken(label, `field_${fIdx + 1}`, 40).replace(/-/g, '_');
              }
              if (usedFieldKeys.has(key)) key = `${key}_${fIdx + 1}`;
              usedFieldKeys.add(key);

              const options = Array.isArray(f?.options)
                ? f.options
                    .map((o) => String(o || '').trim().slice(0, 80))
                    .filter(Boolean)
                    .slice(0, 12)
                : undefined;

              const placeholder = f?.placeholder
                ? String(f.placeholder).trim().slice(0, 120)
                : undefined;

              return {
                key,
                label,
                ...(placeholder ? { placeholder } : {}),
                ...(options && options.length > 0 ? { options } : {}),
              } as ProtocolFieldDef;
            })
            .filter((x): x is ProtocolFieldDef => Boolean(x))
        : [];

      const items: ProtocolCheckItem[] = Array.isArray(st?.items)
        ? st.items
            .slice(0, 60)
            .map((it, iIdx) => {
              const text = String(it?.text || '').trim().slice(0, 500);
              if (!text) return null;
              let itemId = slugifyProtocolToken(
                it?.id || `${stageId}-i${iIdx + 1}`,
                `${stageId}-i${iIdx + 1}`,
                56
              );
              if (usedItemIds.has(itemId)) itemId = `${itemId}-${iIdx + 1}`;
              usedItemIds.add(itemId);
              return {
                id: itemId,
                text,
                ...(it?.critical ? { critical: true } : {}),
              } as ProtocolCheckItem;
            })
            .filter((x): x is ProtocolCheckItem => Boolean(x))
        : [];

      return {
        id: stageId,
        dayTag,
        title,
        ...(stSubtitle ? { subtitle: stSubtitle } : {}),
        ...(fields.length > 0 ? { fields } : {}),
        items,
      } as ProtocolStage;
    })
    .filter((st) => st.items.length > 0 || (st.fields && st.fields.length > 0));

  if (stages.length === 0) return null;

  const now = Date.now();
  return {
    id,
    name,
    shortName,
    subtitle,
    ...(safePdfUrl ? { pdfUrl: safePdfUrl } : {}),
    ...(safeSourceAssets.length > 0 ? { sourceAssets: safeSourceAssets } : {}),
    expectedStayDays,
    urgentEscalationText,
    defaultDischargeAdvice,
    defaultReturnWarnings,
    stages,
    isCustom: !isBuiltinOverride,
    ...(sourceFileName ? { sourceFileName } : {}),
    createdAt: typeof raw.createdAt === 'number' && raw.createdAt > 0 ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' && raw.updatedAt > 0 ? raw.updatedAt : now,
  };
}

const CUSTOM_PROTOCOLS_DELETED_PREFIX = 'medtranscribe_custom_surgical_protocols_deleted_v1_';

export const DEFAULT_STARTER_CUSTOM_PROTOCOLS: SurgicalProtocolTemplate[] = [
  {
    id: 'custom-circumcision',
    name: 'Circumcision Postoperative Protocol',
    shortName: 'Circumcision',
    subtitle:
      'Adult / Adolescent day-care or overnight circumcision (Conventional / Dorsal slit / ZSR Stapler)',
    pdfUrl: '/assets/aistudio/Circumcision_postoperative_protocol.pdf',
    expectedStayDays: 'Day-Care / POD 0 Same-Day Discharge',
    urgentEscalationText:
      'Persistent brisk bleeding soaking through dressing, rapidly expanding penile/scrotal haematoma, glans dusky/cold ischaemia, acute urinary retention, fever >38°C, or purulent discharge.',
    defaultDischargeAdvice:
      'Keep wound clean and dry; gentle warm shower after 48 hours; apply prescribed ointment twice daily; wear snug supportive underwear; avoid heavy lifting, swimming, and sexual activity for 4–6 weeks.',
    defaultReturnWarnings:
      'Return urgently for active bleeding not stopping with gentle 10-minute gauze pressure, inability to pass urine, severe escalating pain, spreading redness, pus, or fever.',
    isCustom: true,
    sourceFileName: 'Circumcision_postoperative_protocol.pdf',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    stages: [
      {
        id: 'circ-pod0',
        dayTag: 'POD 0',
        title: 'Immediate Postoperative Care & Recovery',
        fields: [
          {
            key: 'technique',
            label: 'Technique',
            options: ['Conventional', 'ZSR Stapler', 'Laser'],
          },
          {
            key: 'anaesthesia',
            label: 'Anaesthesia',
            options: ['Local', 'Spinal', 'General'],
          },
          {
            key: 'dressingType',
            label: 'Dressing type',
            options: ['Paraffin gauze & light compression', 'Elastic bandage'],
          },
        ],
        items: [
          {
            id: 'circ-p0-vitals',
            text: 'Monitor vitals (BP, pulse, SpO2, pain score) per recovery protocol until stable.',
          },
          {
            id: 'circ-p0-bleed',
            text: 'Inspect penile dressing every 30 minutes for 2 hours for active bleeding, soaking, or expanding haematoma.',
            critical: true,
          },
          {
            id: 'circ-p0-glans',
            text: 'Confirm glans colour and perfusion remain pink and warm with no tight constriction.',
          },
          {
            id: 'circ-p0-void',
            text: 'Confirm spontaneous pain-free voiding prior to discharge.',
            critical: true,
          },
          {
            id: 'circ-p0-diet',
            text: 'Allow oral fluids and light diet once awake and nausea-free.',
          },
          {
            id: 'circ-p0-meds',
            text: 'Give first dose of oral analgesia and prescribed antibiotic / anti-inflammatory as ordered.',
          },
        ],
      },
      {
        id: 'circ-pod12',
        dayTag: 'POD 1–2',
        title: 'Dressing Removal & Home Wound Care',
        fields: [
          {
            key: 'removalPlan',
            label: 'Dressing removal plan',
            options: ['24 hours', '48 hours'],
          },
          {
            key: 'topicalOintment',
            label: 'Topical ointment',
            options: ['Mupirocin', 'Neosporin', 'Petroleum jelly'],
          },
        ],
        items: [
          {
            id: 'circ-p12-dress',
            text: 'Soak and gently remove outer dressing at 24–48 hours after surgery.',
          },
          {
            id: 'circ-p12-oint',
            text: 'Rinse gently with lukewarm water and pat dry; apply thin layer of prescribed ointment to suture/staple line.',
          },
          {
            id: 'circ-p12-support',
            text: 'Wear snug supportive underwear to minimize oedema and friction.',
          },
          {
            id: 'circ-p12-analgesia',
            text: 'Continue regular oral analgesia (Paracetamol / prescribed NSAID) for 3–5 days.',
          },
        ],
      },
      {
        id: 'circ-discharge',
        dayTag: 'Discharge',
        title: 'Discharge Readiness & Follow-Up',
        fields: [
          {
            key: 'followUpDate',
            label: 'Follow-up visit date',
            placeholder: 'e.g. After 7 days',
          },
          {
            key: 'suturePlan',
            label: 'Suture / Stapler ring plan',
            options: ['Absorbable sutures', 'ZSR silicon ring (drops off 10–14 days)'],
          },
        ],
        items: [
          {
            id: 'circ-d-stable',
            text: 'Confirm patient is hemodynamically stable, afebrile, dressing dry with no active oozing, and has voided comfortably.',
          },
          {
            id: 'circ-d-counsel',
            text: 'Counsel patient on expected mild bruising, swelling, and yellow fibrinous exudate during healing.',
          },
          {
            id: 'circ-d-activity',
            text: 'Advise to avoid strenuous exercise, swimming, and sexual activity for 4–6 weeks until complete healing.',
          },
          {
            id: 'circ-d-return',
            text: 'Ensure written return warnings explained and follow-up appointment scheduled.',
          },
        ],
      },
    ],
  },
];

function getCustomProtocolsStorageKey(doctorUid?: string): string {
  const safe = (doctorUid || 'guest').replace(/[^a-zA-Z0-9_-]/g, '');
  return `${CUSTOM_PROTOCOLS_STORAGE_PREFIX}${safe || 'guest'}`;
}

function getDeletedCustomProtocolsStorageKey(doctorUid?: string): string {
  const safe = (doctorUid || 'guest').replace(/[^a-zA-Z0-9_-]/g, '');
  return `${CUSTOM_PROTOCOLS_DELETED_PREFIX}${safe || 'guest'}`;
}

export function loadDeletedCustomProtocolIds(doctorUid?: string): Set<string> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return new Set();
    const raw = window.localStorage.getItem(getDeletedCustomProtocolsStorageKey(doctorUid));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((x) => typeof x === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

export function markCustomProtocolDeleted(protocolId: string, doctorUid?: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const set = loadDeletedCustomProtocolIds(doctorUid);
    set.add(protocolId);
    window.localStorage.setItem(
      getDeletedCustomProtocolsStorageKey(doctorUid),
      JSON.stringify(Array.from(set))
    );
  } catch {
    // ignore
  }
}

export function clearCustomProtocolDeleted(protocolId: string, doctorUid?: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const set = loadDeletedCustomProtocolIds(doctorUid);
    if (set.delete(protocolId)) {
      window.localStorage.setItem(
        getDeletedCustomProtocolsStorageKey(doctorUid),
        JSON.stringify(Array.from(set))
      );
    }
  } catch {
    // ignore
  }
}

export function loadCustomSurgicalProtocolsLocal(doctorUid?: string): SurgicalProtocolTemplate[] {
  const deletedIds = loadDeletedCustomProtocolIds(doctorUid);
  let stored: SurgicalProtocolTemplate[] = [];
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(getCustomProtocolsStorageKey(doctorUid));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          stored = parsed
            .map((item) => sanitizeCustomSurgicalProtocol(item))
            .filter((x): x is SurgicalProtocolTemplate => Boolean(x));
        }
      }
    }
  } catch {
    stored = [];
  }
  const starters = DEFAULT_STARTER_CUSTOM_PROTOCOLS.filter((p) => !deletedIds.has(p.id));
  return mergeCustomSurgicalProtocols(stored, starters, deletedIds);
}

export function saveCustomSurgicalProtocolsLocal(
  protocols: SurgicalProtocolTemplate[],
  doctorUid?: string
): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const cleaned = protocols
      .map((item) => sanitizeCustomSurgicalProtocol(item))
      .filter((x): x is SurgicalProtocolTemplate => Boolean(x));
    window.localStorage.setItem(getCustomProtocolsStorageKey(doctorUid), JSON.stringify(cleaned));
  } catch {
    // Ignore localStorage quota failures gracefully
  }
}

export function restoreDeletedBuiltinProtocolsLocal(doctorUid?: string): Set<string> {
  const set = loadDeletedCustomProtocolIds(doctorUid);
  for (const id of BUILTIN_PROTOCOL_IDS) {
    set.delete(id);
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        getDeletedCustomProtocolsStorageKey(doctorUid),
        JSON.stringify(Array.from(set))
      );
    }
  } catch {
    // ignore
  }
  return set;
}

export function setRuntimeCustomSurgicalProtocols(
  protocols: SurgicalProtocolTemplate[],
  deletedIds?: Set<string>
): void {
  const cleaned = protocols
    .map((item) => sanitizeCustomSurgicalProtocol(item))
    .filter((x): x is SurgicalProtocolTemplate => Boolean(x));
  runtimeCustomProtocols = cleaned;
  if (deletedIds) {
    runtimeDeletedProtocolIds = new Set(deletedIds);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SURGICAL_PROTOCOLS_CHANGED_EVENT));
  }
}

export function getCustomSurgicalProtocols(): SurgicalProtocolTemplate[] {
  return runtimeCustomProtocols;
}

export function getEffectiveSurgicalProtocols(
  customProtocols: SurgicalProtocolTemplate[] = runtimeCustomProtocols,
  deletedIds: Set<string> = runtimeDeletedProtocolIds
): SurgicalProtocolTemplate[] {
  const overrideMap = new Map<string, SurgicalProtocolTemplate>();
  const customOnly: SurgicalProtocolTemplate[] = [];

  for (const p of customProtocols || []) {
    if (!p || deletedIds.has(p.id)) continue;
    if (BUILTIN_PROTOCOL_IDS.has(p.id)) {
      overrideMap.set(p.id, p);
    } else {
      customOnly.push(p);
    }
  }

  const effectiveBuiltins: SurgicalProtocolTemplate[] = [];
  for (const bp of SURGICAL_PROTOCOLS) {
    if (deletedIds.has(bp.id)) continue;
    const ov = overrideMap.get(bp.id);
    if (ov) {
      effectiveBuiltins.push({
        ...ov,
        pdfUrl: ov.pdfUrl || bp.pdfUrl,
        isCustom: false,
      });
    } else {
      effectiveBuiltins.push(bp);
    }
  }

  return [...effectiveBuiltins, ...customOnly];
}

export function getAllSurgicalProtocols(): SurgicalProtocolTemplate[] {
  return getEffectiveSurgicalProtocols(runtimeCustomProtocols, runtimeDeletedProtocolIds);
}

export function mergeCustomSurgicalProtocols(
  primary: SurgicalProtocolTemplate[],
  secondary: SurgicalProtocolTemplate[],
  deletedIds?: Set<string>
): SurgicalProtocolTemplate[] {
  const map = new Map<string, SurgicalProtocolTemplate>();
  for (const list of [secondary, primary]) {
    for (const raw of list || []) {
      const p = sanitizeCustomSurgicalProtocol(raw);
      if (!p) continue;
      if (deletedIds?.has(p.id)) continue;
      const existing = map.get(p.id);
      if (!existing || (p.updatedAt || 0) >= (existing.updatedAt || 0)) {
        // Preserve pdfUrl / sourceAssets if a newer record from cloud omitted them
        const mergedPdfUrl = p.pdfUrl || existing?.pdfUrl;
        const mergedAssets =
          p.sourceAssets && p.sourceAssets.length > 0
            ? p.sourceAssets
            : existing?.sourceAssets;
        map.set(p.id, {
          ...p,
          ...(mergedPdfUrl ? { pdfUrl: mergedPdfUrl } : {}),
          ...(mergedAssets && mergedAssets.length > 0 ? { sourceAssets: mergedAssets } : {}),
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function uploadProtocolSourceAssetsToServer(
  doctorUid: string,
  files: Array<{ name: string; mimeType: string; data: string }>
): Promise<ProtocolSourceAsset[]> {
  if (!doctorUid || !files || files.length === 0) return [];
  try {
    const res = await fetch(
      `/api/surgical-protocols/${encodeURIComponent(doctorUid)}/assets`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.assets) ? data.assets : [];
  } catch {
    return [];
  }
}

export async function fetchCustomProtocolsFromLocalServer(
  doctorUid: string
): Promise<SurgicalProtocolTemplate[] | null> {
  if (!doctorUid) return null;
  try {
    const res = await fetch(`/api/surgical-protocols/${encodeURIComponent(doctorUid)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.protocols)) return [];
    return data.protocols
      .map((item: any) => sanitizeCustomSurgicalProtocol(item))
      .filter((x: SurgicalProtocolTemplate | null): x is SurgicalProtocolTemplate => Boolean(x));
  } catch {
    return null;
  }
}

export async function syncCustomProtocolsToLocalServer(
  doctorUid: string,
  protocols: SurgicalProtocolTemplate[]
): Promise<boolean> {
  if (!doctorUid) return false;
  try {
    const res = await fetch(`/api/surgical-protocols/${encodeURIComponent(doctorUid)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocols }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function getSurgicalProtocolById(
  id?: SurgicalProtocolId | string
): SurgicalProtocolTemplate | undefined {
  if (!id) return undefined;
  return getAllSurgicalProtocols().find((p) => p.id === id);
}

export function suggestProtocolIdFromText(text?: string): SurgicalProtocolId | null {
  const s = String(text || '').toLowerCase();
  if (!s) return null;
  if (/\bturp\b|prostate\s*resect|bipolar\s*turp|monopolar\s*turp/i.test(s)) return 'turp';
  if (/\bpcnl\b|mini[-\s]*perc|percutaneous\s*nephrolith/i.test(s)) return 'pcnl';
  if (/\bursl\b|\burs\b|\brirs\b|ureteroscop/i.test(s)) return 'ursl';
  if (/lap(?:aroscopic)?.*nephrect|retroperitoneoscop.*nephrect/i.test(s)) {
    return 'laparoscopic-nephrectomy';
  }
  if (/open.*nephrect|radical\s*nephrect|simple\s*nephrect/i.test(s)) {
    return 'open-nephrectomy';
  }
  // Check custom protocols by shortName or name
  for (const custom of runtimeCustomProtocols) {
    const shortLower = custom.shortName.toLowerCase().trim();
    const nameLower = custom.name.toLowerCase().trim();
    if (shortLower.length >= 3 && s.includes(shortLower)) return custom.id;
    if (nameLower.length >= 5 && s.includes(nameLower)) return custom.id;
  }
  return null;
}

export function computePostOpDayNumber(
  surgeryDate?: string,
  referenceDateStr?: string
): number | null {
  if (!surgeryDate || !/^\d{4}-\d{2}-\d{2}$/.test(surgeryDate)) return null;
  const refStr =
    referenceDateStr && /^\d{4}-\d{2}-\d{2}$/.test(referenceDateStr)
      ? referenceDateStr
      : new Date().toISOString().split('T')[0];
  const [sy, sm, sd] = surgeryDate.split('-').map(Number);
  const [ry, rm, rd] = refStr.split('-').map(Number);
  const sUtc = Date.UTC(sy, sm - 1, sd);
  const rUtc = Date.UTC(ry, rm - 1, rd);
  const diffDays = Math.floor((rUtc - sUtc) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays : null;
}

export const POD_0_POST_OP_HEADING = 'POD 0 - POST OP';

const LATER_POD_OR_DISCHARGE_RE =
  /\b(?:pod\s*[1-9]\d*|day\s*[1-9]\d*|discharge|follow[-\s]?up|remarks?|deviation)\b/i;

const IMMEDIATE_POST_OP_TAG_RE =
  /\b(?:pod\s*0|day\s*0|immediate(?:\s*post[-\s]?op(?:erative)?)?|post[-\s]?op(?:erative)?(?:\s*(?:instructions?|orders?|care|monitoring))?|recovery|pacu|day\s*of\s*surgery|surgery\s*day|0\s*[-–]\s*\d+\s*h(?:rs?|ours?)?|first\s*\d+\s*h(?:rs?|ours?)?|ot\s*(?:&|\/|\+)?\s*post[-\s]?op|pre[-\s]?op(?:erative)?|intra[-\s]?op(?:erative)?)\b/i;

/**
 * Returns true if a protocol stage tag represents immediate post-op care
 * (either explicitly POD 0 / immediate post-op / pre-POD-1, or any stage
 * positioned before the first POD 1 stage in a protocol).
 */
export function isImmediatePostOpStageTag(
  stageTag?: string,
  stageIndex?: number,
  stages?: Array<{ dayTag: string }>
): boolean {
  const cleaned = (stageTag || '').trim();
  if (cleaned && LATER_POD_OR_DISCHARGE_RE.test(cleaned)) {
    return false;
  }
  if (stages && typeof stageIndex === 'number' && stageIndex >= 0) {
    const pod1Idx = stages.findIndex((st) => /\bpod\s*1\b/i.test(st.dayTag || ''));
    if (pod1Idx > 0 && stageIndex < pod1Idx) {
      return true;
    }
  }
  if (!cleaned) return false;
  return IMMEDIATE_POST_OP_TAG_RE.test(cleaned);
}

/**
 * Normalizes a protocol stage or clinical group heading for Daily Progress display:
 * - Anything before POD 1 / immediate post-op -> "POD 0 - POST OP"
 * - Protocol-prefixed POD 1+ or Discharge tags (e.g. "TURP · POD 1") -> "POD 1"
 */
export function normalizeStageHeadingForDailyProgress(
  stageTag: string,
  stageIndex?: number,
  stages?: Array<{ dayTag: string }>
): string {
  const cleaned = (stageTag || '').replace(/:$/, '').trim();
  if (!cleaned) return '';

  // Strip optional leading protocol short-name prefix like "TURP · " or "URSL - "
  const prefixMatch = cleaned.match(/^([A-Za-z0-9/+\-\s]{2,24})\s*[·•|]\s*(.+)$/);
  const bareStage = prefixMatch ? prefixMatch[2].trim() : cleaned;

  if (
    isImmediatePostOpStageTag(bareStage, stageIndex, stages) ||
    isImmediatePostOpStageTag(cleaned, stageIndex, stages)
  ) {
    return POD_0_POST_OP_HEADING;
  }

  // Keep clean POD 1+ / Discharge headings without repeating protocol short-name on every heading
  if (prefixMatch && /\b(?:pod\s*[1-9]\d*|discharge)\b/i.test(bareStage)) {
    return bareStage;
  }

  return cleaned;
}

export function formatPodLabel(surgeryDate?: string, referenceDateStr?: string): string {
  const pod = computePostOpDayNumber(surgeryDate, referenceDateStr);
  if (pod === null) return '';
  return `POD ${pod}`;
}

/**
 * Formats POD label specifically for Daily Progress headers, turning POD 0
 * (and legacy "POD 0 (OT & Post-Op)") into "POD 0 - POST OP".
 */
export function formatDailyProgressPodLabel(
  podLabel?: string,
  surgeryDate?: string,
  referenceDateStr?: string
): string {
  const raw = (podLabel || '').trim() || formatPodLabel(surgeryDate, referenceDateStr);
  if (!raw) return '';
  if (isImmediatePostOpStageTag(raw)) {
    return POD_0_POST_OP_HEADING;
  }
  return raw;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pure UTC date addition for YYYY-MM-DD strings (avoids local timezone drift).
 */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  if (!ISO_DATE_RE.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Parses a protocol stage tag (e.g. "POD 0", "POD 0 - POST OP", "POD 1",
 * "POD 3–4", "POD 4 (TWOC)", "URSL · POD 1", "Discharge", "Pre-Op") into a
 * day offset relative to surgeryDate, or 'discharge' / 'pre-op' / null.
 */
export function parseProtocolStageDayOffset(
  stageTag?: string,
  stageIndex?: number,
  stages?: Array<{ dayTag: string }>
): number | 'discharge' | 'pre-op' | null {
  const cleaned = (stageTag || '').replace(/:$/, '').trim();
  if (!cleaned) return null;

  const prefixMatch = cleaned.match(/^([A-Za-z0-9/+\-\s]{2,24})\s*[·•|]\s*(.+)$/);
  const bare = (prefixMatch ? prefixMatch[2] : cleaned).trim();

  if (/\bdischarge\b/i.test(bare)) {
    return 'discharge';
  }
  if (/\bpre[-\s]?op(?:erative)?\b/i.test(bare) && !/\bpost[-\s]?op/i.test(bare)) {
    return 'pre-op';
  }
  if (isImmediatePostOpStageTag(bare, stageIndex, stages)) {
    return 0;
  }

  const numMatch = bare.match(/\b(?:pod|day)\s*(\d+)/i);
  if (numMatch) {
    const dayNum = parseInt(numMatch[1], 10);
    if (!Number.isNaN(dayNum) && dayNum >= 0) {
      return dayNum;
    }
  }
  return null;
}

/**
 * Resolves the exact calendar date (YYYY-MM-DD) for a surgical protocol stage,
 * so clicking or editing a stage retrospectively files its items into that
 * specific POD's date (surgeryDate + N days) rather than today's date.
 */
export function resolveProtocolStageTargetDate(
  stageTag: string,
  options: {
    surgeryDate?: string;
    admissionDate?: string;
    dischargeDate?: string;
    fallbackDate: string;
    stageIndex?: number;
    stages?: Array<{ dayTag: string }>;
  }
): string {
  const { surgeryDate, admissionDate, dischargeDate, fallbackDate, stageIndex, stages } = options;
  const offset = parseProtocolStageDayOffset(stageTag, stageIndex, stages);
  const hasSurgery = Boolean(surgeryDate && ISO_DATE_RE.test(surgeryDate));
  const hasAdmission = Boolean(admissionDate && ISO_DATE_RE.test(admissionDate));
  const hasDischarge = Boolean(dischargeDate && ISO_DATE_RE.test(dischargeDate));

  if (typeof offset === 'number' && offset >= 0) {
    return hasSurgery ? addDaysToIsoDate(surgeryDate!, offset) : fallbackDate;
  }

  if (offset === 'pre-op') {
    if (hasAdmission && (!hasSurgery || admissionDate! <= surgeryDate!)) {
      return admissionDate!;
    }
    if (hasSurgery) {
      return addDaysToIsoDate(surgeryDate!, -1);
    }
    return fallbackDate;
  }

  if (offset === 'discharge') {
    if (hasDischarge) {
      return dischargeDate!;
    }
    return fallbackDate;
  }

  return fallbackDate;
}

/**
 * Returns true when a clinical sub-heading (e.g. "POD 0 - POST OP", "POD 1",
 * "POD 3–4") merely repeats the day card's own POD header (e.g. "POD 0 - POST OP",
 * "POD 1", "POD 3") and can be omitted to avoid visual repetition.
 * Meaningful distinct labels like "Discharge" or "URSL Remarks" return false.
 */
export function isRedundantPodHeadingForDay(
  heading?: string,
  dayPodLabel?: string
): boolean {
  const cleanHeading = (heading || '').replace(/:$/, '').trim();
  const cleanDayPod = (dayPodLabel || '').replace(/:$/, '').trim();
  if (!cleanHeading || !cleanDayPod) return false;

  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[—–-]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim();

  if (norm(cleanHeading) === norm(cleanDayPod)) {
    return true;
  }

  const headingOffset = parseProtocolStageDayOffset(cleanHeading);
  const dayOffset = parseProtocolStageDayOffset(cleanDayPod);

  if (typeof headingOffset === 'number' && typeof dayOffset === 'number') {
    if (headingOffset === dayOffset) {
      // Preserve parenthetical clinical qualifiers like "POD 4 (TWOC)" unless exact match
      if (/\([^)]+\)/.test(cleanHeading) && !/\bpost\s*op\b/i.test(cleanHeading)) {
        return false;
      }
      return true;
    }
  }

  return false;
}

export function getProtocolCompletionStats(
  protocolId: SurgicalProtocolId,
  checkedItemIds: string[] = []
): { completed: number; total: number; percent: number } {
  const tpl = getSurgicalProtocolById(protocolId);
  if (!tpl) return { completed: 0, total: 0, percent: 0 };
  const allIds = tpl.stages.flatMap((st) => st.items.map((it) => it.id));
  const checkedSet = new Set(checkedItemIds);
  const completed = allIds.filter((id) => checkedSet.has(id)).length;
  const total = allIds.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percent };
}

/**
 * Converts a ticked Surgical Protocol checklist item into crisp, authoritative
 * doctor-order / confirmed clinical action language for Daily Progress notes.
 * Because ticking an item represents consultant authorisation / confirmation,
 * passive/conditional wording like "if surgeon authorises" or "only on explicit
 * surgeon order" is converted into a direct order.
 */
export function convertProtocolItemToClinicalOrder(rawText: string): string {
  const original = (rawText || '').trim();
  if (!original) return '';

  // Already converted into an authorised order phrasing — preserve as-is
  if (/\b(?:authorised|authorized|confirmed)\s*[—–-]/i.test(original)) {
    return original;
  }

  // Strip redundant leading "POD 2: " / "POD 3: " / "POD 4: " stage prefixes since items are already grouped under POD headings
  let text = original.replace(/^POD\s*\d+(?:\s*[-–]\s*\d+)?\s*:\s*/i, '').trim();
  const lower = text.toLowerCase();

  // 1. High-specificity clinical order conversions (TURP, URSL, PCNL, Nephrectomy, Circumcision & custom urology protocols)
  if (
    /\b(?:remove\s+traction|traction\s*\/?\s*strapping|traction\s+removal|release\s+traction)\b/i.test(
      lower
    )
  ) {
    if (/resecure/i.test(lower)) {
      return 'Traction removal authorised — remove traction/strapping and resecure catheter without traction.';
    }
    return 'Traction removal authorised — release/remove catheter traction and reassess haemostasis.';
  }

  if (/\bballoon\s+adjustment\b/i.test(lower)) {
    const volMatch = text.match(/target\s+remaining\s+volume\s+[^)]+/i);
    const targetClause = volMatch ? ` (${volMatch[0]})` : '';
    return `Catheter balloon adjustment authorised — adjust balloon volume within catheter specifications${targetClause}.`;
  }

  if (/\breduce\s+cbi\b/i.test(lower)) {
    return 'Reduce CBI authorised — decrease continuous bladder irrigation rate (effluent clear/light pink, clot-free, draining freely).';
  }

  if (/\bstop\s+cbi\b/i.test(lower)) {
    return 'Stop CBI authorised — discontinue bladder irrigation and leave catheter on free drainage; monitor for recurrent bleeding/clots.';
  }

  if (/\bremove\s+pcn\b|\bremove\s+nephrostomy\b|\bpcn\s+removal\b|\bnephrostomy\s+(?:tube\s+)?removal\b/i.test(lower)) {
    return 'PCN / nephrostomy tube removal authorised — remove nephrostomy tube, dress site, and monitor for flank leak or pain.';
  }

  if (/\bremove\s+(?:urethral\s+|urinary\s+|foley\s+)?catheter\b|\bcatheter\s+removal\b|\btwoc\b/i.test(lower)) {
    if (/dj\s*stent\s+remains/i.test(lower)) {
      return 'Urethral catheter removal authorised — remove Foley catheter (DJ stent to remain in situ) and monitor voiding.';
    }
    if (/off\s+cbi/i.test(lower)) {
      return 'Catheter removal (TWOC) authorised — remove urethral catheter and monitor post-removal voiding & PVR.';
    }
    if (/epidural/i.test(lower)) {
      return 'Catheter removal authorised — remove urethral catheter (after verifying epidural/monitoring needs) and confirm comfortable voiding.';
    }
    return 'Catheter removal authorised — remove urethral catheter and confirm comfortable voiding (review if no void by 6 hours).';
  }

  if (
    (/\bremove\s+drain\b|\bdrain\s+removal\b|\bconsider\s+removal\b/i.test(lower) &&
      /\bdrain\b/i.test(lower))
  ) {
    return 'Drain removal authorised — remove surgical drain and apply sterile dressing.';
  }

  if (/^oral\s+sips\s*\/\s*liquid\s+diet\b/i.test(lower)) {
    return 'Oral sips / liquid diet authorised — start and advance as tolerated.';
  }

  if (/^clear\s+fluids\s*\/\s*sips\b/i.test(lower)) {
    return 'Clear oral fluids / sips authorised — discontinue NBM and advance diet as tolerated.';
  }

  if (/^soft\s+diet\b/i.test(lower)) {
    return 'Soft diet authorised — advance to soft diet and taper IV fluids as oral intake improves.';
  }

  if (/^full\s+diet\b/i.test(lower)) {
    return 'Full diet authorised — advance to full diet and stop IV fluids as oral intake permits.';
  }

  if (/^oral\s+fluids\s*(?:\/|and)\s*diet\b/i.test(lower)) {
    return 'Oral fluids & diet authorised — start once awake/cleared post-anaesthesia and advance as tolerated.';
  }

  if (/^(?:mobilise|out\s+of\s+bed)\b/i.test(lower)) {
    const cleanedMob = text.replace(/\.$/, '');
    return `Mobilisation authorised — ${cleanedMob.charAt(0).toLowerCase()}${cleanedMob.slice(1)}.`;
  }

  if (/^soak\s+and\s+gently\s+remove\s+outer\s+dressing\b/i.test(lower)) {
    return 'Outer dressing removal authorised — soak and gently remove outer dressing.';
  }

  if (/^target\s+discharge\b/i.test(lower)) {
    return `Discharge plan confirmed — ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  if (/\btraction\s+only\s+as\s+documented\s+by\s+surgeon\b/i.test(lower)) {
    return 'Catheter traction confirmed as documented by surgeon; traction release plan noted.';
  }

  // 2. General short noun-phrase custom protocol items (e.g., "Traction removal", "Drain removal", "Suture removal", "Dressing change")
  const shortRemovalMatch = text.match(/^([A-Za-z0-9\s/+-]{2,36})\s+removal\.?$/i);
  if (shortRemovalMatch) {
    const target = shortRemovalMatch[1].trim();
    return `${target} removal authorised — remove ${target.toLowerCase()}.`;
  }

  const shortStopMatch = text.match(/^(?:stop|discontinue)\s+([A-Za-z0-9\s/+-]{2,36})\.?$/i);
  if (shortStopMatch) {
    const target = shortStopMatch[1].trim();
    return `Discontinue ${target} — authorised.`;
  }

  // 3. General cleanup for any other protocol line containing conditional "surgeon to authorise" / "if authorised" phrasing
  let hadAuthClause = false;
  const cleaned = text
    .replace(/\s*\(\s*surgeon\s+to\s+authori[sz]e\s*\)/gi, () => {
      hadAuthClause = true;
      return '';
    })
    .replace(/\s*,?\s*and\s+surgeon\s+authori[sz]es\b/gi, () => {
      hadAuthClause = true;
      return '';
    })
    .replace(/\s*if\s+(?:appropriate\s+and\s+|tolerated\s+and\s+|haemostasis\s+satisfactory\s+and\s+)?(?:surgeon\s+)?authori[sz]ed?\b/gi, () => {
      hadAuthClause = true;
      return '';
    })
    .replace(/\s*only\s+on\s+explicit\s+surgeon\s+order\s*(?:and\s+)?/gi, () => {
      hadAuthClause = true;
      return ' ';
    })
    .replace(/\s*after\s+surgeon\s+review\b/gi, () => {
      hadAuthClause = true;
      return '';
    })
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (hadAuthClause && cleaned) {
    const withoutTrail = cleaned.replace(/\.$/, '');
    return `${withoutTrail} (authorised).`;
  }

  // For review / monitoring / confirmation items that don't have an explicit action prefix, keep crisp & clean
  if (/^review\s+/i.test(cleaned)) {
    const body = cleaned.replace(/^review\s+/i, '').replace(/\.$/, '');
    return `Reviewed ${body}.`;
  }

  return cleaned || original;
}
