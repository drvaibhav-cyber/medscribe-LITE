# Security Summary

**Reviewed Files**: 19
**Issues Resolved**: 6

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Local Disk Storage Path Confinement | `server.ts` | 4226 | `/api/local-storage/sync` sanitized `doctorUid` and `fileNamePrefix` by character replacement, without explicitly verifying resolved paths stayed inside `local_opd_storage`. | Medium | Fixed | Added `path.resolve` containment guards enforcing `resolvedBase.startsWith(storageRoot + path.sep)` and `resolvedTarget.startsWith(resolvedBase + path.sep)`, rejecting empty/dot-only IDs and clamping payload sizes. |
| HTML Injection in Print Frame Title | `src/components/A4PrintModal.tsx` | 1884 | Patient name was interpolated raw into `<title>` inside `doc.write(...)` when generating the A4 print frame. | Medium | Fixed | Added entity escaping (`&`, `<`, `>`, `"`, `'`) on `patientName` before rendering inside the print document `<title>`. |
| Spreadsheet Formula Injection | `src/utils/excelExporter.ts` | 12 | Exported patient and clinical text values starting with `=`, `+`, `@`, tab, or CR were written directly into `.xlsx` / `.csv` cells. | Medium | Fixed | Added `sanitizeSpreadsheetCell` to prefix leading formula characters (excluding legitimate negative numbers and clinical `-` / `--` blanks) across all exported rows. |
| Unhandled Missing-Body Server Crashes & Unbounded Upload Inputs | `server.ts` | 3178 | `req.body` destructuring on `/api/ocr/transcribe`, `/api/ocr/investigations`, and HEIC conversion lacked fallback guards, image batch counts were uncapped, and HEIC error logs could leak temp paths. | Medium | Fixed | Added `req.body || {}` guards, capped image batch arrays (max 24 images), capped HEIC input sizes (25 MB), and scrubbed temp paths from error responses. |
| Unvalidated Learned OCR Rule Payloads | `server.ts` | 4463 | `/api/ocr/feedback-loop/patterns`, `/api/ocr/learned-rules/resolve`, and `/api/ocr/retrograde-confirm` could store arbitrary rule strings without server-side clinical safety filtering or string bounds. | Medium | Fixed | Enforced `isSafeLearnedRuleServer`, strict field types, and length limits server-side on all rule creation/resolution endpoints. |
| HTTP Security Headers & Account Deletion Cleanup | `server.ts`, `src/App.tsx` | 21, 1683 | Express sent `X-Powered-By` and omitted `X-Content-Type-Options` / `Referrer-Policy`; doctor account deletion targeted a misspelled local storage config key (`medscribe_doctor_local_fs_config_v1_*`) and missed deleted-ID cleanup. | Low | Fixed | Disabled `x-powered-by`, added `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`, fixed the local storage cleanup key, and cleared deleted-ID caches on account removal. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| API Keys & Environment Secrets | `server.ts`, `.env.example` | `GEMINI_API_KEY` is read strictly on the server via `process.env` and never bundled into browser assets. |
| Cloud Firestore Rules & Ownership | `firestore.rules`, `src/firebase.ts` | Strict `request.auth.uid == doctorId` + `isVerifiedUser()` ownership checks, exact key whitelists, string bounds, and timestamp/integer bounds match `buildSanitizedFirestoreConsultation`. |
| Client Rendering & React Safety | `src/components/*` | Standard JSX text interpolation is used across clinical forms, review cards, analytics, and modals; no raw `dangerouslySetInnerHTML` sinks exist on patient input. |
| Cross-App Print/Dialog Hygiene | `src/components/ConsultationFormModal.tsx`, `src/components/Sidebar.tsx` | Replaced blocking browser `alert()` / `confirm()` calls with inline React validation banners and two-step inline confirmation controls compatible with embedded iframes. |

---

## PoC Verification

### 1. Local Disk Storage Path Confinement
#### Summary
| Field | Value |
|---|---|
| Issue Type | Path Traversal / Unconfined Directory Write |
| Impact | Medium |
| Affected File | `server.ts:4226` |
| Test Scenario | `POST /api/local-storage/sync` with `doctorUid` values `""`, `"."`, `".."`, `"///"`, `"../.."`, and a normal valid UID `"__audit_smoke_test__"`. |

#### How It Was Fixed
Added explicit `path.resolve` boundary verification (`!resolvedBase.startsWith(storageRoot + path.sep)` and `!resolvedTarget.startsWith(resolvedBase + path.sep)`) alongside strict character sanitization and rejection of empty or underscore-only UIDs.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Payload arrives at `POST /api/local-storage/sync` (`server.ts:4208`). | Request body parsed safely (`req.body || {}`). |
| 2 | `doctorUid` is checked for non-empty string, sanitized to `[a-zA-Z0-9_-]`, and rejected if all underscores (`server.ts:4211-4224`). | Invalid UIDs (`""`, `"."`, `".."`, `"///"`, `"../.."`) return HTTP `400`. |
| 3 | `resolvedBase` and `resolvedTarget` are verified via `.startsWith(...)` containment (`server.ts:4226-4234`). | Valid writes stay confined inside `local_opd_storage/<safeUid>/<safePrefix>.json`. |

#### Conclusion
**Fix Verified** - Path-traversal or malformed `doctorUid` inputs are rejected with HTTP `400` and disk writes cannot escape `local_opd_storage/`.

---

