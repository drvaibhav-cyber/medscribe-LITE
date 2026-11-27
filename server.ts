import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

function extractCleanBase64AndMime(
  rawData: string,
  fallbackMime = 'image/jpeg'
): { data: string; mimeType: string } {
  const trimmed = String(rawData || '').trim();
  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1].trim().toLowerCase(),
      data: dataUrlMatch[2].replace(/\s+/g, ''),
    };
  }
  return {
    mimeType: fallbackMime,
    data: trimmed.replace(/\s+/g, ''),
  };
}

/**
 * Local Disk File System Mirror Endpoint:
 * Writes the doctor's structured OPD consultations (.json) to local disk storage.
 */
app.post('/api/local-storage/sync', async (req, res) => {
  try {
    const { doctorUid, doctorName, folderPathDisplay, fileNamePrefix, consultations } = req.body || {};
    if (typeof doctorUid !== 'string' || !doctorUid.trim()) {
      return res.status(400).json({ success: false, error: 'Missing or invalid doctorUid' });
    }

    const safeUid = doctorUid.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const rawPrefix =
      typeof fileNamePrefix === 'string' && fileNamePrefix.trim()
        ? fileNamePrefix.trim()
        : `${safeUid}_OPD_Register`;
    const safePrefix =
      rawPrefix.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || `${safeUid}_OPD_Register`;

    if (!safeUid || /^_+$/.test(safeUid)) {
      return res.status(400).json({ success: false, error: 'Invalid doctorUid format' });
    }

    const storageRoot = path.resolve(__dirname, 'local_opd_storage');
    const resolvedBase = path.resolve(storageRoot, safeUid);
    const resolvedTarget = path.resolve(resolvedBase, `${safePrefix}.json`);
    if (
      !resolvedBase.startsWith(storageRoot + path.sep) ||
      !resolvedTarget.startsWith(resolvedBase + path.sep)
    ) {
      return res.status(400).json({ success: false, error: 'Invalid storage path identifier' });
    }

    await fs.promises.mkdir(resolvedBase, { recursive: true });

    const safeConsultations = Array.isArray(consultations) ? consultations.slice(0, 5000) : [];
    const payload = {
      doctorUid: safeUid,
      doctorName: typeof doctorName === 'string' ? doctorName.slice(0, 120) : '',
      configuredFolderPath:
        typeof folderPathDisplay === 'string' ? folderPathDisplay.slice(0, 260) : resolvedBase,
      exportedAt: new Date().toISOString(),
      totalConsultations: safeConsultations.length,
      consultations: safeConsultations,
    };

    await fs.promises.writeFile(resolvedTarget, JSON.stringify(payload, null, 2), 'utf-8');

    return res.json({
      success: true,
      diskFilePath: resolvedTarget,
      syncedAt: Date.now(),
    });
  } catch (err: any) {
    console.error('Local disk storage sync error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to write to local disk storage',
    });
  }
});

/**
 * Resolve and confine per-doctor Medicine Master & Groups JSON path inside local_opd_storage
 */
function resolveMedicineMasterFilePath(
  rawDoctorUid: any
): { safeUid: string; targetPath: string } | null {
  if (typeof rawDoctorUid !== 'string' || !rawDoctorUid.trim()) return null;
  const safeUid = rawDoctorUid.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  if (!safeUid || /^_+$/.test(safeUid)) return null;

  const storageRoot = path.resolve(__dirname, 'local_opd_storage');
  const resolvedBase = path.resolve(storageRoot, safeUid);
  const resolvedTarget = path.resolve(resolvedBase, 'medicine_master.json');
  if (
    !resolvedBase.startsWith(storageRoot + path.sep) ||
    !resolvedTarget.startsWith(resolvedBase + path.sep)
  ) {
    return null;
  }
  return { safeUid, targetPath: resolvedTarget };
}

