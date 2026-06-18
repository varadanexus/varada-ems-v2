import { MODULES, WORKSPACES, TOAST_TYPES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";
import { getSupabaseClient } from "../config/supabase.js";

const client = getSupabaseClient();

const PAGE_STATE = {
  boot: null,
  headers: [],
  lines: [],
  boqHeaders: [],
  boqLines: [],
  projects: [],
  spaces: [],
  specs: [],
  selectedHeaderId: "",
  draftProjectId: ""
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_ESTIMATES,
    pageTitle: "Estimates",
    pageDescription: "Commercial estimating workflow for interior projects",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;
  PAGE_STATE.boot = boot;
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const [headersRes, linesRes, boqHeadersRes, boqLinesRes, projectsRes, spacesRes, specsRes] = await Promise.all([
    client.from("interior_estimate_headers").select("id, project_id, estimate_code, estimate_name, revision_no, status, total_amount, projects(project_code, project_name)").order("created_at", { ascending: false }),
    client.from("interior_estimate_lines").select("*").order("line_no", { ascending: true }),
    client.from("interior_boq_headers").select("id, project_id, boq_code, boq_name, revision_no, status").order("created_at", { ascending: false }),
    client.from("interior_boq_lines").select("*").order("line_no", { ascending: true }),
    client.from("interior_projects").select("id, shared_project_id, project_code, project_name, project_title, interior_clients(client_name)").order("project_name"),
    client.from("interior_spaces").select("id, project_id, space_code, space_name").order("space_name"),
    client.from("interior_material_specs").select("id, project_id, spec_code, spec_name").order("spec_name")
  ]);

  PAGE_STATE.headers = headersRes.data || [];
  PAGE_STATE.lines = linesRes.data || [];
  PAGE_STATE.boqHeaders = boqHeadersRes.data || [];
  PAGE_STATE.boqLines = boqLinesRes.data || [];
  PAGE_STATE.projects = (projectsRes.data || []).filter((row) => row.shared_project_id).map((row) => ({
    id: row.id,
    shared_project_id: row.shared_project_id,
    project_code: row.project_code,
    project_name: row.project_name,
    project_title: row.project_title,
    client_name: row.interior_clients?.client_name || null
  }));
  PAGE_STATE.spaces = spacesRes.data || [];
  PAGE_STATE.specs = specsRes.data || [];
  if (!PAGE_STATE.selectedHeaderId && PAGE_STATE.headers[0]?.id) PAGE_STATE.selectedHeaderId = PAGE_STATE.headers[0].id;
}

function render() {
  const selectedHeader = PAGE_STATE.headers.find((row) => row.id === PAGE_STATE.selectedHeaderId) || null;
  const activeProjectId = selectedHeader?.project_id || PAGE_STATE.draftProjectId || "";
  const selectedLines = PAGE_STATE.lines.filter((row) => row.estimate_header_id === PAGE_STATE.selectedHeaderId);
  renderModuleContent(`
    <section class="card">
      <style>
        .int-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.int-grid .full{grid-column:1/-1}
        .int-grid label{display:block;font-weight:600;margin-bottom:.35rem}.int-grid input,.int-grid select,.int-grid textarea{width:100%}
        .int-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem}.int-shell{display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:1rem}.muted-box{border:1px dashed #cbd5e1;border-radius:12px;padding:.75rem}
        @media (max-width:980px){.int-shell{grid-template-columns:1fr}.int-grid{grid-template-columns:1fr}}
      </style>
      <h3>Estimate Workflow</h3>
      <p class="muted">Create estimates manually or generate them from BOQ lines with revision and totals support.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Estimates: ${PAGE_STATE.headers.length}</span>
        <span class="meta-pill">Estimate Lines: ${PAGE_STATE.lines.length}</span>
        <span class="meta-pill">Selected Total: ${formatMoney(selectedHeader?.total_amount || 0)}</span>
      </div>
    </section>

    <section class="int-shell" style="margin-top:1rem;">
      <section class="card">
        <h4>Header</h4>
        <div class="int-grid">
          <div class="full"><label for="estimateHeaderSelect">Open Header</label><select id="estimateHeaderSelect"><option value="">Create New Estimate</option>${PAGE_STATE.headers.map((row) => `<option value="${row.id}" ${row.id === PAGE_STATE.selectedHeaderId ? 'selected' : ''}>${escapeHtml(row.estimate_code)} - ${escapeHtml(row.estimate_name)}</option>`).join('')}</select></div>
          <div><label for="estimateProjectId">Project *</label><select id="estimateProjectId">${renderProjectOptions(activeProjectId)}</select></div>
          <div><label for="estimateFromBoqId">Create from BOQ</label><select id="estimateFromBoqId">${renderBoqOptions(activeProjectId)}</select></div>
          <div><label for="estimateCode">Estimate Code *</label><input id="estimateCode" type="text" value="${escapeAttr(selectedHeader?.estimate_code || '')}" /></div>
          <div><label for="estimateName">Estimate Name *</label><input id="estimateName" type="text" value="${escapeAttr(selectedHeader?.estimate_name || '')}" /></div>
          <div><label for="estimateRevision">Revision *</label><input id="estimateRevision" type="number" min="1" step="1" value="${escapeAttr(String(selectedHeader?.revision_no || 1))}" /></div>
          <div><label for="estimateStatus">Status *</label><select id="estimateStatus">${renderOptions(['draft','under_review','approved','superseded','archived'], selectedHeader?.status || 'draft')}</select></div>
          <div class="full"><label for="estimateDescription">Description</label><textarea id="estimateDescription" rows="3"></textarea></div>
        </div>
        <div class="int-actions">
          <button class="btn" id="saveEstimateHeaderBtn" type="button">${selectedHeader ? 'Save Header' : 'Create Header'}</button>
          ${!selectedHeader ? `<button class="btn" id="createEstimateFromBoqBtn" type="button">Create From BOQ</button>` : ''}
        </div>
      </section>

      <section class="card">
        <h4>Lines</h4>
        ${selectedHeader ? `
          <div class="muted-box" style="margin-bottom:1rem;">Header Total: <strong>${formatMoney(selectedHeader.total_amount || 0)}</strong></div>
          <div class="int-grid">
            <div><label for="estimateLineNo">Line No *</label><input id="estimateLineNo" type="number" min="1" step="1" value="${selectedLines.length + 1}" /></div>
            <div><label for="estimateLineBoqId">BOQ Source Line</label><select id="estimateLineBoqId">${renderBoqLineOptions(selectedHeader.project_id)}</select></div>
            <div class="full"><label for="estimateLineDescription">Description *</label><textarea id="estimateLineDescription" rows="2"></textarea></div>
            <div><label for="estimateLineSpace">Space</label><select id="estimateLineSpace">${renderEntityOptions(PAGE_STATE.spaces, 'space_code', 'space_name', selectedHeader.project_id)}</select></div>
            <div><label for="estimateLineSpec">Material Spec</label><select id="estimateLineSpec">${renderEntityOptions(PAGE_STATE.specs, 'spec_code', 'spec_name', selectedHeader.project_id)}</select></div>
            <div><label for="estimateLineUom">UOM</label><input id="estimateLineUom" type="text" /></div>
            <div><label for="estimateLineQty">Quantity *</label><input id="estimateLineQty" type="number" min="0" step="0.001" value="0" /></div>
            <div><label for="estimateLineRate">Unit Rate *</label><input id="estimateLineRate" type="number" min="0" step="0.01" value="0" /></div>
            <div><label for="estimateLineAmount">Line Amount</label><input id="estimateLineAmount" type="text" value="₹0.00" readonly /></div>
            <div class="full"><label for="estimateLineRemarks">Remarks</label><textarea id="estimateLineRemarks" rows="2"></textarea></div>
          </div>
          <div class="int-actions"><button class="btn" id="addEstimateLineBtn" type="button">Add Line</button></div>
          <div class="table-container" style="margin-top:1rem;">
            <table>
              <thead><tr><th>No</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th><th>Actions</th></tr></thead>
              <tbody>${selectedLines.length ? selectedLines.map((row) => `<tr>
                <td>${escapeHtml(String(row.line_no || '-'))}</td>
                <td>${escapeHtml(row.description || '-')}${row.boq_line_id ? `<br/><span class="muted">From BOQ Line</span>` : ''}</td>
                <td>${escapeHtml(String(row.quantity || 0))}</td>
                <td>${formatMoney(row.unit_rate || 0)}</td>
                <td>${formatMoney(row.line_amount || 0)}</td>
                <td><button class="btn btn-sm" data-estimate-edit="${row.id}" type="button">Edit</button> <button class="btn btn-sm btn-danger" data-estimate-delete="${row.id}" type="button">Delete</button></td>
              </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;padding:2rem;">No lines added yet.</td></tr>`}</tbody>
            </table>
          </div>
        ` : `<p class="muted">Create an estimate header first, or generate one from a BOQ.</p>`}
      </section>
    </section>
  `);
}

function bindEvents() {
  document.getElementById('estimateHeaderSelect')?.addEventListener('change', (event) => {
    PAGE_STATE.selectedHeaderId = event.target.value || '';
    const selectedHeader = PAGE_STATE.headers.find((row) => row.id === PAGE_STATE.selectedHeaderId) || null;
    PAGE_STATE.draftProjectId = selectedHeader?.project_id || '';
    render();
    bindEvents();
  });
  document.getElementById('estimateProjectId')?.addEventListener('change', () => {
    PAGE_STATE.draftProjectId = document.getElementById('estimateProjectId')?.value || '';
    render();
    bindEvents();
  });
  document.getElementById('estimateLineQty')?.addEventListener('input', syncLineAmountPreview);
  document.getElementById('estimateLineRate')?.addEventListener('input', syncLineAmountPreview);
  document.getElementById('estimateLineBoqId')?.addEventListener('change', hydrateFromBoqLine);
  document.getElementById('saveEstimateHeaderBtn')?.addEventListener('click', saveHeader);
  document.getElementById('createEstimateFromBoqBtn')?.addEventListener('click', createFromBoq);
  document.getElementById('addEstimateLineBtn')?.addEventListener('click', addLine);
  document.querySelectorAll('[data-estimate-delete]').forEach((btn) => btn.addEventListener('click', deleteLine));
  document.querySelectorAll('[data-estimate-edit]').forEach((btn) => btn.addEventListener('click', editLine));
}

function syncLineAmountPreview() {
  const qty = Number(document.getElementById('estimateLineQty')?.value || 0);
  const rate = Number(document.getElementById('estimateLineRate')?.value || 0);
  const target = document.getElementById('estimateLineAmount');
  if (target) target.value = formatMoney(qty * rate);
}

function hydrateFromBoqLine() {
  const id = document.getElementById('estimateLineBoqId')?.value || '';
  const row = PAGE_STATE.boqLines.find((item) => item.id === id);
  if (!row) return;
  document.getElementById('estimateLineDescription').value = row.description || row.scope_item || '';
  document.getElementById('estimateLineSpace').value = row.space_id || '';
  document.getElementById('estimateLineSpec').value = row.material_spec_id || '';
  document.getElementById('estimateLineUom').value = row.uom || '';
  document.getElementById('estimateLineQty').value = row.quantity || 0;
  syncLineAmountPreview();
}

async function saveHeader() {
  const payload = {
    project_id: document.getElementById('estimateProjectId')?.value || null,
    estimate_code: document.getElementById('estimateCode')?.value?.trim() || '',
    estimate_name: document.getElementById('estimateName')?.value?.trim() || '',
    revision_no: Number(document.getElementById('estimateRevision')?.value || 1),
    status: document.getElementById('estimateStatus')?.value || 'draft',
    description: document.getElementById('estimateDescription')?.value?.trim() || null,
    updated_by: PAGE_STATE.boot?.appUser?.id || null,
    created_by: PAGE_STATE.boot?.appUser?.id || null
  };
  if (!payload.project_id || !payload.estimate_code || !payload.estimate_name) {
    showToast('Project, estimate code, and estimate name are required.', TOAST_TYPES.ERROR);
    return;
  }
  try {
    if (PAGE_STATE.selectedHeaderId) {
      const { error } = await client.from('interior_estimate_headers').update(payload).eq('id', PAGE_STATE.selectedHeaderId);
      if (error) throw error;
      showToast('Estimate header updated.', TOAST_TYPES.SUCCESS);
    } else {
      const { data, error } = await client.from('interior_estimate_headers').insert(payload).select('id').single();
      if (error) throw error;
      PAGE_STATE.selectedHeaderId = data.id;
      showToast('Estimate header created.', TOAST_TYPES.SUCCESS);
    }
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to save estimate header.', TOAST_TYPES.ERROR);
  }
}

async function createFromBoq() {
  const projectId = document.getElementById('estimateProjectId')?.value || null;
  const boqHeaderId = document.getElementById('estimateFromBoqId')?.value || null;
  if (!projectId || !boqHeaderId) {
    showToast('Select project and BOQ source first.', TOAST_TYPES.ERROR);
    return;
  }
  const boqHeader = PAGE_STATE.boqHeaders.find((row) => row.id === boqHeaderId);
  const boqLines = PAGE_STATE.boqLines.filter((row) => row.boq_header_id === boqHeaderId);
  try {
    const { data: header, error: headerError } = await client
      .from('interior_estimate_headers')
      .insert({
        project_id: projectId,
        estimate_code: `${boqHeader?.boq_code || 'EST'}-EST`,
        estimate_name: `${boqHeader?.boq_name || 'BOQ'} Estimate`,
        revision_no: 1,
        status: 'draft',
        description: `Created from BOQ ${boqHeader?.boq_code || ''}`,
        created_by: PAGE_STATE.boot?.appUser?.id || null,
        updated_by: PAGE_STATE.boot?.appUser?.id || null
      })
      .select('id')
      .single();
    if (headerError) throw headerError;
    if (boqLines.length) {
      const { error: lineError } = await client.from('interior_estimate_lines').insert(boqLines.map((row, index) => ({
        project_id: projectId,
        estimate_header_id: header.id,
        boq_line_id: row.id,
        line_no: index + 1,
        description: row.description || row.scope_item,
        space_id: row.space_id,
        material_spec_id: row.material_spec_id,
        uom: row.uom,
        quantity: row.quantity,
        unit_rate: row.unit_rate || 0,
        line_amount: row.line_amount || 0,
        remarks: row.remarks,
        created_by: PAGE_STATE.boot?.appUser?.id || null,
        updated_by: PAGE_STATE.boot?.appUser?.id || null
      })));
      if (lineError) throw lineError;
    }
    PAGE_STATE.selectedHeaderId = header.id;
    showToast('Estimate created from BOQ.', TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to create estimate from BOQ.', TOAST_TYPES.ERROR);
  }
}

async function addLine() {
  const selectedHeader = PAGE_STATE.headers.find((row) => row.id === PAGE_STATE.selectedHeaderId);
  if (!selectedHeader) return;
  const payload = {
    project_id: selectedHeader.project_id,
    estimate_header_id: selectedHeader.id,
    boq_line_id: document.getElementById('estimateLineBoqId')?.value || null,
    line_no: Number(document.getElementById('estimateLineNo')?.value || 0),
    description: document.getElementById('estimateLineDescription')?.value?.trim() || '',
    space_id: document.getElementById('estimateLineSpace')?.value || null,
    material_spec_id: document.getElementById('estimateLineSpec')?.value || null,
    uom: document.getElementById('estimateLineUom')?.value?.trim() || null,
    quantity: Number(document.getElementById('estimateLineQty')?.value || 0),
    unit_rate: Number(document.getElementById('estimateLineRate')?.value || 0),
    remarks: document.getElementById('estimateLineRemarks')?.value?.trim() || null,
    created_by: PAGE_STATE.boot?.appUser?.id || null,
    updated_by: PAGE_STATE.boot?.appUser?.id || null
  };
  if (!payload.line_no || !payload.description) {
    showToast('Line no and description are required.', TOAST_TYPES.ERROR);
    return;
  }
  try {
    const { error } = await client.from('interior_estimate_lines').insert(payload);
    if (error) throw error;
    showToast('Estimate line added.', TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to add estimate line.', TOAST_TYPES.ERROR);
  }
}

async function deleteLine(event) {
  const id = event.currentTarget.dataset.estimateDelete;
  if (!id || !window.confirm('Delete this estimate line?')) return;
  try {
    const { error } = await client.from('interior_estimate_lines').delete().eq('id', id);
    if (error) throw error;
    showToast('Estimate line deleted.', TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to delete estimate line.', TOAST_TYPES.ERROR);
  }
}

function editLine(event) {
  const id = event.currentTarget.dataset.estimateEdit;
  const row = PAGE_STATE.lines.find((item) => item.id === id);
  if (!row) return;
  document.getElementById('estimateLineNo').value = row.line_no || '';
  document.getElementById('estimateLineBoqId').value = row.boq_line_id || '';
  document.getElementById('estimateLineDescription').value = row.description || '';
  document.getElementById('estimateLineSpace').value = row.space_id || '';
  document.getElementById('estimateLineSpec').value = row.material_spec_id || '';
  document.getElementById('estimateLineUom').value = row.uom || '';
  document.getElementById('estimateLineQty').value = row.quantity || 0;
  document.getElementById('estimateLineRate').value = row.unit_rate || 0;
  document.getElementById('estimateLineRemarks').value = row.remarks || '';
  syncLineAmountPreview();
  const button = document.getElementById('addEstimateLineBtn');
  button.textContent = 'Save Line';
  button.onclick = async () => {
    try {
      const payload = {
        boq_line_id: document.getElementById('estimateLineBoqId')?.value || null,
        line_no: Number(document.getElementById('estimateLineNo')?.value || 0),
        description: document.getElementById('estimateLineDescription')?.value?.trim() || '',
        space_id: document.getElementById('estimateLineSpace')?.value || null,
        material_spec_id: document.getElementById('estimateLineSpec')?.value || null,
        uom: document.getElementById('estimateLineUom')?.value?.trim() || null,
        quantity: Number(document.getElementById('estimateLineQty')?.value || 0),
        unit_rate: Number(document.getElementById('estimateLineRate')?.value || 0),
        remarks: document.getElementById('estimateLineRemarks')?.value?.trim() || null,
        updated_by: PAGE_STATE.boot?.appUser?.id || null
      };
      const { error } = await client.from('interior_estimate_lines').update(payload).eq('id', id);
      if (error) throw error;
      showToast('Estimate line updated.', TOAST_TYPES.SUCCESS);
      button.textContent = 'Add Line';
      button.onclick = null;
      await loadData();
      render();
      bindEvents();
    } catch (error) {
      showToast(error?.message || 'Failed to update estimate line.', TOAST_TYPES.ERROR);
    }
  };
}

function renderProjectOptions(selectedId) {
  return `<option value="">Select Project</option>${PAGE_STATE.projects.map((row) => `<option value="${row.shared_project_id}" ${String(selectedId||'')===String(row.shared_project_id)?'selected':''}>${escapeHtml(row.project_code || '')} - ${escapeHtml(row.project_title || row.project_name || '')}${row.client_name ? ` (${escapeHtml(row.client_name)})` : ''}</option>`).join('')}`;
}

function renderBoqOptions(projectId) {
  const rows = PAGE_STATE.boqHeaders.filter((row) => !projectId || String(row.project_id) === String(projectId));
  return `<option value="">No BOQ Source</option>${rows.map((row) => `<option value="${row.id}">${escapeHtml(row.boq_code)} - ${escapeHtml(row.boq_name)}</option>`).join('')}`;
}

function renderBoqLineOptions(projectId) {
  const rows = PAGE_STATE.boqLines.filter((row) => !projectId || String(row.project_id) === String(projectId));
  return `<option value="">No BOQ Line</option>${rows.map((row) => `<option value="${row.id}">${escapeHtml(String(row.line_no))} - ${escapeHtml(row.scope_item || '')}</option>`).join('')}`;
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
