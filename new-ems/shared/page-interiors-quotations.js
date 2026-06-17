import { MODULES, WORKSPACES, TOAST_TYPES } from "../config/constants.js";
import { bootstrapProtectedPage, renderModuleContent } from "./layout.js";
import { showToast } from "./utils.js";

const PAGE_STATE = {
  boot: null,
  headers: [],
  lines: [],
  estimates: [],
  estimateLines: [],
  projects: [],
  spaces: [],
  selectedHeaderId: ""
};

async function init() {
  const boot = await bootstrapProtectedPage({
    moduleCode: MODULES.INTERIORS_QUOTATIONS,
    pageTitle: "Quotations",
    pageDescription: "Quotation release workflow for interior projects",
    workspace: WORKSPACES.INTERIORS
  });
  if (!boot) return;
  PAGE_STATE.boot = boot;
  await loadData();
  render();
  bindEvents();
}

async function loadData() {
  const [headersRes, linesRes, estimatesRes, estimateLinesRes, projectsRes, spacesRes] = await Promise.all([
    window.supabase.from("interior_quotation_headers").select("id, project_id, quotation_code, quotation_name, revision_no, status, valid_until, total_amount, projects(project_code, project_name)").order("created_at", { ascending: false }),
    window.supabase.from("interior_quotation_lines").select("*").order("line_no", { ascending: true }),
    window.supabase.from("interior_estimate_headers").select("id, project_id, estimate_code, estimate_name, revision_no, total_amount").order("created_at", { ascending: false }),
    window.supabase.from("interior_estimate_lines").select("*").order("line_no", { ascending: true }),
    window.supabase.from("projects").select("id, project_code, project_name").is("deleted_at", null).order("project_name"),
    window.supabase.from("interior_spaces").select("id, project_id, space_code, space_name").order("space_name")
  ]);

  PAGE_STATE.headers = headersRes.data || [];
  PAGE_STATE.lines = linesRes.data || [];
  PAGE_STATE.estimates = estimatesRes.data || [];
  PAGE_STATE.estimateLines = estimateLinesRes.data || [];
  PAGE_STATE.projects = projectsRes.data || [];
  PAGE_STATE.spaces = spacesRes.data || [];
  if (!PAGE_STATE.selectedHeaderId && PAGE_STATE.headers[0]?.id) PAGE_STATE.selectedHeaderId = PAGE_STATE.headers[0].id;
}

