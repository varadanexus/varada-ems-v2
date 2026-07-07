// Premium invoice PDF — rendered from a styled HTML document (html2canvas) so
// the logo, signature and stamp are used properly and the layout is polished.
// Returns { base64, filename, dataUri, save() }.

const COMPANY = {
  name: "Varada Nexus Private Limited",
  tagline: "Digital Services — Web · SEO · Social · PR",
  address: "80-17-28, K B Nagar, A V A Road, Rajahmundry, Andhra Pradesh - 533101",
  email: "accounts@varadanexus.com",
  website: "www.varadanexus.com",
  gstin: "37AAKCV7495B1ZV",
  stateCode: "37",
  stateName: "Andhra Pradesh",
  cin: "U43121AP2025PTC117741",
  sac: "998314",
  bank: { name: "Varada Nexus Private Limited", bank: "", account: "", ifsc: "" },
  logo: "/new-ems/assets/pdf/vn-logo.png",
  signature: "/new-ems/assets/pdf/vn-signature.png",
  stamp: "/new-ems/assets/pdf/vn-stamp.png"
};

const STATE_NAMES = { "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh" };

function esc(v) { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function rs(v) { return "₹" + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function numberToWords(num) {
  num = Math.round(Number(num) || 0);
  if (num === 0) return "Zero Rupees Only";
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n) => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
  const three = (n) => n >= 100 ? a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + two(n % 100) : "") : two(n);
  let r = "";
  const cr = Math.floor(num / 10000000); num %= 10000000;
  const la = Math.floor(num / 100000); num %= 100000;
  const th = Math.floor(num / 1000); num %= 1000;
  if (cr) r += three(cr) + " Crore ";
  if (la) r += three(la) + " Lakh ";
  if (th) r += three(th) + " Thousand ";
  if (num) r += three(num);
  return r.trim() + " Rupees Only";
}

