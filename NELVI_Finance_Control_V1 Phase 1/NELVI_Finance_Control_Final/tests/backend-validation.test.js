const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script', 'Code.gs'), 'utf8') + '\n;globalThis.__test = {validateTransactionFields, proofMatchesMime, safeFinanceText, isActiveMember, transactionVersionToken, validateSheetHeaders, isValidBase64Payload, canEditTransaction, withScriptLock};';
let locked = true, released = false;
const context = {
  console,
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ tryLock: () => locked, releaseLock: () => { released = true; } }) },
  Utilities: { formatDate: (d, zone, fmt) => d.toISOString().slice(0,10) },
  Session: { getScriptTimeZone: () => 'UTC' },
};
vm.createContext(context);
vm.runInContext(code, context, { filename: 'Code.gs' });
const b = context.__test;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`✓ ${name}`); }
const valid = {type:'outflow',amount:'150.25',date:'2026-10-26',category:'Materials',paymentMethod:'UPI',purpose:'Packaging purchase',referenceId:'UTR123456'};

test('backend accepts a valid two-decimal transaction', () => {
  const r = b.validateTransactionFields(valid);
  assert.equal(r.ok, true); assert.equal(r.amount, 150.25); assert.equal(r.date, '2026-10-26');
});
test('backend rejects over-precision, zero and excessive transaction amount', () => {
  assert.equal(b.validateTransactionFields({...valid,amount:'1.234'}).ok, false);
  assert.equal(b.validateTransactionFields({...valid,amount:0}).ok, false);
  assert.equal(b.validateTransactionFields({...valid,amount:1000000000000}).ok, false);
});
test('backend rejects invalid dates and transaction types', () => {
  assert.equal(b.validateTransactionFields({...valid,date:'2026-02-30'}).ok, false);
  assert.equal(b.validateTransactionFields({...valid,type:'transfer'}).ok, false);
});
test('backend validates required and bounded text fields', () => {
  assert.equal(b.validateTransactionFields({...valid,purpose:''}).ok, false);
  assert.equal(b.validateTransactionFields({...valid,category:'x'.repeat(81)}).ok, false);
  for (const marker of ['=IMPORTXML(...)','+SUM(A1:A2)','-1+2','@cmd']) assert.equal(b.validateTransactionFields({...valid,referenceId:marker}).ok, false);
});
test('backend treats inactive status case-insensitively', () => {
  assert.equal(b.isActiveMember({status:'INACTIVE'}), false);
  assert.equal(b.isActiveMember({status:'inactive'}), false);
  assert.equal(b.isActiveMember({status:'Active'}), true);
  assert.equal(b.isActiveMember({}), true);
});
test('backend validates strict base64 padding and alphabet', () => {
  for (const text of ['AQ==','AQI=','AQID','YWJjZGVm']) assert.equal(b.isValidBase64Payload(text), true);
  for (const text of ['', 'A===', 'AQ=', 'abc$', 'AA==AA==']) assert.equal(b.isValidBase64Payload(text), false);
});
test('existing sheet headers must match the schema and order', () => {
  assert.equal(b.validateSheetHeaders(['memberId','name','role','pin','status','createdAt'], ['memberId','name','role','pin','status','createdAt']).ok, true);
  assert.equal(b.validateSheetHeaders(['name','memberId','role','pin','status','createdAt'], ['memberId','name','role','pin','status','createdAt']).ok, false);
  assert.equal(b.validateSheetHeaders(['memberId','name'], ['memberId','name','role']).ok, false);
});
test('backend checks proof file signatures, not just client MIME', () => {
  assert.equal(b.proofMatchesMime([0xFF,0xD8,0xFF,0xE0],'image/jpeg'), true);
  assert.equal(b.proofMatchesMime([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A],'image/png'), true);
  assert.equal(b.proofMatchesMime(Array.from(Buffer.from('%PDF-1.7')),'application/pdf'), true);
  assert.equal(b.proofMatchesMime(Array.from(Buffer.from('RIFFxxxxWEBP')),'image/webp'), true);
  assert.equal(b.proofMatchesMime([1,2,3,4,5],'application/pdf'), false);
});
test('only admins can edit reviewed transactions; owners can edit pending entries only', () => {
  assert.equal(b.canEditTransaction('A','A','Founder','Pending'), true);
  assert.equal(b.canEditTransaction('A','A','Founder','Verified'), false);
  assert.equal(b.canEditTransaction('A','B','Founder','Pending'), false);
  assert.equal(b.canEditTransaction('A','B','Finance Admin','Verified'), true);
});
test('transaction version tokens normalize ISO timestamps and Date cells', () => {
  const expected = '2026-10-26T07:30:00.000Z';
  assert.equal(b.transactionVersionToken(expected), expected);
  assert.equal(b.transactionVersionToken(new Date(expected)), expected);
  assert.notEqual(b.transactionVersionToken('2026-10-26T07:31:00.000Z'), expected);
});
test('server lock releases after work and fails closed when busy', () => {
  released = false; locked = true;
  assert.deepEqual(JSON.parse(JSON.stringify(b.withScriptLock(() => ({ok:true})))), {ok:true});
  assert.equal(released, true);
  locked = false;
  assert.equal(b.withScriptLock(() => ({ok:true})).ok, false);
});
console.log(`\n${passed} backend validation tests passed.`);
