/**
 * NELVI Finance Control — Google Apps Script backend
 *
 * Sheets created automatically:
 * Members, Transactions, AuditLog
 *
 * Proofs are stored in a Drive folder and metadata is stored in Transactions.
 *
 * SET THESE TWO VALUES BEFORE DEPLOYING:
 */
const SPREADSHEET_ID = "PASTE_YOUR_GOOGLE_SHEET_ID_HERE";
const ACCESS_KEY = "PASTE_YOUR_COMMON_ACCESS_KEY_HERE";
const PROOF_FOLDER_NAME = "NELVI Finance Control Proofs";

const MEMBER_HEADERS = ["memberId","name","role","pin","status","createdAt"];
const TX_HEADERS = ["transactionId","date","ownerId","ownerName","role","type","amount","category","paymentMethod","purpose","referenceId","proofFileId","proofFileName","status","createdAt","verifiedBy","verifiedAt","updatedAt"];
const AUDIT_HEADERS = ["auditId","action","transactionId","actorId","details","timestamp"];

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.action === "bootstrap") {
      if (!p.spreadsheetId || String(p.spreadsheetId).trim() !== String(SPREADSHEET_ID)) {
        return json({ok:false,error:"Spreadsheet ID does not match the server configuration."});
      }
      setupSheets();
      // Only the fields needed to choose a profile are exposed by this unauthenticated bootstrap.
      const publicMembers = readMembers(false).filter(isActiveMember).map(m => ({memberId:String(m.memberId || ""),name:String(m.name || ""),role:String(m.role || "")}));
      return json({ok:true,spreadsheetId:SPREADSHEET_ID,members:publicMembers});
    }
    if (p.action === "data") {
      return json({ok:false,error:"Credentials are not accepted in URL query parameters. Use POST with action=data."});
    }
    return json({ok:true,service:"NELVI Finance Control API",version:"1.0"});
  } catch(err) { Logger.log(err && err.stack ? err.stack : err); return json({ok:false,error:"Unable to complete the request. Check Apps Script execution logs and server configuration."}); }
}

function doPost(e) {
  try {
    const b = JSON.parse((e.postData && e.postData.contents) || "{}");
    switch(b.action) {
      case "login": return json(login(b));
      case "data": return json(getAuthorizedData(b));
      case "createTransaction": return json(createTransaction(b));
      case "updateTransaction": return json(updateTransaction(b));
      case "deleteTransaction": return json(deleteTransaction(b));
      case "verifyTransaction": return json(verifyTransaction(b));
      case "createMember": return json(createMember(b));
      default: return json({ok:false,error:"Unknown action"});
    }
  } catch(err) { Logger.log(err && err.stack ? err.stack : err); return json({ok:false,error:"Unexpected server error. Check Apps Script execution logs."}); }
}

function ss() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.indexOf("PASTE_") === 0)
    throw new Error("Set SPREADSHEET_ID in Apps Script.");
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function setupSheets() {
  const book=ss();
  ensureSheet(book,"Members",MEMBER_HEADERS);
  ensureSheet(book,"Transactions",TX_HEADERS);
  ensureSheet(book,"AuditLog",AUDIT_HEADERS);
}
function ensureSheet(book,name,headers) {
  let sh=book.getSheetByName(name);
  const created = !sh;
  if(!sh) sh=book.insertSheet(name);
  if(sh.getLastRow()===0) sh.appendRow(headers);
  else {
    const actual = sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0].map(v => String(v).trim());
    const check = validateSheetHeaders(actual,headers);
    if (!check.ok) throw new Error(name + " sheet columns do not match the required header order. Back up the sheet, restore the documented headers, and do not delete existing records.");
  }
  // Avoid rewriting the whole PIN column on every request; set it only when the format isn't already text.
  if (name === "Members" && (created || sh.getRange(1,4).getNumberFormat() !== "@")) sh.getRange(1,4,Math.max(1,sh.getMaxRows()),1).setNumberFormat("@");
  return sh;
}

function validateSheetHeaders(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return {ok:false};
  for (let i=0;i<expected.length;i++) if (String(actual[i]).trim() !== expected[i]) return {ok:false};
  return {ok:true};
}

function isValidBase64Payload(encoded) {
  return typeof encoded === "string" && encoded.length > 0 && encoded.length % 4 !== 1 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded);
}