### 2. HTML Injection in Print Frame Title
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsanitized HTML Interpolation in Print Window |
| Impact | Medium |
| Affected File | `src/components/A4PrintModal.tsx:1884` |
| Test Scenario | Patient name set to `</title><script>alert(1)</script>` when invoking A4 print. |

#### How It Was Fixed
Added HTML entity escaping (`&`, `<`, `>`, `"`, `'`) to the patient name string before inserting it inside `<title>` within `doc.write(...)`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `handlePrintA4` reads `consultation?.patientName` (`src/components/A4PrintModal.tsx:1881`). | Raw string enters print builder. |
| 2 | Entity replacement converts `<`, `>`, `&`, `"`, `'` (`src/components/A4PrintModal.tsx:1884`). | `</title>` is encoded as `&lt;/title&gt;`. |
| 3 | Rendered inside `<title>` in the print iframe document. | **Handled Safely** — renders purely as document title text with zero tag breakout. |

#### Conclusion
**Fix Verified** - Escaping prevents breaking out of `<title>` inside the dynamically written print frame.

---

### 3. Spreadsheet Formula Injection in Excel / CSV Export
#### Summary
| Field | Value |
|---|---|
| Issue Type | Spreadsheet Formula Injection |
| Impact | Medium |
| Affected File | `src/utils/excelExporter.ts:12` |
| Test Scenario | `buildConsultationRow` invoked with `patientName: "=SUM(1,1)"`. |

#### How It Was Fixed
Added `sanitizeSpreadsheetCell` mapped across all cells returned by `buildConsultationRow`, prefixing strings starting with `=`, `+`, `@`, tab, or CR (and non-numeric `-` strings while preserving plain `-` / `--` blanks) with a leading `'`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Consultation containing `patientName: "=SUM(1,1)"` is passed to `buildConsultationRow` (`src/utils/excelExporter.ts:314`). | Cell value enters row builder. |
| 2 | `.map(sanitizeSpreadsheetCell)` inspects leading character (`src/utils/excelExporter.ts:12-21`, `420`). | Detects leading `=` and prepends `'`. |
| 3 | Output cell `row[4]` equals `"'=SUM(1,1)"` while `row[5]` remains `"-"`. | **Handled Safely** — Excel/Sheets treats the value strictly as text. |

#### Conclusion
**Fix Verified** - Formula-prefixed text is neutralized in `.xlsx` and `.csv` exports without altering clinical placeholders.

---

### 4. Unhandled Server Exceptions & Unsafe Learned OCR Rule Rejection
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Input Validation & Server-Side Rule Sanitization |
| Impact | Medium |
| Affected File | `server.ts:3178, 3680, 3906, 4463` |
| Test Scenario | Empty JSON `{}` sent to OCR/audio/HEIC endpoints, plus an unsafe tenderness rule (`flanks NT` → `flanks tenderness present`) alongside a valid word rule (`Mirago` → `Myfos`) posted to `/api/ocr/feedback-loop/patterns`. |

#### How It Was Fixed
Added `req.body || {}` guards and clear HTTP `400` validation responses across all media endpoints, enforced batch/size limits, and applied `isSafeLearnedRuleServer` filtering + length clamping on all rule endpoints.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Empty `{}` sent via HTTP `POST` to `/api/ocr/transcribe`, `/api/ocr/investigations`, `/api/audio/dictate`, and `/api/image/convert-heic`. | Returns clean JSON HTTP `400` errors (never HTTP `500`). |
| 2 | Patterns arrive at `POST /api/ocr/feedback-loop/patterns` (`server.ts:4463`). | Server runs `isSafeLearnedRuleServer` (`server.ts:2338`) on every candidate rule. |
| 3 | Live check queries `GET /api/ocr/learned-rules`. | Safe word rule (`audit-safe-temp`) stored; unsafe tenderness rule (`audit-unsafe-temp`) blocked and excluded. |

#### Conclusion
**Fix Verified** - Malformed payloads fail gracefully with HTTP `400`, and unsafe clinical rules are rejected server-side.

---

## Pre-Publish Automated Test & Build Verification

- **Production Build (`npm run build`)**: Passed with 0 errors.
- **TypeScript Strict Check (`npm run lint` / `tsc --noEmit`)**: Passed with 0 errors.
- **Firestore Security Rules Lint (`npx eslint firestore.rules`)**: Passed with 0 errors (exit code 0).
- **Automated Unit Suite (`npx tsx`)**: Passed assertions across IPSS conditional presence (`hasIpssData`), blank/explicit Rx duration preservation (`normalizeRxDurationValue`), USG/Lab date-wise parsing (`buildDateWiseInvestigationTable`), OT false-positive detection (`isFalsePositiveOpdAsOtNotes`), word/line-only retrograde diffs (`extractWordOrLineDiffsFromStrings`, `buildWordOrLineCorrectionCandidates`), A4 print row & advice builders (`formatRxTableRow`, `buildLabeledAdviceRows`), Excel row column-count alignment (`EMR_EXCEL_COLUMNS.length === row.length`) + formula escaping, and Firestore payload sanitization (`buildSanitizedFirestoreConsultation`).
- **Live Server HTTP Verification (`http://127.0.0.1:3000`)**: Passed live checks for security headers, `/api/health`, `/api/ocr/merge`, graceful HTTP `400` handling on empty OCR/audio/HEIC requests, `/api/local-storage/sync` path confinement, and `/api/ocr/feedback-loop/patterns` rule safety enforcement (all test artifacts cleaned up after verification).
