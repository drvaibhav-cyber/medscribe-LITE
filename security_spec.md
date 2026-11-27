# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: All paths not explicitly matched in `/databases/{database}/documents` are strictly denied for both read and write.
2. **Identity & Ownership**: A doctor can only create, read, update, or delete `/doctors/{doctorId}`, `/doctors/{doctorId}/private/{docId}`, and `/doctors/{doctorId}/consultations/{consultationId}` when `request.auth != null`, `request.auth.token.email_verified == true` (for writes), `request.auth.uid == doctorId`, and `incoming().uid == request.auth.uid` (or `incoming().doctorId == request.auth.uid` for consultations).
3. **Master Gate & Relational Sync**: Subcollections `/doctors/{doctorId}/private/{docId}` and `/doctors/{doctorId}/consultations/{consultationId}` enforce parent doctor document ownership via `get(/databases/$(database)/documents/doctors/$(doctorId)).data.uid == request.auth.uid` on single-document operations (`get`, `create`, `update`, `delete`).
4. **Secure List Queries (Pillar 8)**: `allow list` on `/doctors/{doctorId}/consultations/{consultationId}` enforces `isSignedIn() && isOwner(doctorId) && resource.data.doctorId == request.auth.uid` without `get()` calls to prevent O(n) read explosions while guaranteeing zero cross-doctor data leakage.
5. **PII Split Isolation**: Sensitive doctor PII (`email`, `phone`, `clinicAddress`) is isolated inside `/doctors/{doctorId}/private/info` and is only readable by the owner (`request.auth.uid == doctorId`).
6. **Strict Schema, Array & Size Bounds**: Every string field enforces exact `minLength` and `maxLength` bounds from `firebase-blueprint.json`, `keys().hasAll(...) && keys().hasOnly(...)` blocks shadow fields, and bounded arrays (`investigationRecords` <= 50, `prescriptions` <= 30) validate element structure.
7. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time`. On update, `createdAt`, `uid`, `id`, and `doctorId` are immutable.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null`, creating `/doctors/user1` or `/doctors/user1/consultations/c1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'user1', token: { email_verified: false } }`, creating `/doctors/user1/consultations/c1` -> `PERMISSION_DENIED`.
3. **Identity Spoofing (Path Mismatch)**: `auth = { uid: 'attacker' }`, reading or writing `/doctors/victim/consultations/c1` -> `PERMISSION_DENIED`.
4. **Payload DoctorID Spoofing**: `auth = { uid: 'user1' }`, creating `/doctors/user1/consultations/c1` with `doctorId: 'user2'` -> `PERMISSION_DENIED`.
5. **Shadow Field Injection on Create**: Creating `/doctors/user1/consultations/c1` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
6. **Shadow Field Injection on Update**: Updating `/doctors/user1/consultations/c1` adding `secretField: 'x'` -> `PERMISSION_DENIED`.
7. **Immortal Field Mutation (`createdAt`)**: Updating `/doctors/user1/consultations/c1` with modified `createdAt` -> `PERMISSION_DENIED`.
8. **Immortal Field Mutation (`doctorId` / `id`)**: Updating `/doctors/user1/consultations/c1` with modified `doctorId` -> `PERMISSION_DENIED`.
9. **Timestamp Forgery**: Creating `/doctors/user1/consultations/c1` with client-picked `createdAt` != `request.time` -> `PERMISSION_DENIED`.
10. **Resource Exhaustion (Oversized String / Unbounded Array)**: Creating consultation with `complaints` > 2000 chars or `investigationRecords` > 50 items -> `PERMISSION_DENIED`.
11. **Cross-Doctor Consultation List/Get**: Authenticated `doctorB` attempting `list` or `get` on `/doctors/doctorA/consultations` -> `PERMISSION_DENIED`.
12. **Orphaned Subcollection Write**: Creating `/doctors/user1/consultations/c1` when parent `/doctors/user1` does not exist -> `PERMISSION_DENIED`.

## 3. IPD Inpatient & Medication Logs (`/doctors/{doctorId}/ipdPatients/{ipdPatientId}`)
- **Ownership & Master Gate**: Only verified owner (`isVerifiedUser() && isOwner(doctorId)`) with valid parent `/doctors/{doctorId}` may create, read, update, or delete IPD patient documents.
- **Secure List Query**: `allow list: if isSignedIn() && isOwner(doctorId) && resource.data.doctorId == request.auth.uid;` (no `get()` inside `allow list`).
- **Bounded Arrays & Schema Validation**: `isValidDoctorIpdPatient(incoming())` enforces strict `hasAll`/`hasOnly` keys, `status in ['admitted', 'discharged']`, bounded arrays (`dailyNotes <= 60`, `medications <= 40`, `medicationLogs <= 150`, `investigationRecords <= 50`, `otProcedures <= 10`), and exact string max lengths matching `firebase-blueprint.json`.
- **Anti-Update-Gap**: Update rule invokes `isValidDoctorIpdPatient(incoming())` first, locks immutable fields (`id`, `doctorId`, `createdAt`), enforces `updatedAt == request.time`, and restricts mutable keys via `affectedKeys().hasOnly(...)`.