function buildInvoiceHTML(invoice, items, client, company, opts = {}) {
  const isCreditNote = opts.docType === "credit_note";
  const seller = {
    name: (company && company.registration_name) || COMPANY.name,
    gstin: (company && company.gstin) || COMPANY.gstin,
    stateCode: (company && company.state_code) || COMPANY.stateCode
  };
  const clientState = (client.gstin || "").slice(0, 2);
  const interState = Boolean(seller.stateCode && clientState && seller.stateCode !== clientState);
  const isGst = Number(invoice.tax_amount || 0) > 0;
  const posCode = clientState || seller.stateCode;
  const posName = STATE_NAMES[posCode] || client.city || "";
  const tax = Number(invoice.tax_amount || 0), half = tax / 2;

  const rows = (items || []).map((it, i) => `
    <tr style="background:${i % 2 ? "#f8fafc" : "#ffffff"};">
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f7;">${esc(it.description)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f7;text-align:center;color:#64748b;">${esc(COMPANY.sac)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f7;text-align:center;">${Number(it.quantity)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f7;text-align:right;">${rs(it.unit_price)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f7;text-align:right;">${rs(it.line_total)}</td>
    </tr>`).join("");

  const metaRow = (k, v) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 12px;border-bottom:1px solid #eef2f7;font-size:11px;"><span style="color:#64748b;font-weight:700;">${esc(k)}</span><span style="color:#0f213b;font-weight:700;text-align:right;">${esc(v)}</span></div>`;
  const trow = (l, v, bold) => `<div style="display:flex;justify-content:space-between;padding:${bold ? "5px" : "3px"} 0;${bold ? "font-weight:800;font-size:14px;color:#0f213b;" : "color:#475569;font-size:12px;"}"><span>${esc(l)}</span><span>${v}</span></div>`;

  return `
  <div id="ds-invoice-root" style="width:794px;min-height:1123px;background:#fff;color:#1f2937;font-family:Arial,Helvetica,sans-serif;font-size:12px;position:relative;box-sizing:border-box;">
    <div style="height:6px;background:#c19b4c;"></div>
    <div style="background:#0f213b;color:#fff;padding:22px 34px;display:flex;justify-content:space-between;align-items:flex-start;">
      <div style="display:flex;gap:20px;align-items:center;">
        <img src="${COMPANY.logo}" crossorigin="anonymous" style="height:76px;width:104px;object-fit:contain;background:#ffffff;border-radius:14px;padding:10px 16px;box-shadow:0 3px 10px rgba(0,0,0,.28);" />
        <div>
          <div style="font-size:20px;font-weight:800;letter-spacing:.3px;">${esc(seller.name)}</div>
          <div style="font-size:11px;color:#e7c976;margin-top:3px;">${esc(COMPANY.tagline)}</div>
          <div style="font-size:10px;color:#cbd5e1;margin-top:6px;line-height:1.6;">${esc(COMPANY.address)}<br/>GSTIN: ${esc(seller.gstin)} &nbsp;·&nbsp; CIN: ${esc(COMPANY.cin)}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:22px;font-weight:800;letter-spacing:1.5px;">${isCreditNote ? "CREDIT NOTE" : (isGst ? "TAX INVOICE" : "INVOICE")}</div>
        <div style="font-size:13px;color:#e7c976;margin-top:8px;font-weight:700;">${esc(invoice.invoice_number)}</div>
        ${isCreditNote && opts.againstInvoice ? `<div style="font-size:11px;color:#cbd5e1;margin-top:4px;">Against Invoice: ${esc(opts.againstInvoice)}</div>` : ""}
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;gap:24px;padding:24px 34px 0;">
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:1.5px;">BILL TO</div>
        <div style="margin-top:7px;font-size:15px;font-weight:700;color:#0f213b;">${esc(client.company_name || client.name || "-")}</div>
        <div style="font-size:12px;color:#475569;line-height:1.7;margin-top:3px;">
          ${client.company_name && client.name ? esc(client.name) + "<br/>" : ""}
          ${client.address ? esc(client.address) + "<br/>" : ""}
          ${[client.city].filter(Boolean).map(esc).join("")}${client.city ? "<br/>" : ""}
          ${[client.email, client.phone].filter(Boolean).map(esc).join(" · ")}${(client.email || client.phone) ? "<br/>" : ""}
          ${client.gstin ? "GSTIN: " + esc(client.gstin) : ""}
        </div>
      </div>
      <div style="width:300px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;align-self:flex-start;">
        ${metaRow("Invoice No", invoice.invoice_number)}
        ${metaRow("Date", invoice.issue_date)}
        ${metaRow("Due Date", invoice.due_date || "-")}
        ${metaRow("Type", invoice.invoice_type)}
        ${metaRow("Place of Supply", posName ? `${posCode} - ${posName}` : (posCode || "-"))}
      </div>
    </div>

    <div style="padding:22px 34px 0;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <thead><tr style="background:#0f213b;color:#fff;">
          <th style="padding:9px 10px;text-align:left;">Description</th>
          <th style="padding:9px 10px;text-align:center;width:74px;">SAC</th>
          <th style="padding:9px 10px;text-align:center;width:48px;">Qty</th>
          <th style="padding:9px 10px;text-align:right;width:96px;">Rate</th>
          <th style="padding:9px 10px;text-align:right;width:104px;">Amount</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div style="display:flex;justify-content:space-between;gap:24px;padding:16px 34px 0;">
      <div style="flex:1;font-size:11px;color:#475569;line-height:1.7;padding-top:4px;">
        <span style="font-weight:800;color:#0f213b;">Amount in words:</span> ${esc(numberToWords(invoice.total_amount))}
        ${isCreditNote && opts.reason ? `<div style="margin-top:6px;"><span style="font-weight:800;color:#0f213b;">Reason:</span> ${esc(opts.reason)}</div>` : ""}
      </div>
      <div style="width:300px;">
        ${trow(isGst ? "Taxable Value" : "Amount", rs(invoice.subtotal))}
        ${isGst ? (interState ? trow("IGST", rs(tax)) : trow("CGST", rs(half)) + trow("SGST", rs(half))) : ""}
        <div style="border-top:2px solid #c19b4c;margin:5px 0;"></div>
        ${trow("Total" + (isGst ? " (incl. GST)" : ""), rs(invoice.total_amount), true)}
        ${Number(invoice.amount_paid) > 0 ? trow("Paid", rs(invoice.amount_paid)) + trow("Balance Due", rs(Number(invoice.total_amount) - Number(invoice.amount_paid)), true) : ""}
      </div>
    </div>

    <div style="position:absolute;left:34px;right:34px;bottom:66px;display:flex;justify-content:space-between;align-items:flex-end;">
      <div style="font-size:10.5px;color:#475569;line-height:1.7;max-width:320px;">
        <div style="font-weight:800;color:#0f213b;letter-spacing:.3px;">TERMS</div>
        Payment due by the due date. Please quote the invoice number with payment.
        ${COMPANY.bank.account ? `<div style="font-weight:800;color:#0f213b;margin-top:8px;letter-spacing:.3px;">BANK DETAILS</div>A/c: ${esc(COMPANY.bank.name)} · ${esc(COMPANY.bank.bank)}<br/>A/c No: ${esc(COMPANY.bank.account)} · IFSC: ${esc(COMPANY.bank.ifsc)}` : ""}
      </div>
      <div style="text-align:center;width:210px;">
        <div style="font-size:11px;color:#475569;margin-bottom:2px;">For ${esc(seller.name)}</div>
        <div style="position:relative;height:92px;">
          <img src="${COMPANY.stamp}" crossorigin="anonymous" style="position:absolute;left:14px;top:2px;height:84px;opacity:.9;" />
          <img src="${COMPANY.signature}" crossorigin="anonymous" style="position:absolute;right:10px;top:24px;height:58px;" />
        </div>
        <div style="border-top:1px solid #94a3b8;margin-top:2px;padding-top:4px;font-size:11px;color:#475569;">Authorised Signatory</div>
      </div>
    </div>

    <div style="position:absolute;left:0;right:0;bottom:0;border-top:2px solid #c19b4c;padding:9px 34px;font-size:10px;color:#64748b;display:flex;justify-content:space-between;">
      <span>${isCreditNote ? "This is a computer-generated credit note." : (isGst ? "This is a computer-generated tax invoice." : "Computer-generated invoice — GST not applicable (Bill of Supply).")}</span>
      <span>${esc(COMPANY.email)} · ${esc(COMPANY.website)}</span>
    </div>
  </div>`;
}