function readMembers(includePin) {
  setupSheets();
  const sh=ss().getSheetByName("Members"), values=sh.getDataRange().getValues();
  if(values.length<2) return [];
  const h=values.shift();
  return values.filter(r=>r.join("")!=="").map(r=>{
    const o={}; h.forEach((k,i)=>o[k]=r[i]); return includePin?o:sanitizeMember(o);
  });
}
function sanitizeMember(m){const o=Object.assign({},m);delete o.pin;return o;}
function readTransactions() {
  setupSheets();
  const sh=ss().getSheetByName("Transactions"), values=sh.getDataRange().getValues();
  if(values.length<2) return [];
  const h=values.shift();
  return values.filter(r=>r.join("")!=="").map(r=>{
    const o={};h.forEach((k,i)=>o[k]=r[i]);return o;
  });
}

function isActiveMember(member) {
  return String(member && member.status || "Active").trim().toLowerCase() !== "inactive";
}

function normalizeDateOnly(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/);
  if (!match) return "";
  const dateText = match[1];
  const parts = dateText.split("-").map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return d.getUTCFullYear() === parts[0] && d.getUTCMonth() === parts[1] - 1 && d.getUTCDate() === parts[2] ? dateText : "";
}

function safeFinanceText(value, label, maxLength, required) {
  const text = String(value == null ? "" : value).trim();
  if (required && !text) return {ok:false,error:label + " is required."};
  if (text.length > maxLength) return {ok:false,error:label + " must be " + maxLength + " characters or fewer."};
  // Google Sheets can interpret text beginning with '=' as a formula. Reject it at the API boundary.
  if (/^\s*[=+\-@]/.test(text)) return {ok:false,error:label + " cannot begin with a spreadsheet formula marker."};
  return {ok:true,value:text};
}

function validateTransactionFields(transaction) {
  const t = transaction || {};
  const amount = Number(t.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    return {ok:false,error:"Amount must be positive INR with no more than 2 decimal places."};
  }
  if (t.type !== "inflow" && t.type !== "outflow") return {ok:false,error:"Transaction type must be inflow or outflow."};
  const date = normalizeDateOnly(t.date);
  if (!date) return {ok:false,error:"Enter a valid transaction date in YYYY-MM-DD format."};
  const category = safeFinanceText(t.category,"Category",80,true);
  const method = safeFinanceText(t.paymentMethod,"Payment method",40,true);
  const purpose = safeFinanceText(t.purpose,"Purpose",500,true);
  const referenceId = safeFinanceText(t.referenceId,"Reference ID",120,true);
  for (const field of [category,method,purpose,referenceId]) if (!field.ok) return field;
  return {ok:true,amount:Math.round(amount * 100) / 100,date:date,category:category.value,paymentMethod:method.value,purpose:purpose.value,referenceId:referenceId.value};
}

function authorize(accessKey,memberId,pin) {
  if (!ACCESS_KEY || String(ACCESS_KEY).indexOf("PASTE_") === 0 || accessKey !== ACCESS_KEY) return {ok:false,error:"Invalid common access key or the server access key is not configured."};
  const m = readMembers(true).find(x => String(x.memberId).trim() === String(memberId).trim() && String(x.pin) === String(pin) && isActiveMember(x));
  return m ? {ok:true,member:m} : {ok:false,error:"Invalid member PIN or inactive member."};
}

function getAuthorizedData(b) {
  const a = authorize(b.accessKey,b.memberId,b.pin);
  if (!a.ok) return a;
  return {ok:true,members:readMembers(false),transactions:readTransactions()};
}

function login(b) {
  const a=authorize(b.accessKey,b.memberId,b.pin);
  if(!a.ok)return a;
  return {ok:true,member:sanitizeMember(a.member),members:readMembers(false),transactions:readTransactions()};
}

function proofMatchesMime(bytes, mime) {
  const u = index => (Number(bytes[index]) + 256) % 256;
  if (mime === "image/jpeg") return bytes.length >= 3 && u(0) === 0xFF && u(1) === 0xD8 && u(2) === 0xFF;
  if (mime === "image/png") return bytes.length >= 8 && u(0) === 0x89 && u(1) === 0x50 && u(2) === 0x4E && u(3) === 0x47 && u(4) === 0x0D && u(5) === 0x0A && u(6) === 0x1A && u(7) === 0x0A;
  if (mime === "image/webp") return bytes.length >= 12 && String.fromCharCode(u(0),u(1),u(2),u(3)) === "RIFF" && String.fromCharCode(u(8),u(9),u(10),u(11)) === "WEBP";
  if (mime === "application/pdf") return bytes.length >= 5 && String.fromCharCode(u(0),u(1),u(2),u(3),u(4)) === "%PDF-";
  return false;
}