function render() {
  const selectedHeader = PAGE_STATE.headers.find((row) => row.id === PAGE_STATE.selectedHeaderId) || null;
  const selectedLines = PAGE_STATE.lines.filter((row) => row.quotation_header_id === PAGE_STATE.selectedHeaderId);
  renderModuleContent(`
    <section class="card">
      <style>
        .int-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem 1rem}.int-grid .full{grid-column:1/-1}
        .int-grid label{display:block;font-weight:600;margin-bottom:.35rem}.int-grid input,.int-grid select,.int-grid textarea{width:100%}
        .int-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem}.int-shell{display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:1rem}.muted-box{border:1px dashed #cbd5e1;border-radius:12px;padding:.75rem}
        @media (max-width:980px){.int-shell{grid-template-columns:1fr}.int-grid{grid-template-columns:1fr}}
      </style>
      <h3>Quotation Workflow</h3>
      <p class="muted">Create quotations from estimates, maintain revision support, set valid-until, and drive release/accepted/rejected outcomes.</p>
      <div class="hero-kpis">
        <span class="meta-pill">Quotations: ${PAGE_STATE.headers.length}</span>
        <span class="meta-pill">Quotation Lines: ${PAGE_STATE.lines.length}</span>
        <span class="meta-pill">Selected Total: ${formatMoney(selectedHeader?.total_amount || 0)}</span>
      </div>
    </section>

    <section class="int-shell" style="margin-top:1rem;">
      <section class="card">
        <h4>Header</h4>
        <div class="int-grid">
          <div class="full"><label for="quotationHeaderSelect">Open Header</label><select id="quotationHeaderSelect"><option value="">Create New Quotation</option>${PAGE_STATE.headers.map((row) => `<option value="${row.id}" ${row.id === PAGE_STATE.selectedHeaderId ? 'selected' : ''}>${escapeHtml(row.quotation_code)} - ${escapeHtml(row.quotation_name)}</option>`).join('')}</select></div>
          <div><label for="quotationProjectId">Project *</label><select id="quotationProjectId">${renderProjectOptions(selectedHeader?.project_id)}</select></div>
          <div><label for="quotationFromEstimateId">Create from Estimate</label><select id="quotationFromEstimateId">${renderEstimateOptions(selectedHeader?.project_id)}</select></div>
          <div><label for="quotationCode">Quotation Code *</label><input id="quotationCode" type="text" value="${escapeAttr(selectedHeader?.quotation_code || '')}" /></div>
          <div><label for="quotationName">Quotation Name *</label><input id="quotationName" type="text" value="${escapeAttr(selectedHeader?.quotation_name || '')}" /></div>
          <div><label for="quotationRevision">Revision *</label><input id="quotationRevision" type="number" min="1" step="1" value="${escapeAttr(String(selectedHeader?.revision_no || 1))}" /></div>
          <div><label for="quotationStatus">Status *</label><select id="quotationStatus">${renderOptions(['draft','released','accepted','rejected','approved','superseded','archived'], selectedHeader?.status || 'draft')}</select></div>
          <div><label for="quotationValidUntil">Valid Until</label><input id="quotationValidUntil" type="date" value="${escapeAttr(selectedHeader?.valid_until || '')}" /></div>
          <div class="full"><label for="quotationDescription">Description</label><textarea id="quotationDescription" rows="3"></textarea></div>
        </div>
        <div class="int-actions">
          <button class="btn" id="saveQuotationHeaderBtn" type="button">${selectedHeader ? 'Save Header' : 'Create Header'}</button>
          ${!selectedHeader ? `<button class="btn" id="createQuotationFromEstimateBtn" type="button">Create From Estimate</button>` : ''}
          ${selectedHeader ? `<button class="btn" id="markQuotationReleasedBtn" type="button">Release</button><button class="btn" id="markQuotationAcceptedBtn" type="button">Accept</button><button class="btn btn-danger" id="markQuotationRejectedBtn" type="button">Reject</button>` : ''}
        </div>
      </section>

      <section class="card">
        <h4>Lines</h4>
        ${selectedHeader ? `
          <div class="muted-box" style="margin-bottom:1rem;">Header Total: <strong>${formatMoney(selectedHeader.total_amount || 0)}</strong></div>
          <div class="int-grid">
            <div><label for="quotationLineNo">Line No *</label><input id="quotationLineNo" type="number" min="1" step="1" value="${selectedLines.length + 1}" /></div>
            <div><label for="quotationLineEstimateId">Estimate Source Line</label><select id="quotationLineEstimateId">${renderEstimateLineOptions(selectedHeader.project_id)}</select></div>
            <div class="full"><label for="quotationLineDescription">Description *</label><textarea id="quotationLineDescription" rows="2"></textarea></div>
            <div><label for="quotationLineSpace">Space</label><select id="quotationLineSpace">${renderEntityOptions(PAGE_STATE.spaces, 'space_code', 'space_name', selectedHeader.project_id)}</select></div>
            <div><label for="quotationLineUom">UOM</label><input id="quotationLineUom" type="text" /></div>
            <div><label for="quotationLineQty">Quantity *</label><input id="quotationLineQty" type="number" min="0" step="0.001" value="0" /></div>
            <div><label for="quotationLineRate">Unit Rate *</label><input id="quotationLineRate" type="number" min="0" step="0.01" value="0" /></div>
            <div><label for="quotationLineAmount">Line Amount</label><input id="quotationLineAmount" type="text" value="₹0.00" readonly /></div>
            <div class="full"><label for="quotationLineRemarks">Remarks</label><textarea id="quotationLineRemarks" rows="2"></textarea></div>
          </div>
          <div class="int-actions"><button class="btn" id="addQuotationLineBtn" type="button">Add Line</button></div>
          <div class="table-container" style="margin-top:1rem;">
            <table>
              <thead><tr><th>No</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th><th>Actions</th></tr></thead>
              <tbody>${selectedLines.length ? selectedLines.map((row) => `<tr>
                <td>${escapeHtml(String(row.line_no || '-'))}</td>
                <td>${escapeHtml(row.description || '-')}${row.estimate_line_id ? `<br/><span class="muted">From Estimate Line</span>` : ''}</td>
                <td>${escapeHtml(String(row.quantity || 0))}</td>
                <td>${formatMoney(row.unit_rate || 0)}</td>
                <td>${formatMoney(row.line_amount || 0)}</td>
                <td><button class="btn btn-sm" data-quotation-edit="${row.id}" type="button">Edit</button> <button class="btn btn-sm btn-danger" data-quotation-delete="${row.id}" type="button">Delete</button></td>
              </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;padding:2rem;">No lines added yet.</td></tr>`}</tbody>
            </table>
          </div>
        ` : `<p class="muted">Create a quotation header first, or generate one from an estimate.</p>`}
      </section>
    </section>
  `);
}

function bindEvents() {
  document.getElementById('quotationHeaderSelect')?.addEventListener('change', (event) => {
    PAGE_STATE.selectedHeaderId = event.target.value || '';
    render();
    bindEvents();
  });
  document.getElementById('quotationProjectId')?.addEventListener('change', () => {
    render();
    bindEvents();
  });
  document.getElementById('quotationLineEstimateId')?.addEventListener('change', hydrateFromEstimateLine);
  document.getElementById('quotationLineQty')?.addEventListener('input', syncLineAmountPreview);
  document.getElementById('quotationLineRate')?.addEventListener('input', syncLineAmountPreview);
  document.getElementById('saveQuotationHeaderBtn')?.addEventListener('click', saveHeader);
  document.getElementById('createQuotationFromEstimateBtn')?.addEventListener('click', createFromEstimate);
  document.getElementById('addQuotationLineBtn')?.addEventListener('click', addLine);
  document.getElementById('markQuotationReleasedBtn')?.addEventListener('click', () => updateStatus('released'));
  document.getElementById('markQuotationAcceptedBtn')?.addEventListener('click', () => updateStatus('accepted'));
  document.getElementById('markQuotationRejectedBtn')?.addEventListener('click', () => updateStatus('rejected'));
  document.querySelectorAll('[data-quotation-delete]').forEach((btn) => btn.addEventListener('click', deleteLine));
  document.querySelectorAll('[data-quotation-edit]').forEach((btn) => btn.addEventListener('click', editLine));
}

function syncLineAmountPreview() {
  const qty = Number(document.getElementById('quotationLineQty')?.value || 0);
  const rate = Number(document.getElementById('quotationLineRate')?.value || 0);
  const target = document.getElementById('quotationLineAmount');
  if (target) target.value = formatMoney(qty * rate);
}

function hydrateFromEstimateLine() {
  const id = document.getElementById('quotationLineEstimateId')?.value || '';
  const row = PAGE_STATE.estimateLines.find((item) => item.id === id);
  if (!row) return;
  document.getElementById('quotationLineDescription').value = row.description || '';
  document.getElementById('quotationLineSpace').value = row.space_id || '';
  document.getElementById('quotationLineUom').value = row.uom || '';
  document.getElementById('quotationLineQty').value = row.quantity || 0;
  document.getElementById('quotationLineRate').value = row.unit_rate || 0;
  syncLineAmountPreview();
}

async function saveHeader() {
  const payload = {
    project_id: document.getElementById('quotationProjectId')?.value || null,
    quotation_code: document.getElementById('quotationCode')?.value?.trim() || '',
    quotation_name: document.getElementById('quotationName')?.value?.trim() || '',
    revision_no: Number(document.getElementById('quotationRevision')?.value || 1),
    status: document.getElementById('quotationStatus')?.value || 'draft',
    valid_until: document.getElementById('quotationValidUntil')?.value || null,
    description: document.getElementById('quotationDescription')?.value?.trim() || null,
    updated_by: PAGE_STATE.boot?.appUser?.id || null,
    created_by: PAGE_STATE.boot?.appUser?.id || null
  };
  if (!payload.project_id || !payload.quotation_code || !payload.quotation_name) {
    showToast('Project, quotation code, and quotation name are required.', TOAST_TYPES.ERROR);
    return;
  }
  try {
    if (PAGE_STATE.selectedHeaderId) {
      const { error } = await window.supabase.from('interior_quotation_headers').update(payload).eq('id', PAGE_STATE.selectedHeaderId);
      if (error) throw error;
      showToast('Quotation header updated.', TOAST_TYPES.SUCCESS);
    } else {
      const { data, error } = await window.supabase.from('interior_quotation_headers').insert(payload).select('id').single();
      if (error) throw error;
      PAGE_STATE.selectedHeaderId = data.id;
      showToast('Quotation header created.', TOAST_TYPES.SUCCESS);
    }
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to save quotation header.', TOAST_TYPES.ERROR);
  }
}

async function createFromEstimate() {
  const projectId = document.getElementById('quotationProjectId')?.value || null;
  const estimateHeaderId = document.getElementById('quotationFromEstimateId')?.value || null;
  if (!projectId || !estimateHeaderId) {
    showToast('Select project and estimate source first.', TOAST_TYPES.ERROR);
    return;
  }
  const estimate = PAGE_STATE.estimates.find((row) => row.id === estimateHeaderId);
  const estimateLines = PAGE_STATE.estimateLines.filter((row) => row.estimate_header_id === estimateHeaderId);
  try {
    const { data: header, error: headerError } = await window.supabase.from('interior_quotation_headers').insert({
      project_id: projectId,
      quotation_code: `${estimate?.estimate_code || 'QTN'}-QTN`,
      quotation_name: `${estimate?.estimate_name || 'Estimate'} Quotation`,
      revision_no: 1,
      status: 'draft',
      valid_until: null,
      description: `Created from estimate ${estimate?.estimate_code || ''}`,
      created_by: PAGE_STATE.boot?.appUser?.id || null,
      updated_by: PAGE_STATE.boot?.appUser?.id || null
    }).select('id').single();
    if (headerError) throw headerError;
    if (estimateLines.length) {
      const { error: lineError } = await window.supabase.from('interior_quotation_lines').insert(estimateLines.map((row, index) => ({
        project_id: projectId,
        quotation_header_id: header.id,
        estimate_line_id: row.id,
        line_no: index + 1,
        description: row.description,
        space_id: row.space_id,
        uom: row.uom,
        quantity: row.quantity,
        unit_rate: row.unit_rate,
        line_amount: row.line_amount,
        remarks: row.remarks,
        created_by: PAGE_STATE.boot?.appUser?.id || null,
        updated_by: PAGE_STATE.boot?.appUser?.id || null
      })));
      if (lineError) throw lineError;
    }
    PAGE_STATE.selectedHeaderId = header.id;
    showToast('Quotation created from estimate.', TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to create quotation from estimate.', TOAST_TYPES.ERROR);
  }
}

async function addLine() {
  const selectedHeader = PAGE_STATE.headers.find((row) => row.id === PAGE_STATE.selectedHeaderId);
  if (!selectedHeader) return;
  const payload = {
    project_id: selectedHeader.project_id,
    quotation_header_id: selectedHeader.id,
    estimate_line_id: document.getElementById('quotationLineEstimateId')?.value || null,
    line_no: Number(document.getElementById('quotationLineNo')?.value || 0),
    description: document.getElementById('quotationLineDescription')?.value?.trim() || '',
    space_id: document.getElementById('quotationLineSpace')?.value || null,
    uom: document.getElementById('quotationLineUom')?.value?.trim() || null,
    quantity: Number(document.getElementById('quotationLineQty')?.value || 0),
    unit_rate: Number(document.getElementById('quotationLineRate')?.value || 0),
    remarks: document.getElementById('quotationLineRemarks')?.value?.trim() || null,
    created_by: PAGE_STATE.boot?.appUser?.id || null,
    updated_by: PAGE_STATE.boot?.appUser?.id || null
  };
  if (!payload.line_no || !payload.description) {
    showToast('Line no and description are required.', TOAST_TYPES.ERROR);
    return;
  }
  try {
    const { error } = await window.supabase.from('interior_quotation_lines').insert(payload);
    if (error) throw error;
    showToast('Quotation line added.', TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to add quotation line.', TOAST_TYPES.ERROR);
  }
}

async function deleteLine(event) {
  const id = event.currentTarget.dataset.quotationDelete;
  if (!id || !window.confirm('Delete this quotation line?')) return;
  try {
    const { error } = await window.supabase.from('interior_quotation_lines').delete().eq('id', id);
    if (error) throw error;
    showToast('Quotation line deleted.', TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || 'Failed to delete quotation line.', TOAST_TYPES.ERROR);
  }
}

function editLine(event) {
  const id = event.currentTarget.dataset.quotationEdit;
  const row = PAGE_STATE.lines.find((item) => item.id === id);
  if (!row) return;
  document.getElementById('quotationLineNo').value = row.line_no || '';
  document.getElementById('quotationLineEstimateId').value = row.estimate_line_id || '';
  document.getElementById('quotationLineDescription').value = row.description || '';
  document.getElementById('quotationLineSpace').value = row.space_id || '';
  document.getElementById('quotationLineUom').value = row.uom || '';
  document.getElementById('quotationLineQty').value = row.quantity || 0;
  document.getElementById('quotationLineRate').value = row.unit_rate || 0;
  document.getElementById('quotationLineRemarks').value = row.remarks || '';
  syncLineAmountPreview();
  const button = document.getElementById('addQuotationLineBtn');
  button.textContent = 'Save Line';
  button.onclick = async () => {
    try {
      const payload = {
        estimate_line_id: document.getElementById('quotationLineEstimateId')?.value || null,
        line_no: Number(document.getElementById('quotationLineNo')?.value || 0),
        description: document.getElementById('quotationLineDescription')?.value?.trim() || '',
        space_id: document.getElementById('quotationLineSpace')?.value || null,
        uom: document.getElementById('quotationLineUom')?.value?.trim() || null,
        quantity: Number(document.getElementById('quotationLineQty')?.value || 0),
        unit_rate: Number(document.getElementById('quotationLineRate')?.value || 0),
        remarks: document.getElementById('quotationLineRemarks')?.value?.trim() || null,
        updated_by: PAGE_STATE.boot?.appUser?.id || null
      };
      const { error } = await window.supabase.from('interior_quotation_lines').update(payload).eq('id', id);
      if (error) throw error;
      showToast('Quotation line updated.', TOAST_TYPES.SUCCESS);
      button.textContent = 'Add Line';
      button.onclick = null;
      await loadData();
      render();
      bindEvents();
    } catch (error) {
      showToast(error?.message || 'Failed to update quotation line.', TOAST_TYPES.ERROR);
    }
  };
}

async function updateStatus(status) {
  if (!PAGE_STATE.selectedHeaderId) return;
  try {
    const { error } = await window.supabase.from('interior_quotation_headers').update({ status, updated_by: PAGE_STATE.boot?.appUser?.id || null }).eq('id', PAGE_STATE.selectedHeaderId);
    if (error) throw error;
    showToast(`Quotation marked ${status}.`, TOAST_TYPES.SUCCESS);
    await loadData();
    render();
    bindEvents();
  } catch (error) {
    showToast(error?.message || `Failed to set quotation status to ${status}.`, TOAST_TYPES.ERROR);
  }
}

function renderProjectOptions(selectedId) {
  return `<option value="">Select Project</option>${PAGE_STATE.projects.map((row) => `<option value="${row.id}" ${String(selectedId||'')===String(row.id)?'selected':''}>${escapeHtml(row.project_code)} - ${escapeHtml(row.project_name)}</option>`).join('')}`;
}

function renderEstimateOptions(projectId) {
  const rows = PAGE_STATE.estimates.filter((row) => !projectId || String(row.project_id) === String(projectId));
  return `<option value="">No Estimate Source</option>${rows.map((row) => `<option value="${row.id}">${escapeHtml(row.estimate_code)} - ${escapeHtml(row.estimate_name)}</option>`).join('')}`;
}

function renderEstimateLineOptions(projectId) {
  const rows = PAGE_STATE.estimateLines.filter((row) => !projectId || String(row.project_id) === String(projectId));
  return `<option value="">No Estimate Line</option>${rows.map((row) => `<option value="${row.id}">${escapeHtml(String(row.line_no))} - ${escapeHtml(row.description || '')}</option>`).join('')}`;
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