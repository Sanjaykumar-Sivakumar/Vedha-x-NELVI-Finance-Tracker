from html.parser import HTMLParser
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
class AuditParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=[]; self.scripts=[]; self.errors=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if 'id' in a: self.ids.append(a['id'])
        if tag=='script' and a.get('src'): self.scripts.append(a['src'])

html=(ROOT/'index.html').read_text(encoding='utf-8')
p=AuditParser(); p.feed(html); p.close()
duplicates=sorted({x for x in p.ids if p.ids.count(x)>1})
assert not duplicates, f'duplicate IDs: {duplicates}'
assert p.scripts.index('finance-utils.js') < p.scripts.index('app.js'), 'finance utils must load before app.js'
assert 'id="editModal"' in html and 'id="editForm"' in html, 'edit transaction dialog/form missing'
assert '<label class="full">Transaction / UTR ID *<input id="fRef" required' in html, 'reference should be required in UI'
css=(ROOT/'styles.css').read_text(encoding='utf-8')
assert '.bar{width:13px;border-radius:5px 5px 2px 2px;min-height:0}' in css, 'zero bar visual minimum is incorrect'
for breakpoint in ['1100px','720px','390px']:
    assert f'max-width:{breakpoint}' in css, f'missing responsive breakpoint {breakpoint}'
app=(ROOT/'app.js').read_text(encoding='utf-8')
backend=(ROOT/'google-apps-script'/'Code.gs').read_text(encoding='utf-8')
assert 'finance.topCategoriesWithOther(all,5)' in app
assert 'finance.sumRupees' in app
assert 'finance.sortNewest(transactions)' in app
assert 'data-action="edit"' in app
assert 'withScriptLock' in backend and 'proofMatchesMime' in backend and 'validateSheetHeaders' in backend
assert 'canEditTransaction' in backend and 'auditSafely' in backend and 'setTrashed(true)' in backend
assert 'form.reset();if(memberTrigger' in app, 'member dialog should clear the PIN field on close'
assert 't.status = "Pending";' in backend, 'new transactions should start Pending for all roles'
assert '.donut-center-content' in css and '.donut-caption' in css, 'donut value/caption containment styles missing'
assert '.nav.active span' in css and '#0d3521' in css, 'premium high-contrast sidebar refinement missing'
assert 'donut-center-content' in app and 'donut-caption' in app, 'donut template needs separate value and caption elements'
assert 'Only pending transactions can be deleted' in backend
assert 'expectedUpdatedAt' in app and 'transactionVersionToken' in backend, 'optimistic transaction version check missing'
assert 'statusClass(t.status)' in app, 'untrusted status value should not be inserted directly into class attributes'
assert 'From date must be on or before To date.' in app
assert 'const allowed = ["date","type","amount","category","paymentMethod","purpose","referenceId"]' in backend
print(f'HTML parsed; {len(p.ids)} unique IDs; script order and responsive/finance/security invariants passed.')
