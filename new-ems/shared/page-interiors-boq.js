import { MODULES, WORKSPACES, TOAST_TYPES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";
import { getSupabaseClient } from "../config/supabase.js";

const client = getSupabaseClient();

const PAGE_STATE = {
  boot: null,
  headers: [],
  lines: [],
  selectedHeaderId: "",
  draftProjectId: "",
  projects: [],
  projectLookup: new Map(),
  documents: [],
  spaces: [],
  packages: [],
  finishes: [],
  specs: []
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_BOQ,
    pageTitle: "BOQ",
    pageDescription: "Bill of quantities workflow for interior projects",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;
  PAGE_STATE.boot = boot;
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const [headersRes, linesRes, projectsRes, documentsRes, spacesRes, packagesRes, finishesRes, specsRes] = await Promise.all([
    client.from("interior_boq_headers").select("id, project_id, boq_code, boq_name, revision_no, status, total_amount, primary_document_id, approval_request_id, projects(project_code, project_name)").order("created_at", { ascending: false }),
    client.from("interior_boq_lines").select("*").order("line_no", { ascending: true }),
    client.from("interior_projects").select("id, shared_project_id, project_code, project_name, project_title, interior_clients(client_name)").order("project_name"),
    client.from("project_documents").select("id, project_id, title").is("deleted_at", null).order("created_at", { ascending: false }).limit(200),
    client.from("interior_spaces").select("id, project_id, space_code, space_name").order("space_name"),
    client.from("interior_design_packages").select("id, project_id, package_code, package_name").order("package_name"),
    client.from("interior_finish_schedules").select("id, project_id, schedule_code, schedule_name").order("schedule_name"),
    client.from("interior_material_specs").select("id, project_id, spec_code, spec_name").order("spec_name")
  ]);

  PAGE_STATE.headers = headersRes.data || [];
  PAGE_STATE.lines = linesRes.data || [];
  PAGE_STATE.projects = (projectsRes.data || []).filter((row) => row.shared_project_id).map((row) => ({
    id: row.id,
    shared_project_id: row.shared_project_id,
    project_code: row.project_code,
    project_name: row.project_name,
    project_title: row.project_title,
    client_name: row.interior_clients?.client_name || null
  }));
  PAGE_STATE.projectLookup = new Map(PAGE_STATE.projects.map((row) => [String(row.shared_project_id), row]));
  PAGE_STATE.documents = documentsRes.data || [];
  PAGE_STATE.spaces = spacesRes.data || [];
  PAGE_STATE.packages = packagesRes.data || [];
  PAGE_STATE.finishes = finishesRes.data || [];
  PAGE_STATE.specs = specsRes.data || [];
  if (!PAGE_STATE.selectedHeaderId && PAGE_STATE.headers[0]?.id) PAGE_STATE.selectedHeaderId = PAGE_STATE.headers[0].id;
}

function render() {
  const selectedHeader = PAGE_STATE.headers.find((row) => row.id === PAGE_STATE.selectedHeaderId) || null;
  const activeProjectId = selectedHeader?.project_id || PAGE_STATE.draftProjectId || "";
  const selectedLines = PAGE_STATE.lines.filter((row) => row.boq_header_id === PAGE_STATE.selectedHeaderId);
  renderModuleContent(`
    <section class="card">
      <style>
        .int-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.int-grid .full{grid-column:1/-1}
        .int-grid label{display:block;font-weight:600;margin-bottom:.35rem}.int-grid input,.int-grid select,.int-grid textarea{width:100%}
        .int-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem}.int-shell{display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:1rem}.muted-box{border:1px dashed #cbd5e1;border-radius:12px;padding:.75rem}
        @media (max-width:980px){.int-shell{grid-template-columns:1fr}.int-grid{grid-template-columns:1fr}}
      </style>
      <h3>BOQ Workflow</h3>
      <p class="muted">Create headers, maintain lines, auto-calculate line amounts, and roll up header totals.</p>
      <div class="hero-kpis">
        <span class="meta-pill">BOQs: ${PAGE_STATE.headers.length}</span>
        <span class="meta-pill">BOQ Lines: ${PAGE_STATE.lines.length}</span>
        <span class="meta-pill">Selected Total: ${formatMoney(selectedHeader?.total_amount || 0)}</span>
      </div>
    </section>

    <section class="int-shell" style="margin-top:1rem;">
      <section class="card">
        <h4>Header</h4>
        <div class="int-grid">
          <div class="full"><label for="boqHeaderSelect">Open Header</label><select id="boqHeaderSelect"><option value="">Create New Header</option>${PAGE_STATE.headers.map((row) => `<option value="${row.id}" ${row.id === PAGE_STATE.selectedHeaderId ? 'selected' : ''}>${escapeHtml(row.boq_code)} - ${escapeHtml(row.boq_name)}</option>`).join('')}</select></div>
          <div><label for="boqProjectId">Project *</label><select id="boqProjectId">${renderProjectOptions(activeProjectId)}</select></div>
          <div><label for="boqDocumentId">Primary Document</label><select id="boqDocumentId">${renderDocumentOptions(activeProjectId, selectedHeader?.primary_document_id)}</select></div>
          <div><label for="boqCode">BOQ Code *</label><input id="boqCode" type="text" value="${escapeAttr(selectedHeader?.boq_code || '')}" /></div>
          <div><label for="boqName">BOQ Name *</label><input id="boqName" type="text" value="${escapeAttr(selectedHeader?.boq_name || '')}" /></div>
          <div><label for="boqRevision">Revision *</label><input id="boqRevision" type="number" min="1" step="1" value="${escapeAttr(String(selectedHeader?.revision_no || 1))}" /></div>
          <div><label for="boqStatus">Status *</label><select id="boqStatus">${renderOptions(['draft','under_review','approved','superseded','archived'], selectedHeader?.status || 'draft')}</select></div>
          <div class="full"><label for="boqDescription">Description</label><textarea id="boqDescription" rows="3">${escapeHtml(selectedHeader?.description || '')}</textarea></div>
        </div>
        <div class="int-actions">
          <button class="btn" id="saveBoqHeaderBtn" type="button">${selectedHeader ? 'Save Header' : 'Create Header'}</button>
        </div>
      </section>

      <section class="card">
        <h4>Lines</h4>
        ${selectedHeader ? `
          <div class="muted-box" style="margin-bottom:1rem;">Header Total: <strong>${formatMoney(selectedHeader.total_amount || 0)}</strong></div>
          <div class="int-grid">
            <div><label for="boqLineNo">Line No *</label><input id="boqLineNo" type="number" min="1" step="1" value="${selectedLines.length + 1}" /></div>
            <div><label for="boqLineScopeItem">Scope Item *</label><input id="boqLineScopeItem" type="text" /></div>
            <div class="full"><label for="boqLineDescription">Description</label><textarea id="boqLineDescription" rows="2"></textarea></div>
            <div><label for="boqLineSpace">Space</label><select id="boqLineSpace">${renderEntityOptions(PAGE_STATE.spaces, 'space_code', 'space_name', selectedHeader.project_id)}</select></div>
            <div><label for="boqLinePackage">Design Package</label><select id="boqLinePackage">${renderEntityOptions(PAGE_STATE.packages, 'package_code', 'package_name', selectedHeader.project_id)}</select></div>
            <div><label for="boqLineFinish">Finish Schedule</label><select id="boqLineFinish">${renderEntityOptions(PAGE_STATE.finishes, 'schedule_code', 'schedule_name', selectedHeader.project_id)}</select></div>
            <div><label for="boqLineSpec">Material Spec</label><select id="boqLineSpec">${renderEntityOptions(PAGE_STATE.specs, 'spec_code', 'spec_name', selectedHeader.project_id)}</select></div>
            <div><label for="boqLineUom">UOM</label><input id="boqLineUom" type="text" /></div>
            <div><label for="boqLineQty">Quantity *</label><input id="boqLineQty" type="number" min="0" step="0.001" value="0" /></div>
            <div><label for="boqLineRate">Unit Rate *</label><input id="boqLineRate" type="number" min="0" step="0.01" value="0" /></div>
            <div><label for="boqLineWastage">Wastage %</label><input id="boqLineWastage" type="number" min="0" step="0.01" value="0" /></div>
            <div><label for="boqLineAmount">Line Amount</label><input id="boqLineAmount" type="text" value="₹0.00" readonly /></div>
            <div class="full"><label for="boqLineRemarks">Remarks</label><textarea id="boqLineRemarks" rows="2"></textarea></div>
          </div>
          <div class="int-actions"><button class="btn" id="addBoqLineBtn" type="button">Add Line</button></div>
          <div class="table-container" style="margin-top:1rem;">
            <table>
              <thead><tr><th>No</th><th>Scope</th><th>Qty</th><th>Rate</th><th>Amount</th><th>Actions</th></tr></thead>
              <tbody>${selectedLines.length ? selectedLines.map((row) => `<tr>
                <td>${escapeHtml(String(row.line_no || '-'))}</td>
                <td>${escapeHtml(row.scope_item || '-')}${row.description ? `<br/><span class="muted">${escapeHtml(row.description)}</span>` : ''}</td>
                <td>${escapeHtml(String(row.quantity || 0))}</td>
                <td>${formatMoney(row.unit_rate || 0)}</td>
                <td>${formatMoney(row.line_amount || 0)}</td>
                <td><button class="btn btn-sm" data-boq-edit="${row.id}" type="button">Edit</button> <button class="btn btn-sm btn-danger" data-boq-delete="${row.id}" type="button">Delete</button></td>
              </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;padding:2rem;">No lines added yet.</td></tr>`}</tbody>
            </table>
          </div>
        ` : `<p class="muted">Create a BOQ header first to manage lines.</p>`}
      </section>
    </section>
  `);
}

function bindEvents() {
  document.getElementById('boqHeaderSelect')?.addEventListener('change', async (event) => {
    PAGE_STATE.selectedHeaderId = event.target.value || '';
    const selectedHeader = PAGE_STATE.headers.find((row) => row.id === PAGE_STATE.selectedHeaderId) || null;
    PAGE_STATE.draftProjectId = selectedHeader?.project_id || '';
    render();
    bindEvents();
  });
  document.getElementById('boqProjectId')?.addEventListener('change', () => {
    const selectedHeader = PAGE_STATE.headers.find((row) => row.id === PAGE_STATE.selectedHeaderId) || null;
    const projectId = document.getElementById('boqProjectId')?.value || selectedHeader?.project_id || null;
    PAGE_STATE.draftProjectId = projectId || '';
    const docSelect = document.getElementById('boqDocumentId');
    if (docSelect) docSelect.innerHTML = renderDocumentOptions(projectId, docSelect.value);
  });
  document.getElementById('boqLineQty')?.addEventListener('input', syncLineAmountPreview);
  document.getElementById('boqLineRate')?.addEventListener('input', syncLineAmountPreview);
  document.getElementById('saveBoqHeaderBtn')?.addEventListener('click', saveHeader);
  document.getElementById('addBoqLineBtn')?.addEventListener('click', addLine);
  document.querySelectorAll('[data-boq-delete]').forEach((btn) => btn.addEventListener('click', deleteLine));
  document.querySelectorAll('[data-boq-edit]').forEach((btn) => btn.addEventListener('click', editLine));
}

function syncLineAmountPreview() {
  const qty = Number(document.getElementById('boqLineQty')?.value || 0);
  const rate = Number(document.getElementById('boqLineRate')?.value || 0);
  const target = document.getElementById('boqLineAmount');
  if (target) target.value = formatMoney(qty * rate);
}

async function saveHeader() {
  const payload = {
    project_id: document.getElementById('boqProjectId')?.value || null,
    primary_document_id: document.getElementById('boqDocumentId')?.value || null,
    boq_code: document.getElementById('boqCode')?.value?.trim() || '',
    boq_name: document.getElementById('boqName')?.value?.trim() || '',
    revision_no: Number(document.getElementById('boqRevision')?.value || 1),
    status: document.getElementById('boqStatus')?.value || 'draft',
    description: document.getElementById('boqDescription')?.value?.trim() || null,
    updated_by: PAGE_STATE.boot?.appUser?.id || null,
    created_by: PAGE_STATE.boot?.appUser?.id || null
  };
  if (!payload.project_id || !payload.boq_code || !payload.boq_name) {
    showToast('Project, BOQ code, and BOQ name are required.', TOAST_TYPES.ERROR);
    return;
  }
  try {
    if (PAGE_STATE.selectedHeaderId) {
      const { error } = await client.from('interior_boq_headers').update(payload).eq('id', PAGE_STATE.selectedHeaderId);
      if (error) throw error;
      showToast('BOQ header updated.', TOAST_TYPES.SUCCESS);
    } else {
      const { data, error } = await client.from('interior_boq_headers').insert(payload).select('id').single();
      if (error) throw error;
      PAGE_STATE.selectedHeaderId = data.id;
      showToast('BOQ header created.', TOAST_TYPES.SUCCESS);
    }
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to save BOQ header.', TOAST_TYPES.ERROR);
  }
}

async function addLine() {
  const selectedHeader = PAGE_STATE.headers.find((row) => row.id === PAGE_STATE.selectedHeaderId);
  if (!selectedHeader) return;
  const payload = {
    project_id: selectedHeader.project_id,
    boq_header_id: selectedHeader.id,
    line_no: Number(document.getElementById('boqLineNo')?.value || 0),
    scope_item: document.getElementById('boqLineScopeItem')?.value?.trim() || '',
    description: document.getElementById('boqLineDescription')?.value?.trim() || null,
    space_id: document.getElementById('boqLineSpace')?.value || null,
    design_package_id: document.getElementById('boqLinePackage')?.value || null,
    finish_schedule_id: document.getElementById('boqLineFinish')?.value || null,
    material_spec_id: document.getElementById('boqLineSpec')?.value || null,
    uom: document.getElementById('boqLineUom')?.value?.trim() || null,
    quantity: Number(document.getElementById('boqLineQty')?.value || 0),
    unit_rate: Number(document.getElementById('boqLineRate')?.value || 0),
    wastage_percent: Number(document.getElementById('boqLineWastage')?.value || 0),
    remarks: document.getElementById('boqLineRemarks')?.value?.trim() || null,
    created_by: PAGE_STATE.boot?.appUser?.id || null,
    updated_by: PAGE_STATE.boot?.appUser?.id || null
  };
  if (!payload.line_no || !payload.scope_item) {
    showToast('Line no and scope item are required.', TOAST_TYPES.ERROR);
    return;
  }
  try {
    const { error } = await client.from('interior_boq_lines').insert(payload);
    if (error) throw error;
    showToast('BOQ line added.', TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to add BOQ line.', TOAST_TYPES.ERROR);
  }
}

async function deleteLine(event) {
  const lineId = event.currentTarget.dataset.boqDelete;
  if (!lineId || !window.confirm('Delete this BOQ line?')) return;
  try {
    const { error } = await client.from('interior_boq_lines').delete().eq('id', lineId);
    if (error) throw error;
    showToast('BOQ line deleted.', TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to delete BOQ line.', TOAST_TYPES.ERROR);
  }
}

function editLine(event) {
  const lineId = event.currentTarget.dataset.boqEdit;
  const row = PAGE_STATE.lines.find((item) => item.id === lineId);
  if (!row) return;
  document.getElementById('boqLineNo').value = row.line_no || '';
  document.getElementById('boqLineScopeItem').value = row.scope_item || '';
  document.getElementById('boqLineDescription').value = row.description || '';
  document.getElementById('boqLineSpace').value = row.space_id || '';
  document.getElementById('boqLinePackage').value = row.design_package_id || '';
  document.getElementById('boqLineFinish').value = row.finish_schedule_id || '';
  document.getElementById('boqLineSpec').value = row.material_spec_id || '';
  document.getElementById('boqLineUom').value = row.uom || '';
  document.getElementById('boqLineQty').value = row.quantity || 0;
  document.getElementById('boqLineRate').value = row.unit_rate || 0;
  document.getElementById('boqLineWastage').value = row.wastage_percent || 0;
  document.getElementById('boqLineRemarks').value = row.remarks || '';
  syncLineAmountPreview();
  const button = document.getElementById('addBoqLineBtn');
  button.textContent = 'Save Line';
  button.onclick = async () => {
    try {
      const payload = {
        line_no: Number(document.getElementById('boqLineNo')?.value || 0),
        scope_item: document.getElementById('boqLineScopeItem')?.value?.trim() || '',
        description: document.getElementById('boqLineDescription')?.value?.trim() || null,
        space_id: document.getElementById('boqLineSpace')?.value || null,
        design_package_id: document.getElementById('boqLinePackage')?.value || null,
        finish_schedule_id: document.getElementById('boqLineFinish')?.value || null,
        material_spec_id: document.getElementById('boqLineSpec')?.value || null,
        uom: document.getElementById('boqLineUom')?.value?.trim() || null,
        quantity: Number(document.getElementById('boqLineQty')?.value || 0),
        unit_rate: Number(document.getElementById('boqLineRate')?.value || 0),
        wastage_percent: Number(document.getElementById('boqLineWastage')?.value || 0),
        remarks: document.getElementById('boqLineRemarks')?.value?.trim() || null,
        updated_by: PAGE_STATE.boot?.appUser?.id || null
      };
      const { error } = await client.from('interior_boq_lines').update(payload).eq('id', lineId);
      if (error) throw error;
      showToast('BOQ line updated.', TOAST_TYPES.SUCCESS);
      button.textContent = 'Add Line';
      button.onclick = null;
      await loadData();
      render();
      bindEvents();
    } catch (error) {
      showToast(error?.message || 'Failed to update BOQ line.', TOAST_TYPES.ERROR);
    }
  };
}

function renderProjectOptions(selectedId) {
  return `<option value="">Select Project</option>${PAGE_STATE.projects.map((row) => `<option value="${row.shared_project_id}" ${String(selectedId||'')===String(row.shared_project_id)?'selected':''}>${escapeHtml(row.project_code || '')} - ${escapeHtml(row.project_title || row.project_name || '')}${row.client_name ? ` (${escapeHtml(row.client_name)})` : ''}</option>`).join('')}`;
}

function renderDocumentOptions(projectId, selectedId) {
  const rows = PAGE_STATE.documents.filter((row) => !projectId || String(row.project_id) === String(projectId));
  return `<option value="">No Document</option>${rows.map((row) => `<option value="${row.id}" ${String(selectedId||'')===String(row.id)?'selected':''}>${escapeHtml(row.title || row.id)}</option>`).join('')}`;
}

function renderEntityOptions(rows, codeKey, nameKey, projectId) {
  const filtered = rows.filter((row) => !projectId || String(row.project_id) === String(projectId));
  return `<option value="">None</option>${filtered.map((row) => `<option value="${row.id}">${escapeHtml(row[codeKey] || '')} - ${escapeHtml(row[nameKey] || '')}</option>`).join('')}`;
}

function renderOptions(options, selected) {
  return options.map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value}</option>`).join('');
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

init();
