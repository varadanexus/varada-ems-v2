import { MODULES, WORKSPACES } from "../config/constants.js";
import { getAnnualTaxDataset, saveAnnualTaxWorkpaper, saveStatutoryFiling } from "./admin-api.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { qs, showToast } from "./utils.js";

let data={}; let canEdit=false;
async function init(){
  const boot=await bootstrapProtectedPage({moduleCode:MODULES.CENTRAL_ACCOUNTS_ANNUAL_TAX,pageTitle:"Annual Tax & Audit",pageDescription:"Annual close, statutory filings, audit workpapers and CA sign-off",workspace:WORKSPACES.ACCOUNTS});
  if(!boot)return;
  const set=new Set((boot.permissions||[]).map(p=>`${p.module_code}:${p.action_code}`));
  canEdit=boot.roleCodes?.some(r=>["super_admin","admin"].includes(r))||set.has(`${MODULES.CENTRAL_ACCOUNTS_ANNUAL_TAX}:edit`)||set.has(`${MODULES.CENTRAL_ACCOUNTS_ANNUAL_TAX}:create`);
  await load();
}
async function load(){data=await getAnnualTaxDataset();render();}
function render(){
  const open=(data.workpapers||[]).filter(r=>!["reviewed","final","not_applicable"].includes(r.status)).length;
  const due=(data.filings||[]).filter(r=>!["filed","accepted","cancelled"].includes(r.status)).length;
  renderModuleContent(`
  <section class="card"><div class="hero-kpis"><span class="meta-pill">Fiscal Years: ${(data.fiscalYears||[]).length}</span><span class="meta-pill">Open Workpapers: ${open}</span><span class="meta-pill">Pending Filings: ${due}</span><span class="meta-pill">Filed: ${(data.filings||[]).filter(r=>["filed","accepted"].includes(r.status)).length}</span></div></section>
  ${canEdit?`<section class="card" style="margin-top:1rem;"><h3>Add Filing / Workpaper</h3><div class="form-row"><form id="filingForm" class="form-row"><select data-f="filing_type">${options(["GSTR1","GSTR3B","GSTR9","GSTR9C","ITR","TAX_AUDIT_3CD","TDS_24Q","TDS_26Q","TDS_27Q","ADVANCE_TAX","OTHER"])}</select><input data-f="financial_year" placeholder="2026-27" required><input data-f="period_code" placeholder="Period (optional)"><input data-f="due_date" type="date"><button class="btn">Add Filing</button></form><form id="workpaperForm" class="form-row"><input data-w="financial_year" placeholder="2026-27" required><input data-w="section_code" placeholder="e.g. DEPRECIATION" required><input data-w="title" placeholder="Workpaper title" required><input data-w="amount" type="number" placeholder="Amount"><button class="btn">Add Workpaper</button></form></div></section>`:""}
  <section class="card" style="margin-top:1rem;"><h3>Statutory Filing Calendar</h3><div class="table-shell"><table><thead><tr><th>Year</th><th>Filing</th><th>Period</th><th>Due Date</th><th>Status</th><th>Acknowledgement</th><th>Evidence</th></tr></thead><tbody>${(data.filings||[]).map(r=>`<tr><td>${esc(r.financial_year)}</td><td>${esc(r.filing_type)}</td><td>${esc(r.period_code||"-")}</td><td>${esc(r.due_date||"-")}</td><td>${esc(r.status)}</td><td>${esc(r.acknowledgement_no||"-")}</td><td>${r.evidence_url?`<a href="${esc(r.evidence_url)}" target="_blank">Open</a>`:"-"}</td></tr>`).join("")||'<tr><td colspan="7">No filing records.</td></tr>'}</tbody></table></div></section>
  <section class="card" style="margin-top:1rem;"><h3>Annual Audit Workpapers</h3><div class="table-shell"><table><thead><tr><th>Year</th><th>Section</th><th>Title</th><th>Amount</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${(data.workpapers||[]).map(r=>`<tr><td>${esc(r.financial_year)}</td><td>${esc(r.section_code)}</td><td>${esc(r.title)}</td><td>${money(r.amount)}</td><td>${esc(r.status)}</td><td>${r.evidence_url?`<a href="${esc(r.evidence_url)}" target="_blank">Open</a>`:"-"}</td></tr>`).join("")||'<tr><td colspan="6">No workpapers.</td></tr>'}</tbody></table></div></section>`);
  qs("#filingForm")?.addEventListener("submit",addFiling);qs("#workpaperForm")?.addEventListener("submit",addWorkpaper);
}
async function addFiling(e){e.preventDefault();const p={status:"not_started"};e.target.querySelectorAll("[data-f]").forEach(x=>p[x.dataset.f]=x.value||null);await saveStatutoryFiling(p);showToast("Filing record added","success");await load();}
async function addWorkpaper(e){e.preventDefault();const p={status:"open"};e.target.querySelectorAll("[data-w]").forEach(x=>p[x.dataset.w]=x.dataset.w==="amount"&&x.value?Number(x.value):x.value||null);await saveAnnualTaxWorkpaper(p);showToast("Workpaper added","success");await load();}
const options=a=>a.map(v=>`<option value="${v}">${v.replaceAll("_"," ")}</option>`).join("");
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(v||0));
init().catch(e=>showToast(e?.message||"Failed to load annual tax workspace","error"));