function transactionVersionToken(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  const text = String(value == null ? "" : value).trim();
  const timestamp = Date.parse(text);
  return text && Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : text;
}

function canEditTransaction(ownerId, actorMemberId, actorRole, status) {
  const isAdmin = String(actorRole) === "Finance Admin";
  if (!isAdmin && String(ownerId) !== String(actorMemberId)) return false;
  if (!isAdmin && String(status || "").trim().toLowerCase() !== "pending") return false;
  return true;
}

function withScriptLock(work) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return {ok:false,error:"Another finance update is in progress. Please retry."};
  try { return work(); } finally { lock.releaseLock(); }
}

function createTransaction(b) {
  const a = authorize(b.accessKey,b.actorId,b.pin);
  if (!a.ok) return a;
  const t = Object.assign({},b.transaction || {});
  const validation = validateTransactionFields(t);
  if (!validation.ok) return validation;
  t.amount = validation.amount;
  t.date = validation.date;
  t.category = validation.category;
  t.paymentMethod = validation.paymentMethod;
  t.purpose = validation.purpose;
  t.referenceId = validation.referenceId;
  t.transactionId = Utilities.getUuid();
  t.ownerId = a.member.memberId;
  t.ownerName = a.member.name;
  t.role = a.member.role;
  t.createdAt = new Date().toISOString();
  t.status = "Pending";

  const proof = b.proof || {};
  const encoded = String(proof.base64 || "").replace(/\s/g, "");
  const mime = String(proof.mimeType || "").toLowerCase();
  const allowedMime = ["image/jpeg","image/png","image/webp","application/pdf"];
  const maxEncodedLength = Math.ceil(5 * 1024 * 1024 / 3) * 4 + 8;
  if (!encoded || encoded.length > maxEncodedLength || !isValidBase64Payload(encoded)) return {ok:false,error:"Payment proof is required and must be a valid base64 file no larger than 5 MB."};
  if (allowedMime.indexOf(mime) === -1) return {ok:false,error:"Payment proof must be JPG, PNG, WebP or PDF."};

  let bytes;
  try { bytes = Utilities.base64Decode(encoded); } catch (err) { return {ok:false,error:"Payment proof could not be decoded."}; }
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) return {ok:false,error:"Payment proof must be between 1 byte and 5 MB."};
  if (!proofMatchesMime(bytes,mime)) return {ok:false,error:"The file content does not match the selected proof file type."};
  const originalName = String(proof.fileName || ("proof-" + t.transactionId)).split(/[\\/]/).pop();
  const safeName = originalName.replace(/[^A-Za-z0-9._() -]/g,"_").slice(0,120) || ("proof-" + t.transactionId);
  let proofId = "", proofName = "";
  try {
    const blob = Utilities.newBlob(bytes,mime,safeName);
    const file = getProofFolder().createFile(blob);
    proofId = file.getId(); proofName = file.getName();
  } catch (err) { return {ok:false,error:"Payment proof upload failed. Check Google Drive permissions."}; }
  if (!proofId) return {ok:false,error:"Payment proof is required."};
  t.proofFileId = proofId; t.proofFileName = proofName;
  try {
    ss().getSheetByName("Transactions").appendRow(TX_HEADERS.map(k => t[k] === undefined ? "" : t[k]));
  } catch (err) {
    Logger.log(err && err.stack ? err.stack : err);
    try { DriveApp.getFileById(proofId).setTrashed(true); }
    catch (cleanupErr) { Logger.log("Proof cleanup failed for " + proofId + ": " + (cleanupErr && cleanupErr.stack ? cleanupErr.stack : cleanupErr)); }
    return {ok:false,error:"The transaction could not be saved to Google Sheets. Proof cleanup was attempted; check Drive and Apps Script logs before retrying."};
  }
  const auditOk = auditSafely("CREATE",t.transactionId,a.member.memberId,`${t.type} ${t.amount}`);
  return {ok:true,warning:auditOk?"":"Transaction saved, but the audit log write failed. Ask the Finance Admin to check Apps Script logs.",transactions:readTransactions()};
}