function sanitizeMedicineMasterPayloadServer(raw: any) {
  const now = Date.now();
  const rawMeds = Array.isArray(raw?.medications) ? raw.medications : [];
  const medications: any[] = [];
  const seenMedIds = new Set<string>();

  for (let i = 0; i < Math.min(rawMeds.length, 500); i++) {
    const item = rawMeds[i];
    if (!item || typeof item !== 'object') continue;
    const medicine = String(item.medicine || '').trim().slice(0, 150);
    if (!medicine) continue;
    const id = String(item.id || `med-${now}-${i}`).trim().slice(0, 100) || `med-${now}-${i}`;
    if (seenMedIds.has(id)) continue;
    seenMedIds.add(id);
    const src =
      item.source === 'manual' || item.source === 'prescription' || item.source === 'default'
        ? item.source
        : 'manual';
    medications.push({
      id,
      medicine,
      dosage: String(item.dosage || '').trim().slice(0, 80),
      when: String(item.when || '').trim().slice(0, 80),
      frequency: String(item.frequency || '').trim().slice(0, 60),
      duration: String(item.duration || '').trim().slice(0, 60),
      notes: String(item.notes || '').trim().slice(0, 250),
      source: src,
      createdAt:
        typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : now,
      updatedAt:
        typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : now,
    });
  }

  const validMedIds = new Set(medications.map((m) => m.id));
  const rawGroups = Array.isArray(raw?.groups) ? raw.groups : [];
  const groups: any[] = [];
  const seenGroupIds = new Set<string>();

  for (let i = 0; i < Math.min(rawGroups.length, 100); i++) {
    const grp = rawGroups[i];
    if (!grp || typeof grp !== 'object') continue;
    const name = String(grp.name || '').trim().slice(0, 80);
    if (!name) continue;
    const id = String(grp.id || `grp-${now}-${i}`).trim().slice(0, 100) || `grp-${now}-${i}`;
    if (seenGroupIds.has(id)) continue;
    seenGroupIds.add(id);
    const rawIds = Array.isArray(grp.medicationIds) ? grp.medicationIds : [];
    const medIds = Array.from(
      new Set(
        rawIds
          .map((x: any) => String(x || '').trim())
          .filter((x: string) => x && validMedIds.has(x))
      )
    );
    groups.push({
      id,
      name,
      description: String(grp.description || '').trim().slice(0, 200),
      medicationIds: medIds,
      createdAt:
        typeof grp.createdAt === 'number' && Number.isFinite(grp.createdAt) ? grp.createdAt : now,
      updatedAt:
        typeof grp.updatedAt === 'number' && Number.isFinite(grp.updatedAt) ? grp.updatedAt : now,
    });
  }

  return {
    medications,
    groups,
    updatedAt: typeof raw?.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

app.get('/api/medicine-master/:doctorUid', async (req, res) => {
  try {
    const resolved = resolveMedicineMasterFilePath(req.params.doctorUid);
    if (!resolved) {
      return res.status(400).json({ success: false, error: 'Invalid doctorUid' });
    }
    if (!fs.existsSync(resolved.targetPath)) {
      return res.json({ success: true, store: null });
    }
    const raw = await fs.promises.readFile(resolved.targetPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return res.json({
      success: true,
      store: sanitizeMedicineMasterPayloadServer(parsed),
    });
  } catch (err: any) {
    console.error('Failed to read medicine master store:', err);
    return res.status(500).json({ success: false, error: 'Failed to load medicine master list.' });
  }
});

app.put('/api/medicine-master/:doctorUid', async (req, res) => {
  try {
    const resolved = resolveMedicineMasterFilePath(req.params.doctorUid);
    if (!resolved) {
      return res.status(400).json({ success: false, error: 'Invalid doctorUid' });
    }
    const sanitized = sanitizeMedicineMasterPayloadServer(req.body || {});
    await fs.promises.mkdir(path.dirname(resolved.targetPath), { recursive: true });
    await fs.promises.writeFile(resolved.targetPath, JSON.stringify(sanitized, null, 2), 'utf-8');
    return res.json({ success: true, store: sanitized });
  } catch (err: any) {
    console.error('Failed to save medicine master store:', err);
    return res.status(500).json({ success: false, error: 'Failed to save medicine master list.' });
  }
});

/**
 * Resolve and confine per-doctor IPD records JSON path inside local_opd_storage
 */
function resolveIpdStorageFilePath(
  rawDoctorUid: any
): { safeUid: string; targetPath: string } | null {
  if (typeof rawDoctorUid !== 'string' || !rawDoctorUid.trim()) return null;
  const safeUid = rawDoctorUid.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  if (!safeUid || /^_+$/.test(safeUid)) return null;

  const storageRoot = path.resolve(__dirname, 'local_opd_storage');
  const resolvedBase = path.resolve(storageRoot, safeUid);
  const resolvedTarget = path.resolve(resolvedBase, 'ipd_records.json');
  if (
    !resolvedBase.startsWith(storageRoot + path.sep) ||
    !resolvedTarget.startsWith(resolvedBase + path.sep)
  ) {
    return null;
  }
  return { safeUid, targetPath: resolvedTarget };
}

function sanitizeIpdStoragePayloadServer(raw: any) {
  const now = Date.now();
  const rawPatients = Array.isArray(raw?.patients) ? raw.patients : [];
  const patients: any[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < Math.min(rawPatients.length, 300); i++) {
    const p = rawPatients[i];
    if (!p || typeof p !== 'object') continue;
    const id = String(p.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
    const patientName = String(p.patientName || '').trim().slice(0, 120);
    if (!id || !patientName || seenIds.has(id)) continue;
    seenIds.add(id);
    patients.push({
      ...p,
      id,
      patientName,
      dailyNotes: Array.isArray(p.dailyNotes) ? p.dailyNotes.slice(0, 60) : [],
      medications: Array.isArray(p.medications) ? p.medications.slice(0, 40) : [],
      medicationLogs: Array.isArray(p.medicationLogs) ? p.medicationLogs.slice(0, 150) : [],
      investigationRecords: Array.isArray(p.investigationRecords)
        ? p.investigationRecords.slice(0, 50)
        : [],
      otProcedures: Array.isArray(p.otProcedures) ? p.otProcedures.slice(0, 10) : undefined,
      updatedAt:
        typeof p.updatedAt === 'number' && Number.isFinite(p.updatedAt) ? p.updatedAt : now,
    });
  }

  return {
    patients,
    updatedAt: typeof raw?.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

app.get('/api/ipd-storage/:doctorUid', async (req, res) => {
  try {
    const resolved = resolveIpdStorageFilePath(req.params.doctorUid);
    if (!resolved) {
      return res.status(400).json({ success: false, error: 'Invalid doctorUid' });
    }
    if (!fs.existsSync(resolved.targetPath)) {
      return res.json({ success: true, patients: [], updatedAt: 0 });
    }
    const rawText = await fs.promises.readFile(resolved.targetPath, 'utf-8');
    const parsed = JSON.parse(rawText);
    const sanitized = sanitizeIpdStoragePayloadServer(parsed);
    return res.json({ success: true, ...sanitized });
  } catch (err: any) {
    console.error('Failed to read IPD local storage:', err);
    return res.status(500).json({ success: false, error: 'Failed to read IPD local records.' });
  }
});

app.put('/api/ipd-storage/:doctorUid', async (req, res) => {
  try {
    const resolved = resolveIpdStorageFilePath(req.params.doctorUid);
    if (!resolved) {
      return res.status(400).json({ success: false, error: 'Invalid doctorUid' });
    }
    const sanitized = sanitizeIpdStoragePayloadServer(req.body || {});
    await fs.promises.mkdir(path.dirname(resolved.targetPath), { recursive: true });
    await fs.promises.writeFile(resolved.targetPath, JSON.stringify(sanitized, null, 2), 'utf-8');
    return res.json({ success: true, count: sanitized.patients.length, updatedAt: sanitized.updatedAt });
  } catch (err: any) {
    console.error('Failed to save IPD local storage:', err);
    return res.status(500).json({ success: false, error: 'Failed to save IPD local records.' });
  }
});

/**
 * Resolve and confine per-doctor custom surgical protocols JSON path inside local_opd_storage
 */
function resolveSurgicalProtocolsFilePath(
  rawDoctorUid: any
): { safeUid: string; targetPath: string } | null {
  if (typeof rawDoctorUid !== 'string' || !rawDoctorUid.trim()) return null;
  const safeUid = rawDoctorUid.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  if (!safeUid || /^_+$/.test(safeUid)) return null;

  const storageRoot = path.resolve(__dirname, 'local_opd_storage');
  const resolvedBase = path.resolve(storageRoot, safeUid);
  const resolvedTarget = path.resolve(resolvedBase, 'surgical_protocols.json');
  if (
    !resolvedBase.startsWith(storageRoot + path.sep) ||
    !resolvedTarget.startsWith(resolvedBase + path.sep)
  ) {
    return null;
  }
  return { safeUid, targetPath: resolvedTarget };
}

function sanitizeSurgicalProtocolTemplateServer(raw: any): any | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim().slice(0, 140);
  if (!name) return null;

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      .slice(0, 36) || 'protocol';
  const rawId = String(raw.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 75);
  const builtinIds = new Set(['laparoscopic-nephrectomy', 'open-nephrectomy', 'pcnl', 'turp', 'ursl']);
  const id = rawId || `custom-${slug}-${Math.random().toString(36).slice(2, 7)}`;
  const isBuiltinOverride = builtinIds.has(id);

  const shortName =
    String(raw.shortName || '').trim().slice(0, 48) ||
    name.split(/\s+/).slice(0, 3).join(' ').slice(0, 32);
  const subtitle = String(raw.subtitle || '').trim().slice(0, 220);
  const expectedStayDays =
    String(raw.expectedStayDays || '').trim().slice(0, 80) || 'As per clinician';
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
  const safeSourceAssets = Array.isArray(raw.sourceAssets)
    ? raw.sourceAssets
        .slice(0, 10)
        .map((a: any) => {
          const url = typeof a?.url === 'string' ? a.url.trim().slice(0, 300) : '';
          if (
            !url ||
            !(url.startsWith('/assets/') || url.startsWith('/api/surgical-protocols/'))
          ) {
            return null;
          }
          return {
            name: String(a?.name || 'Protocol file').trim().slice(0, 140),
            mimeType: String(a?.mimeType || 'application/pdf').trim().slice(0, 80),
            url,
          };
        })
        .filter(Boolean)
    : [];

  const rawStages = Array.isArray(raw.stages) ? raw.stages : [];
  const usedStageIds = new Set<string>();
  const usedItemIds = new Set<string>();

  const stages = rawStages
    .slice(0, 24)
    .map((st: any, sIdx: number) => {
      const dayTag =
        String(st?.dayTag || `Stage ${sIdx + 1}`).trim().slice(0, 48) || `Stage ${sIdx + 1}`;
      const title = String(st?.title || dayTag).trim().slice(0, 140) || dayTag;
      const stSubtitle = st?.subtitle ? String(st.subtitle).trim().slice(0, 200) : undefined;
      let stageId =
        String(st?.id || `${id}-s${sIdx + 1}`)
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^[-_]+|[-_]+$/g, '')
          .slice(0, 48) || `stage-${sIdx + 1}`;
      if (usedStageIds.has(stageId)) stageId = `${stageId}-${sIdx + 1}`;
      usedStageIds.add(stageId);

      const usedFieldKeys = new Set<string>();
      const fields = Array.isArray(st?.fields)
        ? st.fields
            .slice(0, 30)
            .map((f: any, fIdx: number) => {
              const label = String(f?.label || '').trim().slice(0, 100);
              if (!label) return null;
              let key =
                String(f?.key || '')
                  .trim()
                  .replace(/[^a-zA-Z0-9_-]/g, '')
                  .slice(0, 48) ||
                label
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '_')
                  .replace(/^_+|_+$/g, '')
                  .slice(0, 40) ||
                `field_${fIdx + 1}`;
              if (usedFieldKeys.has(key)) key = `${key}_${fIdx + 1}`;
              usedFieldKeys.add(key);

              const options = Array.isArray(f?.options)
                ? f.options
                    .map((o: any) => String(o || '').trim().slice(0, 80))
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
              };
            })
            .filter(Boolean)
        : [];

      const items = Array.isArray(st?.items)
        ? st.items
            .slice(0, 60)
            .map((it: any, iIdx: number) => {
              const text = String(it?.text || '').trim().slice(0, 500);
              if (!text) return null;
              let itemId =
                String(it?.id || `${stageId}-i${iIdx + 1}`)
                  .toLowerCase()
                  .replace(/[^a-z0-9_-]+/g, '-')
                  .replace(/-+/g, '-')
                  .replace(/^[-_]+|[-_]+$/g, '')
                  .slice(0, 56) || `${stageId}-i${iIdx + 1}`;
              if (usedItemIds.has(itemId)) itemId = `${itemId}-${iIdx + 1}`;
              usedItemIds.add(itemId);
              return {
                id: itemId,
                text,
                ...(it?.critical ? { critical: true } : {}),
              };
            })
            .filter(Boolean)
        : [];

      return {
        id: stageId,
        dayTag,
        title,
        ...(stSubtitle ? { subtitle: stSubtitle } : {}),
        ...(fields.length > 0 ? { fields } : {}),
        items,
      };
    })
    .filter((st: any) => st.items.length > 0 || (st.fields && st.fields.length > 0));

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
    createdAt:
      typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

app.get('/api/surgical-protocols/:doctorUid', async (req, res) => {
  try {
    const resolved = resolveSurgicalProtocolsFilePath(req.params.doctorUid);
    if (!resolved) {
      return res.status(400).json({ success: false, error: 'Invalid doctorUid' });
    }
    if (!fs.existsSync(resolved.targetPath)) {
      return res.json({ success: true, protocols: [] });
    }
    const rawText = await fs.promises.readFile(resolved.targetPath, 'utf-8');
    const parsed = JSON.parse(rawText);
    const list = Array.isArray(parsed?.protocols) ? parsed.protocols : [];
    const protocols = list
      .slice(0, 50)
      .map((item: any) => sanitizeSurgicalProtocolTemplateServer(item))
      .filter(Boolean);
    return res.json({ success: true, protocols });
  } catch (err: any) {
    console.error('Failed to read custom surgical protocols:', err);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to read custom surgical protocols.' });
  }
});

app.put('/api/surgical-protocols/:doctorUid', async (req, res) => {
  try {
    const resolved = resolveSurgicalProtocolsFilePath(req.params.doctorUid);
    if (!resolved) {
      return res.status(400).json({ success: false, error: 'Invalid doctorUid' });
    }
    const rawList = Array.isArray(req.body?.protocols) ? req.body.protocols : [];
    const protocols = rawList
      .slice(0, 50)
      .map((item: any) => sanitizeSurgicalProtocolTemplateServer(item))
      .filter(Boolean);
    await fs.promises.mkdir(path.dirname(resolved.targetPath), { recursive: true });
    await fs.promises.writeFile(
      resolved.targetPath,
      JSON.stringify({ protocols, updatedAt: Date.now() }, null, 2),
      'utf-8'
    );
    return res.json({ success: true, count: protocols.length });
  } catch (err: any) {
    console.error('Failed to save custom surgical protocols:', err);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to save custom surgical protocols.' });
  }
});

app.post('/api/surgical-protocols/:doctorUid/assets', async (req, res) => {
  try {
    const resolved = resolveSurgicalProtocolsFilePath(req.params.doctorUid);
    if (!resolved) {
      return res.status(400).json({ success: false, error: 'Invalid doctorUid' });
    }
    const rawFiles = Array.isArray(req.body?.files) ? req.body.files : [];
    if (rawFiles.length === 0) {
      return res.status(400).json({ success: false, error: 'No files provided.' });
    }

    const assetsDir = path.resolve(path.dirname(resolved.targetPath), 'protocol_assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const savedAssets: Array<{ name: string; mimeType: string; url: string }> = [];
    const extByMime: Record<string, string> = {
      'application/pdf': '.pdf',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };

    for (let i = 0; i < Math.min(rawFiles.length, 10); i++) {
      const f = rawFiles[i];
      if (!f || typeof f.data !== 'string' || !f.data.trim()) continue;
      const cleaned = extractCleanBase64AndMime(f.data, f.mimeType || 'image/jpeg');
      const mime = (cleaned.mimeType || 'image/jpeg').toLowerCase();
      const ext = extByMime[mime];
      if (!ext) continue;

      const buf = Buffer.from(cleaned.data, 'base64');
      if (buf.length === 0 || buf.length > 15 * 1024 * 1024) continue;

      const safeFileName = `proto_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}${ext}`;
      const targetFile = path.resolve(assetsDir, safeFileName);
      if (!targetFile.startsWith(assetsDir + path.sep)) continue;

      await fs.promises.writeFile(targetFile, buf);
      savedAssets.push({
        name: String(f.name || safeFileName).trim().slice(0, 140),
        mimeType: mime,
        url: `/api/surgical-protocols/${encodeURIComponent(resolved.safeUid)}/assets/${encodeURIComponent(safeFileName)}`,
      });
    }

    return res.json({ success: true, assets: savedAssets });
  } catch (err: any) {
    console.error('Failed to save protocol source assets:', err);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to save protocol source files.' });
  }
});

app.get('/api/surgical-protocols/:doctorUid/assets/:fileName', async (req, res) => {
  try {
    const resolved = resolveSurgicalProtocolsFilePath(req.params.doctorUid);
    if (!resolved) {
      return res.status(400).send('Invalid doctorUid');
    }
    const rawFileName = String(req.params.fileName || '').trim();
    if (!/^[a-zA-Z0-9_.-]+$/.test(rawFileName)) {
      return res.status(400).send('Invalid file name');
    }
    const assetsDir = path.resolve(path.dirname(resolved.targetPath), 'protocol_assets');
    const targetFile = path.resolve(assetsDir, rawFileName);
    if (!targetFile.startsWith(assetsDir + path.sep) || !fs.existsSync(targetFile)) {
      return res.status(404).send('Protocol file not found');
    }

    const ext = path.extname(rawFileName).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${rawFileName}"`);
    return res.sendFile(targetFile);
  } catch (err: any) {
    console.error('Failed to serve protocol asset:', err);
    return res.status(500).send('Failed to load protocol file');
  }
});

app.get('/api/health', (_req, res) => {
  return res.json({
    status: 'ok',
    mode: 'local-free',
  });
});

app.use('/api', (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  console.error('[API Error Middleware]:', err);
  res.status(err?.status || 500).json({
    success: false,
    error: err?.message || 'Internal server error processing API request.',
  });
});

async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (100% local free mode)`);
  });
}

startServer();
