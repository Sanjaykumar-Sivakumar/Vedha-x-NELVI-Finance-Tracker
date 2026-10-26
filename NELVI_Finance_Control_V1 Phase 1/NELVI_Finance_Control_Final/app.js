let cfg=window.NELVI_CONFIG||{};
let currentUser=null, members=[], transactions=[], selectedProfile=null, parsed=null, editTrigger=null, memberTrigger=null, currentPage="dashboard", syncPromise=null, activeWrites=0, dataRevision=0, syncTimer=null;
const CONNECTION_STORAGE_KEY="nelviFinanceConnectionV1";
function loadSavedConnection(){
 try{const saved=JSON.parse(localStorage.getItem(CONNECTION_STORAGE_KEY)||"{}");cfg.SCRIPT_URL=cfg.SCRIPT_URL||saved.SCRIPT_URL||"";cfg.SPREADSHEET_ID=cfg.SPREADSHEET_ID||saved.SPREADSHEET_ID||"";}catch(_){/* ignore invalid saved connection */}
}
function persistConnection(){
 try{localStorage.setItem(CONNECTION_STORAGE_KEY,JSON.stringify({SCRIPT_URL:cfg.SCRIPT_URL,SPREADSHEET_ID:cfg.SPREADSHEET_ID}));}catch(_){toast("Connection could not be saved in this browser. Keep this tab open or check browser storage settings.")}
}
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const finance=window.NelviFinance;
const money=n=>finance.formatRupees(n);
const sumMoney=(items,predicate=()=>true)=>finance.sumRupees(items,predicate);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const txId=()=>`NELVI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
const fmt=d=>{const x=new Date(String(d||"").slice(0,10)+"T00:00:00");return Number.isNaN(x.getTime())?"—":x.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})};
const memberById=id=>members.find(m=>String(m.memberId||m.id)===String(id));
const statusClass=status=>({Pending:"pending",Verified:"verified",Rejected:"rejected"}[String(status||"")]||"unknown");
const toast=m=>{const t=$("#toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500)};
function show(id){["setupView","loginView","appView"].forEach(x=>$("#"+x).classList.add("hidden"));$("#"+id).classList.remove("hidden")}
function configured(){return !!(cfg.SCRIPT_URL&&cfg.SPREADSHEET_ID)}
async function api(action,payload={}){
 const isWrite=["createTransaction","updateTransaction","deleteTransaction","verifyTransaction","createMember"].includes(action);
 if(isWrite){activeWrites++;dataRevision++;}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const r=await fetch(cfg.SCRIPT_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(Object.assign({action},payload)),signal:controller.signal});
  if(!r.ok)throw new Error(`Server request failed (HTTP ${r.status}).`);
  const d=await r.json();if(!d.ok)throw new Error(d.error||"Request failed");return d;
 }catch(error){if(error&&error.name==="AbortError")throw new Error("The server took too long to respond. Check the connection and retry.");throw error;}finally{clearTimeout(timer);if(isWrite)activeWrites=Math.max(0,activeWrites-1)}
}
async function bootstrap(){
 const select=$("#memberSelect");
 if(select){select.disabled=true;select.innerHTML='<option value="">Loading team members…</option>';}
 try{
  if(!configured())throw new Error("Enter the Apps Script Web App URL and Spreadsheet ID first.");
  const url=cfg.SCRIPT_URL.trim();
  if(!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(url))throw new Error("The Web App URL should be the deployed Google Apps Script URL ending in /exec.");
  const r=await fetch(`${url}${url.includes("?")?"&":"?"}action=bootstrap&spreadsheetId=${encodeURIComponent(cfg.SPREADSHEET_ID)}`);
  if(!r.ok)throw new Error(`Connection request failed (HTTP ${r.status}). Check the deployment access settings.`);
  const d=await r.json();if(!d.ok)throw new Error(d.error||"Apps Script returned an error.");
  if(d.spreadsheetId&&String(d.spreadsheetId)!==String(cfg.SPREADSHEET_ID))throw new Error("The Spreadsheet ID entered on this website does not match the ID configured in Code.gs. Update SPREADSHEET_ID in Apps Script and deploy a new version.");
  members=(d.members||[]).filter(m=>String(m.status||"Active").trim().toLowerCase()!=="inactive");
  if(select){
   select.innerHTML=members.length?'<option value="">Select your profile…</option>'+members.map(m=>`<option value="${escapeHtml(m.memberId)}">${escapeHtml(m.name)} · ${escapeHtml(m.role)}</option>`).join(""):'<option value="">No active team members found</option>';
   select.disabled=!members.length;
  }
  show("loginView");
  const err=$("#loginError");if(err)err.textContent=members.length?"":"No active members were returned. Add a member row in the Members sheet and check the Apps Script deployment.";
  if(!members.length)toast("Connection succeeded, but no active team members were found.");
 }catch(e){
  show("setupView");
  if($("#scriptUrl"))$("#scriptUrl").value=cfg.SCRIPT_URL||"";
  if($("#spreadsheetId"))$("#spreadsheetId").value=cfg.SPREADSHEET_ID||"";
  const err=$("#setupError");if(err)err.textContent="Connection issue: "+e.message;
  toast("Google Sheets connection failed: "+e.message);
 }
}
function saveConnection(){
 cfg.SCRIPT_URL=$("#scriptUrl").value.trim().replace(/\s+/g,"");cfg.SPREADSHEET_ID=$("#spreadsheetId").value.trim();
 if(!configured()){toast("Enter both the Apps Script URL and Spreadsheet ID.");return}
 persistConnection();
 bootstrap();
}
function markSynced(){const status=$("#syncStatus");if(status){const stamp=new Date();status.textContent="Synced "+stamp.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});status.title="Latest successful data update: "+stamp.toLocaleString("en-IN")}}
function escapeHtml(value){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}
function resetConnection(){
 if(!confirm("Change the Google Sheets connection? You will return to setup; existing Google Sheets data will not be deleted."))return;
 cfg.SCRIPT_URL="";cfg.SPREADSHEET_ID="";try{localStorage.removeItem(CONNECTION_STORAGE_KEY)}catch(_){}
 $("#scriptUrl").value="";$("#spreadsheetId").value="";show("setupView");
}

async function login(e){
 e.preventDefault();
 if(!configured()){show("setupView");toast("Set up the Google Sheets connection first.");return}
 if(!$("#memberSelect").value){toast("Select your team member profile first.");return}
 const submit=$("#loginForm button[type=submit]");if(submit){submit.disabled=true;submit.dataset.originalText=submit.textContent;submit.textContent="Signing in…"}
 try{
  const d=await api("login",{accessKey:$("#accessKey").value.trim(),memberId:$("#memberSelect").value,pin:$("#pin").value.trim()});
  currentUser=Object.assign({},d.member,{_pin:$("#pin").value.trim(),_accessKey:$("#accessKey").value.trim()});
  members=(d.members||members).filter(m=>String(m.status||"Active").trim().toLowerCase()!=="inactive");transactions=(d.transactions||[]).map(t=>({...t,amount:Number(t.amount)||0}));
  $("#currentName").textContent=currentUser.name;$("#currentRole").textContent=currentUser.role;$("#avatar").textContent=currentUser.name[0];
  show("appView");go("dashboard");toast(`Welcome, ${currentUser.name}.`);syncNow(true);
 }catch(e){toast("Sign in failed: "+e.message);const err=$("#loginError");if(err)err.textContent="Sign-in failed: "+e.message;}finally{if(submit){submit.disabled=false;submit.textContent=submit.dataset.originalText||"Sign in securely →"}}
}
function logout(){currentUser=null;transactions=[];if($("#syncStatus"))$("#syncStatus").textContent="Not synced";show("loginView");$("#accessKey").value="";$("#pin").value=""}
function go(page){
 const allowedPages=["dashboard","quick","transactions","team","profile","reports"];if(!allowedPages.includes(page))return;currentPage=page;
 $$(".nav").forEach(n=>{n.classList.toggle("active",n.dataset.page===page);if(n.dataset.page===page)n.setAttribute("aria-current","page");else n.removeAttribute("aria-current")});
 const titles={dashboard:"Overview",quick:"Quick Entry",transactions:"Transactions",team:"Team Profiles",profile:"Team Profile",reports:"Reports"};
 $("#pageTitle").textContent=titles[page]||"Overview";
 const tpl=document.getElementById(page+"Tpl");if(!tpl)return;
 $("#content").innerHTML="";$("#content").appendChild(tpl.content.cloneNode(true));
 if(page==="dashboard")dashboard(); if(page==="quick")quick(); if(page==="transactions")transactionPage(); if(page==="team")teamPage(); if(page==="profile")profilePage(); if(page==="reports")reportsPage();
}
function routeClick(e){
 const b=e.target.closest("[data-page]");if(b){e.preventDefault();go(b.dataset.page);return}
 const p=e.target.closest("[data-profile]");if(p){selectedProfile=p.dataset.profile;go("profile");return}
 const tab=e.target.closest("[data-entry]");if(tab){toggleEntry(tab.dataset.entry);return}
 const act=e.target.closest("[data-action]");if(act)handleAction(act.dataset.action,act.dataset.id);
}
function totals(){const ins=sumMoney(transactions,t=>t.type==="inflow"&&t.status==="Verified"),out=sumMoney(transactions,t=>t.type==="outflow"&&t.status==="Verified");return{ins,out,net:Math.round((ins-out)*100)/100,pending:transactions.filter(t=>t.status==="Pending").length}}
function dashboard(){const t=totals();$("#welcomeName").textContent=currentUser.name;$("#kIn").textContent=money(t.ins);$("#kOut").textContent=money(t.out);$("#kNet").textContent=money(t.net);$("#kPending").textContent=t.pending;renderBars();renderDonut();renderRanking($("#dashRanking"),5);renderRecent()}
function months(){const a=[],d=new Date();for(let i=5;i>=0;i--){const x=new Date(d.getFullYear(),d.getMonth()-i,1);a.push({key:`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}`,label:x.toLocaleDateString("en-IN",{month:"short"})})}return a}
function renderBars(){
 const ms=months();
 const vals=ms.map(m=>({label:m.label,ins:sumMoney(transactions,t=>t.type==="inflow"&&t.status==="Verified"&&finance.monthKey(t.date)===m.key),out:sumMoney(transactions,t=>t.type==="outflow"&&t.status==="Verified"&&finance.monthKey(t.date)===m.key)}));
 const max=Math.max(0,...vals.flatMap(v=>[v.ins,v.out]));
 $("#barChart").innerHTML=vals.map(v=>{const inH=max>0&&v.ins>0?Math.max(1,v.ins/max*88):0;const outH=max>0&&v.out>0?Math.max(1,v.out/max*88):0;return `<div class="bar-group"><div class="bar in" title="Inflow: ${money(v.ins)}" style="height:${inH}%"></div><div class="bar out" title="Outflow: ${money(v.out)}" style="height:${outH}%"></div><span class="bar-label">${escapeHtml(v.label)}</span></div>`}).join("")
}
function renderDonut(){
 const totals=new Map();
 transactions.filter(t=>t.type==="outflow"&&t.status==="Verified").forEach(t=>{const category=String(t.category||"Uncategorized");const amount=Number(t.amount)||0;if(Number.isFinite(amount)&&amount>0)totals.set(category,(totals.get(category)||0)+finance.toPaise(amount))});
 const all=[...totals.entries()].map(([category,paise])=>({category,amount:finance.fromPaise(paise)})).sort((a,b)=>b.amount-a.amount);
 const {items:breakdown,total}=finance.topCategoriesWithOther(all,5);
 if(!all.length||total<=0){$("#donut").innerHTML=`<div class="empty">No verified spending data yet.</div>`;return}
 const colors=["#174b2d","#2f7a45","#8a6048","#b58a32","#a8a79c","#7b8d82"];
 const items=breakdown.map((x,i)=>({...x,color:colors[Math.min(i,colors.length-1)]}));
 let cursor=0;const stops=items.map(x=>{const start=cursor;cursor+=x.amount/total*100;return `${x.color} ${start}% ${cursor}%`});
 $("#donut").innerHTML=`<div class="donut" role="img" aria-label="Verified spending by category, total ${escapeHtml(money(total))}" style="background:conic-gradient(${stops.join(",")})"><div class="donut-center"><div class="donut-center-content"><b>${escapeHtml(money(total))}</b><span class="donut-caption">Total verified spending</span></div></div></div><div class="legend">${items.map(x=>`<div><i style="background:${x.color}"></i>${escapeHtml(x.category)} · ${finance.percentage(x.amount,total,1).toFixed(1)}%</div>`).join("")}</div>`
}
function rankingData(){return members.map(m=>({m,v:sumMoney(transactions,t=>String(t.ownerId)===String(m.memberId)&&t.type==="inflow"&&t.status==="Verified")})).sort((a,b)=>b.v-a.v)}
function renderRanking(el,limit=99){const r=rankingData().slice(0,limit);el.innerHTML=r.map((x,i)=>`<div class="rank-row" data-profile="${escapeHtml(x.m.memberId)}"><div class="rank-num">${i+1}</div><div class="rank-avatar">${escapeHtml((x.m.name||"?")[0])}</div><div class="rank-main"><b>${escapeHtml(x.m.name)}</b><small>${escapeHtml(x.m.role)}</small></div><div class="rank-value"><b>${money(x.v)}</b><small>${i===0?"Highest":i===r.length-1?"Lowest":"Verified"}</small></div></div>`).join("")}
function renderRecent(){
 const r=finance.sortNewest(transactions).slice(0,5);
 $("#recent").innerHTML=r.length?r.map(t=>`<div class="activity-row"><div class="a-main"><b>${escapeHtml(t.purpose)}</b><small>${escapeHtml(t.ownerName)} · ${fmt(t.date)} · ${escapeHtml(t.status)}</small></div><strong class="${t.type==="inflow"?"in":"out"}">${t.type==="inflow"?"+":"−"}${money(t.amount)}</strong></div>`).join(""):`<div class="empty">No transactions yet.</div>`
}
function quick(){$("#fDate").value=today();$("#parseMessage").onclick=parseSmartMessage}
function toggleEntry(type){$$(".entry-tab").forEach(x=>x.classList.toggle("active",x.dataset.entry===type));$("#messageEntry").classList.toggle("hidden",type!=="message");$("#formEntry").classList.toggle("hidden",type!=="form")}
function parseSmartMessage(){
 const raw=$("#smartMessage").value.trim();if(!raw){toast("Paste the message first.");return}
 const parts=raw.split(/\s+(?:-|–|—|\|)\s+/).map(x=>x.trim()).filter(Boolean);
 const first=parts[0]||raw;
 const isInflow=/(money\s*in|investment\s*received|funds?\s*received|capital\s*received|inflow|received from|contribution received)/i.test(first);
 const amountMatch=raw.match(/(?:₹|rs\.?\s*|inr\s*)\s*([\d,]+(?:\.\d{1,2})?)|\b([\d,]+(?:\.\d{1,2})?)\s*(?:rupees|inr)\b/i);
 let amount=amountMatch?Number((amountMatch[1]||amountMatch[2]).replace(/,/g,"")):0;
 if(!amountMatch){const candidates=parts.map(x=>x.match(/^\s*([\d,]+(?:\.\d{1,2})?)\s*$/)).filter(Boolean);if(candidates.length)amount=Number(candidates[0][1].replace(/,/g,""))}
 const methods=["Bank Transfer","UPI","Cash","Card","Cheque","Other"];
 let method=methods.find(x=>new RegExp(x.replace(/\s+/g,"\\s+"),"i").test(raw))||"Other";
 const refMatch=raw.match(/(?:UTR|transaction\s*(?:ID|no\.?|number)|reference|ref(?:erence)?\s*ID)\s*[:#-]?\s*([A-Za-z0-9_-]+)/i);
 let ref=refMatch?refMatch[1]:"";
 const normalized=parts.map(x=>x.replace(/^₹\s*/,"").trim());
 let category="Other",purpose="",structured=parts.length>=5;
 if(structured){
   const amountIndex=parts.findIndex(x=>/₹|\b(?:rs\.?|inr)\b|^\s*[\d,]+(?:\.\d{1,2})?\s*$/.test(x));
   if(amountIndex>=1){category=parts[amountIndex-1]||"Other";purpose=parts[amountIndex+1]||"";method=parts[amountIndex+2]&&methods.find(x=>x.toLowerCase()===parts[amountIndex+2].toLowerCase())||method;ref=parts[amountIndex+3]||ref;}
 }
 const cats=["Capital / Investment","Raw Material","Product Purchase","Office / Electricity","Travel / Logistics","Marketing","Packaging","Salary / Partner Expense","Logistics","Equipment","Other"];
 const foundCat=cats.find(x=>raw.toLowerCase().includes(x.toLowerCase()));
 if(foundCat)category=foundCat;else if(structured&&parts.length>1&&category==="Other")category=parts[1]||"Other";
 if(!purpose){purpose=raw.replace(/^(?:today'?s\s*)?(?:spending|expense|payment|money\s*out|investment\s*received|funds?\s*received)(?:\s+for)?(?:\s+the)?(?:\s+company)?\s*[-:–—|]?/i,"").trim();if(amountMatch)purpose=purpose.replace(amountMatch[0],"").trim();if(ref)purpose=purpose.replace(new RegExp(ref.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i"),"");purpose=purpose.replace(/\b(UPI|Bank Transfer|Cash|Card|Cheque)\b/ig,"").replace(/^\s*[-–—|]+|[-–—|]+\s*$/g,"").trim()}
 if(!purpose)purpose=isInflow?"Company funds received":"Company expense";
 parsed={type:isInflow?"inflow":"outflow",amount,date:today(),category,method, purpose,ref};
 const preview=$("#parsePreview");preview.classList.remove("hidden");
 preview.innerHTML=`<div class="eyebrow">SYSTEM PREVIEW</div><h3 class="preview-title">Review the extracted details</h3><div class="preview-grid"><div><small>Transaction type</small><b>${parsed.type==="inflow"?"Money In":"Money Out"}</b></div><div><small>Amount</small><b>${money(amount)}</b></div><div><small>Category</small><b>${escapeHtml(category)}</b></div><div><small>Payment method</small><b>${escapeHtml(method)}</b></div><div><small>Purpose</small><b>${escapeHtml(purpose)}</b></div><div><small>Reference</small><b>${escapeHtml(ref||"Not detected")}</b></div><div><small>Owner</small><b>${escapeHtml(currentUser.name)}</b></div></div><p class="parse-warning">Please verify the amount, type and reference before continuing. A payment proof is required on the next step.</p><button class="primary-btn" id="confirmParsed" type="button">Continue to proof & final details →</button>`;
 $("#confirmParsed").onclick=()=>{toggleEntry("form");document.querySelector(`input[name="type"][value="${parsed.type}"]`).checked=true;$("#fAmount").value=parsed.amount||"";$("#fDate").value=parsed.date;$("#fCategory").value=parsed.category;$("#fMethod").value=parsed.method;$("#fPurpose").value=parsed.purpose;$("#fRef").value=parsed.ref;};
}
function fileBase64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res({base64:String(r.result).split(",")[1],mimeType:file.type,fileName:file.name});r.onerror=rej;r.readAsDataURL(file)})}
async function submitTx(e){
 e.preventDefault();const submitButton=$("#txForm button[type=submit]");if(submitButton?.disabled)return;const file=$("#fProof").files[0];if(!file){toast("Payment proof is required.");$("#fProof").focus();return}const allowedTypes=["image/jpeg","image/png","image/webp","application/pdf"];if(!allowedTypes.includes(file.type)){toast("Proof must be a JPG, PNG, WebP or PDF file.");$("#fProof").focus();return}if(file.size>5*1024*1024){toast("Proof file must be 5 MB or smaller.");$("#fProof").focus();return}if(!$("#fRef").value.trim()){toast("Transaction / UTR ID is required.");$("#fRef").focus();return}
 const amount=Number($("#fAmount").value);if(!Number.isFinite(amount)||amount<=0||amount>999999999999.99||Math.abs(amount*100-Math.round(amount*100))>0.000001){toast("Enter a positive INR amount with up to 2 decimal places.");$("#fAmount").focus();return}if(!$("#fDate").value){toast("Choose the transaction date.");$("#fDate").focus();return}if(!$("#fPurpose").value.trim()||$("#fPurpose").value.trim().length>500){toast("Purpose is required (maximum 500 characters).");$("#fPurpose").focus();return}
 const tx={transactionId:txId(),date:$("#fDate").value,ownerId:currentUser.memberId,ownerName:currentUser.name,role:currentUser.role,type:document.querySelector('input[name="type"]:checked').value,amount,category:$("#fCategory").value,paymentMethod:$("#fMethod").value,purpose:$("#fPurpose").value.trim(),referenceId:$("#fRef").value.trim()};
 const submit=$("#txForm button[type=submit]");if(submit){submit.disabled=true;submit.dataset.label=submit.textContent;submit.textContent="Saving transaction…"}
 try{const d=await api("createTransaction",{accessKey:currentUser._accessKey,actorId:currentUser.memberId,pin:currentUser._pin,transaction:tx,proof:await fileBase64(file)});transactions=(d.transactions||[]).map(t=>({...t,amount:Number(t.amount)||0}));markSynced();toast(d.warning||"Transaction saved to Google Sheets.");go("transactions")}catch(err){toast("Save failed: "+err.message)}finally{if(submit){submit.disabled=false;submit.textContent=submit.dataset.label||"Submit for verification →"}}
}
function refreshTransactionFilterOptions(){
 const cat=$("#fc");if(cat){const selected=cat.value;const categories=[...new Set(transactions.map(t=>String(t.category||"Uncategorized")))].sort();cat.innerHTML='<option value="">All categories</option>'+categories.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");cat.value=selected}
 const member=$("#fm");if(member){const selected=member.value;member.innerHTML='<option value="">All members</option>'+members.map(m=>`<option value="${escapeHtml(m.memberId)}">${escapeHtml(m.name)}</option>`).join("");member.value=selected}
}

function transactionPage(){
 ["q","ft","fs","fdFrom","fdTo","fc","fm"].forEach(id=>{const el=$("#"+id);if(el)el.addEventListener(id==="q"?"input":"change",renderTx)});
 refreshTransactionFilterOptions();
 const reset=$("#resetFilters");if(reset)reset.onclick=()=>{["q","ft","fs","fdFrom","fdTo","fc","fm"].forEach(id=>{const el=$("#"+id);if(el)el.value=""});renderTx()};
 const exportBtn=$("#exportExcel");if(exportBtn)exportBtn.onclick=exportExcel;renderTx()
}
function filtered(){
 const q=($("#q")?.value||"").trim().toLowerCase(),ft=$("#ft")?.value||"",fs=$("#fs")?.value||"",from=$("#fdFrom")?.value||"",to=$("#fdTo")?.value||"",category=$("#fc")?.value||"",member=$("#fm")?.value||"";
 return transactions.filter(t=>{const date=String(t.date||"").slice(0,10);return (!q||[t.transactionId,t.ownerName,t.purpose,t.category,t.referenceId].join(" ").toLowerCase().includes(q))&&(!ft||t.type===ft)&&(!fs||t.status===fs)&&(!from||date>=from)&&(!to||date<=to)&&(!category||String(t.category||"Uncategorized")===category)&&(!member||String(t.ownerId)===member)})
}
function renderTx(){const from=$("#fdFrom")?.value||"",to=$("#fdTo")?.value||"";if(from&&to&&from>to){$("#txTable").innerHTML=`<div class="empty" role="alert">From date must be on or before To date.</div>`;return}const rows=filtered();$("#txTable").innerHTML=rows.length?`<table class="table"><thead><tr><th>ID</th><th>Date</th><th>Owner</th><th>Type</th><th>Purpose</th><th>Amount</th><th>Reference</th><th>Status</th><th>Access</th></tr></thead><tbody>${rows.map(t=>{const own=String(t.ownerId)===String(currentUser.memberId),admin=currentUser.role==="Finance Admin";let action=(own||admin)?`${(admin||t.status==="Pending")?`<button class="action-btn" data-action="edit" data-id="${escapeHtml(t.transactionId)}">Edit</button>`:""} ${t.status==="Pending"?`<button class="action-btn" data-action="delete" data-id="${escapeHtml(t.transactionId)}">Delete</button>`:""}`:`<span style="color:#9aa39d">View only</span>`;if(admin&&t.status==="Pending")action+=` <button class="action-btn" data-action="verify" data-id="${escapeHtml(t.transactionId)}">Verify</button> <button class="action-btn" data-action="reject" data-id="${escapeHtml(t.transactionId)}">Reject</button>`;return `<tr><td><b>${escapeHtml(t.transactionId)}</b><small>${escapeHtml(t.proofFileName||"Proof in Drive")}</small></td><td>${fmt(t.date)}</td><td><b>${escapeHtml(t.ownerName)}</b><small>${escapeHtml(t.role)}</small></td><td><span class="pill ${t.type==="inflow"?"in":"out"}">${t.type==="inflow"?"MONEY IN":"MONEY OUT"}</span></td><td><b>${escapeHtml(t.purpose)}</b><small>${escapeHtml(t.category)} · ${escapeHtml(t.paymentMethod)}</small></td><td class="${t.type==="inflow"?"in":"out"}"><b>${money(t.amount)}</b></td><td>${escapeHtml(t.referenceId||"—")}</td><td><span class="pill ${statusClass(t.status)}">${escapeHtml(t.status)}</span></td><td>${action}</td></tr>`}).join("")}</tbody></table>`:`<div class="empty">No matching transactions.</div>`}
async function handleAction(action,tid){
 const t=transactions.find(x=>x.transactionId===tid);if(!t)return;
 try{
  if(action==="edit"){openEditTransaction(t);return}
  if(action==="delete"){if(String(t.ownerId)!==String(currentUser.memberId)&&currentUser.role!=="Finance Admin"){toast("Permission denied.");return}if(!confirm("Delete this transaction?"))return;const d=await api("deleteTransaction",{accessKey:currentUser._accessKey,actorId:currentUser.memberId,pin:currentUser._pin,transactionId:tid});transactions=(d.transactions||[]).map(t=>({...t,amount:Number(t.amount)||0}));markSynced();toast(d.warning||"Transaction deleted.");}
  if(action==="verify"||action==="reject"){const d=await api("verifyTransaction",{accessKey:currentUser._accessKey,actorId:currentUser.memberId,pin:currentUser._pin,transactionId:tid,status:action==="verify"?"Verified":"Rejected"});transactions=(d.transactions||[]).map(t=>({...t,amount:Number(t.amount)||0}));markSynced();toast(d.warning||(action==="verify"?"Transaction verified.":"Transaction rejected."));}
  renderTx();
 }catch(e){toast(e.message)}
}
function openEditTransaction(t){
 const owner=String(t.ownerId)===String(currentUser.memberId),admin=currentUser.role==="Finance Admin";
 if(!owner&&!admin){toast("You can only edit your own transaction.");return}
 if(t.status!=="Pending"&&!admin){toast("Only pending transactions can be edited by the owner. Ask Finance Admin to correct a reviewed entry.");return}
 editTrigger=document.activeElement;
 $("#eTransactionId").value=t.transactionId;$("#eUpdatedAt").value=t.updatedAt||t.createdAt||"";$("#eDate").value=String(t.date||"").slice(0,10);$("#eType").value=t.type;$("#eAmount").value=Number(t.amount).toFixed(2);$("#eCategory").value=t.category||"Other";$("#eMethod").value=t.paymentMethod||"Other";$("#ePurpose").value=t.purpose||"";$("#eReference").value=t.referenceId||"";
 $("#editModal").classList.remove("hidden");$("#eAmount").focus();
}
function closeEditTransaction(){$("#editModal").classList.add("hidden");$("#editForm").reset();if(editTrigger&&editTrigger.isConnected)editTrigger.focus();editTrigger=null;}
async function saveEditTransaction(e){
 e.preventDefault();const form=$("#editForm"),button=form.querySelector('button[type="submit"]');if(button.disabled)return;
 const id=$("#eTransactionId").value,expectedUpdatedAt=$("#eUpdatedAt").value,amount=Number($("#eAmount").value),patch={date:$("#eDate").value,type:$("#eType").value,amount,category:$("#eCategory").value.trim(),paymentMethod:$("#eMethod").value.trim(),purpose:$("#ePurpose").value.trim(),referenceId:$("#eReference").value.trim()};
 if(!Number.isFinite(amount)||amount<=0||amount>999999999999.99||Math.abs(amount*100-Math.round(amount*100))>0.000001){toast("Enter a positive INR amount with up to 2 decimals.");$("#eAmount").focus();return}
 if(!patch.date||!patch.category||patch.category.length>80||!patch.paymentMethod||patch.paymentMethod.length>40||!patch.purpose||patch.purpose.length>500||!patch.referenceId||patch.referenceId.length>120){toast("Review required fields and their maximum lengths.");return}
 button.disabled=true;const label=button.textContent;button.textContent="Saving…";
 try{const d=await api("updateTransaction",{accessKey:currentUser._accessKey,actorId:currentUser.memberId,pin:currentUser._pin,transactionId:id,expectedUpdatedAt,patch});transactions=(d.transactions||[]).map(x=>({...x,amount:Number(x.amount)||0}));markSynced();closeEditTransaction();toast(d.warning||"Changes saved. Transaction returned to Pending for review.");renderTx();}
 catch(err){toast("Update failed: "+err.message)}finally{button.disabled=false;button.textContent=label}
}
function teamPage(){
 $("#addMember").onclick=()=>{if(currentUser.role!=="Finance Admin"){toast("Finance Admin permission required.");return}memberTrigger=document.activeElement;$("#modal").classList.remove("hidden");$("#mName").focus()};$("#closeModal").onclick=closeMemberModal;
 renderRanking($("#teamRanking"));
 $("#profiles").innerHTML=members.map(m=>{const v=sumMoney(transactions,t=>String(t.ownerId)===String(m.memberId)&&t.type==="inflow"&&t.status==="Verified"),o=sumMoney(transactions,t=>String(t.ownerId)===String(m.memberId)&&t.type==="outflow"&&t.status==="Verified");return `<article class="profile-card" data-profile="${escapeHtml(m.memberId)}"><div class="profile-head"><div class="profile-avatar">${escapeHtml((m.name||"?")[0])}</div><div><b>${escapeHtml(m.name)}</b><small>${escapeHtml(m.role)} · ${escapeHtml(m.memberId)}</small></div></div><div class="profile-amount">${money(v)}</div><div class="profile-sub">Verified investment</div><div class="profile-foot"><span>Spending ${money(o)}</span><span>View profile →</span></div></article>`}).join("");
}
function profilePage(){const m=memberById(selectedProfile);if(!m){go("team");return}const ins=transactions.filter(t=>String(t.ownerId)===String(m.memberId)&&t.type==="inflow"&&t.status!=="Rejected"),outs=transactions.filter(t=>String(t.ownerId)===String(m.memberId)&&t.type==="outflow"&&t.status!=="Rejected"),v=sumMoney(ins,t=>t.status==="Verified"),p=sumMoney(ins,t=>t.status==="Pending"),o=sumMoney(outs,t=>t.status==="Verified"),rank=rankingData().findIndex(x=>x.m.memberId===m.memberId)+1;$("#pAvatar").textContent=m.name[0];$("#pName").textContent=m.name;$("#pRole").textContent=`${m.role} · ${m.memberId}`;$("#pRank").textContent=`Contribution rank #${rank}`;$("#profileKpis").innerHTML=`<article><div class="metric-icon green">₹</div><span>Verified investment</span><strong>${money(v)}</strong><small>Confirmed company funds</small></article><article><div class="metric-icon olive">!</div><span>Pending investment</span><strong>${money(p)}</strong><small>Awaiting verification</small></article><article><div class="metric-icon brown">↘</div><span>Company spending</span><strong>${money(o)}</strong><small>Paid for company</small></article><article><div class="metric-icon gold">=</div><span>Net contribution</span><strong>${money(v-o)}</strong><small>Verified funds − spending</small></article>`;const list=(arr,kind)=>arr.length?`<div class="activity-list">${arr.map(t=>`<div class="activity-row"><div class="a-main"><b>${escapeHtml(t.purpose)}</b><small>${fmt(t.date)} · ${escapeHtml(t.category)} · ${escapeHtml(t.referenceId||"No reference")} · ${escapeHtml(t.proofFileName||"Proof in Drive")}</small></div><div><strong class="${kind==="inflow"?"in":"out"}">${kind==="inflow"?"+":"−"}${money(t.amount)}</strong><small style="display:block;text-align:right"><span class="pill ${statusClass(t.status)}">${escapeHtml(t.status)}</span></small></div></div>`).join("")}</div>`:`<div class="empty">No records yet.</div>`;$("#pIn").innerHTML=list(ins,"inflow");$("#pOut").innerHTML=list(outs,"outflow")}
function reportsPage(){
 const render=()=>{
  const from=$("#reportFrom")?.value||"",to=$("#reportTo")?.value||"";
  const rangeError=$("#reportRangeError");
  if(from&&to&&from>to){if(rangeError)rangeError.textContent="From date must be on or before To date.";$("#reportKpis").innerHTML="";$("#catReport").innerHTML="";$("#memberReport").innerHTML="";return}
  if(rangeError)rangeError.textContent="";
  const selected=transactions.filter(t=>{const d=String(t.date||"").slice(0,10);return (!from||d>=from)&&(!to||d<=to)});
  const ins=sumMoney(selected,t=>t.type==="inflow"&&t.status==="Verified");
  const outs=sumMoney(selected,t=>t.type==="outflow"&&t.status==="Verified");
  $("#reportKpis").innerHTML=`<article><div class="kpi-icon green">₹</div><span>Verified funds in</span><strong>${money(ins)}</strong><small>Selected period</small></article><article><div class="kpi-icon red">↘</div><span>Verified spending</span><strong>${money(outs)}</strong><small>Selected period</small></article><article><div class="kpi-icon navy">=</div><span>Net position</span><strong>${money(ins-outs)}</strong><small>Funds in − spending</small></article>`;
  const cats={};selected.filter(t=>t.type==="outflow"&&t.status==="Verified").forEach(t=>{const k=String(t.category||"Uncategorized");cats[k]=(cats[k]||0)+finance.toPaise(t.amount)});
  $("#catReport").innerHTML=Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="activity-row"><b>${escapeHtml(k)}</b><strong class="out">${money(finance.fromPaise(v))}</strong></div>`).join("")||`<div class="empty">No verified spending in this period.</div>`;
  const rankings=members.map(m=>({m,v:sumMoney(selected,t=>String(t.ownerId)===String(m.memberId)&&t.type==="inflow"&&t.status==="Verified")})).sort((a,b)=>b.v-a.v);
  $("#memberReport").innerHTML=rankings.map(x=>`<div class="activity-row"><div class="a-main"><b>${escapeHtml(x.m.name)}</b><small>${escapeHtml(x.m.role)}</small></div><strong class="in">${money(x.v)}</strong></div>`).join("")||`<div class="empty">No verified contributions in this period.</div>`;
 };
 ["reportFrom","reportTo"].forEach(id=>$("#"+id)?.addEventListener("change",render));
 $("#clearReportFilters")?.addEventListener("click",()=>{$("#reportFrom").value="";$("#reportTo").value="";render()});
 render()
}
async function syncNow(silent=false){
 if(!currentUser||!configured())return;
 if(activeWrites>0){if(!silent)toast("A transaction update is still saving. Sync again in a moment.");return}
 if(syncPromise)return syncPromise;
 const revision=dataRevision,syncUser=currentUser,button=$("#syncNow"),status=$("#syncStatus"),oldLabel=button?.textContent;
 if(button){button.disabled=true;button.textContent="Syncing…"}
 if(status)status.textContent="Syncing…";
 syncPromise=(async()=>{
  try{
   const result=await api("data",{accessKey:syncUser._accessKey,memberId:syncUser.memberId,pin:syncUser._pin});
   if(currentUser!==syncUser){if(status)status.textContent="Not synced";return}
   // Don't apply an older read if a write began while the fetch was in flight.
   if(revision!==dataRevision||activeWrites>0){if(status)status.textContent="Sync deferred";return}
   transactions=(result.transactions||[]).map(t=>({...t,amount:Number(t.amount)||0}));
   members=(result.members||members).filter(m=>String(m.status||"Active").trim().toLowerCase()!=="inactive");
   markSynced()
   if(currentPage==="dashboard")dashboard();
   else if(currentPage==="transactions"){refreshTransactionFilterOptions();renderTx()}
   else if(currentPage==="team")teamPage();
   else if(currentPage==="profile")profilePage();
   else if(currentPage==="reports"){
    const from=$("#reportFrom")?.value||"",to=$("#reportTo")?.value||"";go("reports");if($("#reportFrom"))$("#reportFrom").value=from;if($("#reportTo"))$("#reportTo").value=to;$("#reportFrom")?.dispatchEvent(new Event("change"));
   }
   if(!silent)toast("Finance data synced from Google Sheets.");
  }catch(error){if(status)status.textContent="Sync issue";if(!silent)toast("Sync failed: "+error.message)}
 })();
 try{return await syncPromise}finally{syncPromise=null;if(button){button.disabled=false;button.textContent=oldLabel||"↻ Sync now"}}
}
function startAutoSync(){if(syncTimer)clearInterval(syncTimer);syncTimer=setInterval(()=>{if(currentUser&&$("#editModal").classList.contains("hidden")&&$("#modal").classList.contains("hidden"))syncNow(true)},60000)}

function closeMemberModal(){$("#modal").classList.add("hidden");const form=$("#memberForm");if(form)form.reset();if(memberTrigger&&memberTrigger.isConnected)memberTrigger.focus();memberTrigger=null;}
async function createMember(e){e.preventDefault();const submit=e.target.querySelector("button[type=submit]");if(submit?.disabled)return;if(currentUser.role!=="Finance Admin"){toast("Finance Admin permission required.");return}const m={memberId:$("#mId").value.trim().toUpperCase(),name:$("#mName").value.trim(),role:$("#mRole").value,pin:$("#mPin").value.trim()};if(submit){submit.disabled=true;submit.dataset.label=submit.textContent;submit.textContent="Saving…"}try{const d=await api("createMember",{accessKey:currentUser._accessKey,actorId:currentUser.memberId,pin:currentUser._pin,member:m});members=d.members||members;closeMemberModal();e.target.reset();toast(d.warning||"Profile saved to Google Sheets.");teamPage()}catch(e){toast(e.message)}finally{if(submit){submit.disabled=false;submit.textContent=submit.dataset.label||"Create profile →"}}}
function exportExcel(){
 const rows=filtered(),cols=["Transaction ID","Date","Owner ID","Owner","Role","Type","Amount (INR)","Category","Payment Method","Purpose","Reference ID","Proof File","Status","Created At","Verified By","Verified At","Updated At"];
 const body=rows.map(t=>[t.transactionId,t.date,t.ownerId,t.ownerName,t.role,t.type,Number(t.amount).toFixed(2),t.category,t.paymentMethod,t.purpose,t.referenceId,t.proofFileName||"",t.status,t.createdAt||"",t.verifiedBy||"",t.verifiedAt||"",t.updatedAt||""]);
 const esc=x=>String(x??'').startsWith("=")||/^[\s]*[=+\-@\t\r]/.test(String(x??''))?"'"+String(x??'').replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):String(x??'').replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
 const table=`<table><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr>${body.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</table>`;
 const blob=new Blob([`<html><head><meta charset="UTF-8"><style>table{border-collapse:collapse;font-family:Arial}th,td{border:1px solid #ccc;padding:6px}th{background:#174b2d;color:white}</style></head><body>${table}</body></html>`],{type:"application/vnd.ms-excel"});
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`NELVI_Finance_Transactions_${today()}.xls`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function init(){
 loadSavedConnection();
 // Bind events before branching to setup/login. This prevents the first-run form from
 // performing a native page reload when the user clicks Sign in.
 $("#saveConfig").onclick=saveConnection;
 $("#loginForm").addEventListener("submit",login);
 $("#logout").onclick=logout;
 $("#topAdd").onclick=()=>go("quick");
 $("#appView").addEventListener("click",routeClick);
 document.addEventListener("submit",e=>{if(e.target.id==="txForm")submitTx(e);if(e.target.id==="memberForm")createMember(e)});
 const changeBtn=$("#changeConnection");if(changeBtn)changeBtn.onclick=resetConnection;
 const syncButton=$("#syncNow");if(syncButton)syncButton.onclick=()=>syncNow(false);
 startAutoSync();
 const closeEdit=$("#closeEditModal");if(closeEdit)closeEdit.onclick=closeEditTransaction;
 const cancelEdit=$("#cancelEdit");if(cancelEdit)cancelEdit.onclick=closeEditTransaction;
 const editForm=$("#editForm");if(editForm)editForm.addEventListener("submit",saveEditTransaction);
 document.addEventListener("click",e=>{const b=e.target.closest("[data-toggle-visibility]");if(!b)return;const input=$("#"+b.dataset.toggleVisibility);if(!input)return;const reveal=input.type==="password";input.type=reveal?"text":"password";b.textContent=reveal?"Hide":"Show";b.setAttribute("aria-pressed",String(reveal));});
 document.addEventListener("keydown",e=>{
  const dialog=["#editModal","#modal"].map($).find(el=>el&&!el.classList.contains("hidden"));if(!dialog)return;
  if(e.key==="Escape"){e.preventDefault();if(dialog.id==="editModal")closeEditTransaction();else closeMemberModal();return}
  if(e.key==="Tab"){
   const focusable=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
   if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
 });
 if(!configured()){
  show("setupView");
  if($("#scriptUrl"))$("#scriptUrl").value=cfg.SCRIPT_URL||"";
  if($("#spreadsheetId"))$("#spreadsheetId").value=cfg.SPREADSHEET_ID||"";
  return;
 }
 show("loginView");bootstrap();
}
init();