function updateTransaction(b) {
  const a = authorize(b.accessKey,b.actorId,b.pin);
  if (!a.ok) return a;
  return withScriptLock(function() {
    const sh = ss().getSheetByName("Transactions");
    const rows = sh.getDataRange().getValues();
    const h = rows[0];
    const idColumn = h.indexOf("transactionId");
    const idx = rows.findIndex((r,i) => i > 0 && String(r[idColumn]) === String(b.transactionId));
    if (idx < 1) return {ok:false,error:"Transaction not found."};
    const owner = String(rows[idx][h.indexOf("ownerId")]);
    const rowStatus = String(rows[idx][h.indexOf("status")]).trim();
    if (!canEditTransaction(owner,a.member.memberId,a.member.role,rowStatus)) {
      if (owner === String(a.member.memberId) && a.member.role !== "Finance Admin") return {ok:false,error:"Owners can edit only Pending transactions. Ask Finance Admin to correct a reviewed entry."};
      return {ok:false,error:"Permission denied."};
    }
    const updatedAtIndex = h.indexOf("updatedAt"), createdAtIndex = h.indexOf("createdAt");
    const currentVersion = transactionVersionToken((updatedAtIndex >= 0 && rows[idx][updatedAtIndex]) || (createdAtIndex >= 0 && rows[idx][createdAtIndex]) || "");
    if (transactionVersionToken(b.expectedUpdatedAt) !== currentVersion) return {ok:false,error:"This transaction changed after you opened it. Sync and review the latest version before saving."};
    const patch = b.patch || {};
    const allowed = ["date","type","amount","category","paymentMethod","purpose","referenceId"];
    const patchKeys = Object.keys(patch);
    if (!patchKeys.length || patchKeys.some(k => allowed.indexOf(k) === -1)) return {ok:false,error:"Only date, type, amount, category, payment method, purpose and reference can be edited."};
    const current = {};
    h.forEach((key,i) => current[key] = rows[idx][i]);
    const next = Object.assign({},current,patch);
    const validation = validateTransactionFields(next);
    if (!validation.ok) return validation;
    next.amount = validation.amount; next.date = validation.date; next.category = validation.category;
    next.paymentMethod = validation.paymentMethod; next.purpose = validation.purpose; next.referenceId = validation.referenceId;
    // All financial edits invalidate any previous approval. Review metadata is reset server-side.
    next.status = "Pending";
    next.verifiedBy = ""; next.verifiedAt = ""; next.updatedAt = new Date().toISOString();
    h.forEach((key,i) => { if (Object.prototype.hasOwnProperty.call(next,key)) rows[idx][i] = next[key]; });
    sh.getRange(idx+1,1,1,h.length).setValues([rows[idx]]);
    const auditOk = auditSafely("UPDATE",b.transactionId,a.member.memberId,"Owner/admin update; reset to Pending for re-verification");
    return {ok:true,warning:auditOk?"":"Transaction updated, but the audit log write failed. Ask the Finance Admin to check Apps Script logs.",transactions:readTransactions()};
  });
}

function deleteTransaction(b) {
  const a = authorize(b.accessKey,b.actorId,b.pin);
  if (!a.ok) return a;
  return withScriptLock(function() {
    const sh = ss().getSheetByName("Transactions"), rows = sh.getDataRange().getValues(), h = rows[0];
    const idx = rows.findIndex((r,i) => i > 0 && String(r[h.indexOf("transactionId")]) === String(b.transactionId));
    if (idx < 1) return {ok:false,error:"Transaction not found."};
    const owner = String(rows[idx][h.indexOf("ownerId")]);
    if (owner !== String(a.member.memberId) && a.member.role !== "Finance Admin") return {ok:false,error:"Permission denied."};
    if (String(rows[idx][h.indexOf("status")]).trim().toLowerCase() !== "pending") return {ok:false,error:"Only pending transactions can be deleted. Edit a reviewed entry to return it to Pending, or keep it for audit history."};
    const proofId = String(rows[idx][h.indexOf("proofFileId")] || "");
    sh.deleteRow(idx+1);
    const auditOk = auditSafely("DELETE",b.transactionId,a.member.memberId,"Pending transaction deleted; proof retained in Drive" + (proofId ? " (proof file retained)" : ""));
    return {ok:true,warning:auditOk?"":"Transaction deleted, but the audit log write failed. Ask the Finance Admin to check Apps Script logs.",transactions:readTransactions()};
  });
}