export async function generateInvoicePdf(invoice, items = [], client = {}, company = null, opts = {}) {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([
    import("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm"),
    import("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm")
  ]);
  const html2canvas = html2canvasMod.default || html2canvasMod;

  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;";
  holder.innerHTML = buildInvoiceHTML(invoice, items, client, company, opts);
  document.body.appendChild(holder);
  const node = holder.firstElementChild;

  // Wait for logo/signature/stamp to load.
  await Promise.all(Array.from(node.querySelectorAll("img")).map((img) => img.complete
    ? Promise.resolve()
    : new Promise((res) => { img.onload = res; img.onerror = res; })));

  try {
    const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pw = 210, ph = 297;
    const imgH = canvas.height * pw / canvas.width;
    doc.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, pw, Math.min(imgH, ph));
    const dataUri = doc.output("datauristring");
    const filename = `${String(invoice.invoice_number || "invoice").replace(/[\\/]/g, "-")}.pdf`;
    return { base64: dataUri.split(",")[1], dataUri, filename, save: () => doc.save(filename) };
  } finally {
    holder.remove();
  }
}

export async function downloadInvoicePdf(invoice, items, client, company) {
  const pdf = await generateInvoicePdf(invoice, items, client, company);
  pdf.save();
  return pdf;
}

function ensurePdfStyles() {
  if (document.getElementById("dspdf-styles")) return;
  const s = document.createElement("style");
  s.id = "dspdf-styles";
  s.textContent = `
    .dspdf-overlay{position:fixed;inset:0;background:rgba(4,10,20,.72);backdrop-filter:blur(3px);z-index:5000;display:flex;align-items:center;justify-content:center;padding:3vh 2vw;}
    .dspdf-modal{width:min(920px,96vw);height:92vh;background:#0b1324;border:1px solid rgba(148,163,184,.3);border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6);}
    .dspdf-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.65rem 1rem;border-bottom:1px solid rgba(148,163,184,.18);color:#e8eef7;}
    .dspdf-head strong{font-size:.92rem;}
    .dspdf-actions{display:flex;align-items:center;gap:.6rem;}
    .dspdf-close{background:transparent;border:none;color:#8aa0bf;font-size:1.6rem;line-height:1;cursor:pointer;padding:0 .3rem;}
    .dspdf-close:hover{color:#fff;}
    .dspdf-frame{flex:1;width:100%;border:none;background:#525659;}
  `;
  document.head.appendChild(s);
}

export function openPdfModal(pdf) {
  ensurePdfStyles();
  document.querySelector(".dspdf-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "dspdf-overlay";
  overlay.innerHTML = `
    <div class="dspdf-modal" role="dialog" aria-modal="true">
      <div class="dspdf-head">
        <strong>${String(pdf.filename || "Invoice").replace(/[<>&"]/g, "")}</strong>
        <div class="dspdf-actions">
          <button class="btn dspdf-dl" type="button">Download</button>
          <button class="dspdf-close" type="button" aria-label="Close">&times;</button>
        </div>
      </div>
      <iframe class="dspdf-frame" src="${pdf.dataUri}" title="Invoice PDF"></iframe>
    </div>`;
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector(".dspdf-close").addEventListener("click", close);
  overlay.querySelector(".dspdf-dl").addEventListener("click", () => pdf.save());
  document.addEventListener("keydown", function onKey(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } });
  document.body.appendChild(overlay);
  return overlay;
}