function verifyTransaction(b) {
  const a = authorize(b.accessKey,b.actorId,b.pin);
  if (!a.ok) return a;
  if (a.member.role !== "Finance Admin") return {ok:false,error:"Finance Admin permission required."};
  if (b.status !== "Verified" && b.status !== "Rejected") return {ok:false,error:"Status must be Verified or Rejected."};
  return withScriptLock(function() {
    const sh = ss().getSheetByName("Transactions");
    const rows = sh.getDataRange().getValues();
    const h = rows[0];
    const idx = rows.findIndex((r,i) => i > 0 && String(r[h.indexOf("transactionId")]) === String(b.transactionId));
    if (idx < 1) return {ok:false,error:"Transaction not found."};
    if (String(rows[idx][h.indexOf("status")]).trim().toLowerCase() !== "pending") return {ok:false,error:"Only pending transactions can be reviewed."};
    const now = new Date().toISOString();
    rows[idx][h.indexOf("status")] = b.status;
    rows[idx][h.indexOf("verifiedBy")] = a.member.memberId;
    rows[idx][h.indexOf("verifiedAt")] = now;
    rows[idx][h.indexOf("updatedAt")] = now;
    sh.getRange(idx+1,1,1,h.length).setValues([rows[idx]]);
    const auditOk = auditSafely(b.status === "Rejected" ? "REJECT" : "VERIFY",b.transactionId,a.member.memberId,b.status);
    return {ok:true,warning:auditOk?"":"Review status saved, but the audit log write failed. Ask the Finance Admin to check Apps Script logs.",transactions:readTransactions()};
  });
}

function createMember(b) {
  const a = authorize(b.accessKey,b.actorId,b.pin);
  if (!a.ok) return a;
  if (a.member.role !== "Finance Admin") return {ok:false,error:"Finance Admin permission required."};
  return withScriptLock(function() {
    const m = b.member || {};
    const memberId = String(m.memberId || "").trim().toUpperCase();
    const name = String(m.name || "").trim();
    const role = String(m.role || "").trim();
    const pin = String(m.pin || "");
    const roles = ["Founder","Co-Founder","Investor","Working Partner","Funder","Finance Admin"];
    if (!/^[A-Z0-9_-]{2,24}$/.test(memberId)) return {ok:false,error:"Member ID must be 2–24 letters, numbers, underscores or hyphens."};
    const safeName = safeFinanceText(name,"Name",100,true);
    if (!safeName.ok) return safeName;
    if (roles.indexOf(role) === -1) return {ok:false,error:"Select a valid team role."};
    if (!/^\d{4,8}$/.test(pin)) return {ok:false,error:"PIN must be 4–8 digits."};
    const existing = readMembers(true);
    if (existing.some(x => String(x.memberId).trim().toUpperCase() === memberId)) return {ok:false,error:"Member ID already exists."};
    if (existing.some(x => String(x.pin) === pin && isActiveMember(x))) return {ok:false,error:"Use a unique PIN for each active member."};
    const row = {memberId:memberId,name:safeName.value,role:role,pin:pin,status:"Active",createdAt:new Date().toISOString()};
    ss().getSheetByName("Members").appendRow(MEMBER_HEADERS.map(k => row[k] === undefined ? "" : row[k]));
    const auditOk = auditSafely("CREATE_MEMBER",row.memberId,a.member.memberId,row.role);
    return {ok:true,warning:auditOk?"":"Profile saved, but the audit log write failed. Ask the Finance Admin to check Apps Script logs.",members:readMembers(false)};
  });
}

function getProofFolder(){
  const it=DriveApp.getFoldersByName(PROOF_FOLDER_NAME);
  return it.hasNext()?it.next():DriveApp.createFolder(PROOF_FOLDER_NAME);
}
function audit(action,transactionId,actorId,details){
  ss().getSheetByName("AuditLog").appendRow([Utilities.getUuid(),action,transactionId,actorId,details,new Date().toISOString()]);
}
function auditSafely(action,transactionId,actorId,details){
  try { audit(action,transactionId,actorId,details); return true; }
  catch (err) { Logger.log("Audit write failed for " + action + " / " + transactionId + ": " + (err && err.stack ? err.stack : err)); return false; }
}
function json(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
