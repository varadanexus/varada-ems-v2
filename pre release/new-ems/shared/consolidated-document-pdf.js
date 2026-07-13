import { addDetailsSection, addDocumentFooter, addOldEmsBankDetailsBlock, addOldEmsClientDetailsBlock, addOldEmsCompanyHeader, addOldEmsDeclarationBlock, addOldEmsSignatureStampBlock, addOldEmsTaxSummaryBlock, addTable, createPdfDocument, formatPdfCurrency, formatPdfDate, formatPdfFilename, formatPdfQuantity } from "./pdf-utils.js";

export async function createConsolidatedSourcePdf(source) {
  if (source?.kind === "client_bill") return createClientBillPdf(source);
  if (source?.kind === "transporter_statement") return createStatementPdf(source);
  if (source?.kind === "credit_note") return createCreditNotePdf(source);
  if (source?.kind === "interior_bill") return createInteriorBillPdf(source);
  const doc = await createPdfDocument();
  const h = source?.header || {};
  const fd = source?.financial_document || {};
  const party = source?.party || {};
  const kind = source?.kind || "generic";
  const config = {
    client_bill: { title: "CLIENT BILL", no: h.bill_no, date: h.bill_date },
    transporter_statement: { title: "TRANSPORTER STATEMENT", no: h.statement_no, date: h.statement_date },
    credit_note: { title: "CREDIT NOTE", no: h.credit_note_no, date: h.credit_note_date },
    interior_bill: { title: "INTERIORS BILL", no: h.bill_number, date: h.bill_date },
    generic: { title: String(fd.document_family || "ACCOUNTING DOCUMENT").replaceAll("_"," "), no: fd.source_document_no, date: fd.document_date }
  }[kind];
  await addDocumentHeader(doc, { title: config.title, fields: [
    { label: "Document No", value: config.no || "-" }, { label: "Date", value: formatPdfDate(config.date) },
    { label: "Party / Project", value: party.company_name || party.name || "-" }, { label: "Status", value: h.status || fd.status || "-" }
  ]});
  let y = addDetailsSection(doc, "Document Summary", summaryFields(kind, h, fd), 48);
  const table = lineTable(kind, source?.lines || []);
  if (table.body.length) y = addTable(doc, { head: [table.head], body: table.body, startY: y + 5 });
  addDetailsSection(doc, "Accounting Totals", [
    { label: "Taxable Value", value: formatPdfCurrency(h.taxable_value ?? h.amount ?? fd.taxable_amount) },
    { label: "Tax Amount", value: formatPdfCurrency(h.gst_amount ?? h.tax_amount ?? fd.tax_amount) },
    { label: "Gross / Net Total", value: formatPdfCurrency(h.invoice_total ?? h.net_payable_total ?? h.total_amount ?? fd.net_amount ?? fd.gross_amount) }
  ], Math.min(y + 6, 245));
  await addDocumentFooter(doc, "System-generated source document preview from Central Accounts.");
  return { doc, filename: formatPdfFilename(config.title, config.no || fd.id) };
}

async function createClientBillPdf(source) {
  const doc = await createPdfDocument(), h = source.header || {}, party = source.party || {}, lines = source.lines || [];
  let y = await addOldEmsCompanyHeader(doc, { title: h.billing_type === "GST" ? "GST Invoice" : "Client Bill", verifiedText: "Digitally Verified" });
  y = addOldEmsClientDetailsBlock(doc, {
    client: { name: party.company_name || party.name || "—", address: party.address || "N/A", gstin: party.gstin || party.gst_number || "N/A" },
    invoice: { billNo: h.bill_no || "—", billDate: formatPdfDate(h.bill_date), placeOfSupply: "Andhra Pradesh", stateCode: "37", invoiceType: party.gstin || party.gst_number ? "B2B" : "B2C" },
    startY: 40
  });
  y = addTable(doc, {
    startY: y + 8,
    head: ["Trip No","Truck No","Date","Qty MT","Freight Charges","Service Charges","GST"],
    body: lines.map(l => [l.trip_no||"—","N/A",formatPdfDate(l.trip_date),formatPdfQuantity(l.quantity_mt),formatPdfCurrency(l.client_net_receivable||l.client_gross_amount),formatPdfCurrency(0),formatPdfCurrency(0)]),
    foot: ["TOTAL","","",formatPdfQuantity(lines.reduce((s,l)=>s+Number(l.quantity_mt||0),0)),formatPdfCurrency(lines.reduce((s,l)=>s+Number(l.client_net_receivable||l.client_gross_amount||0),0)),formatPdfCurrency(0),formatPdfCurrency(h.gst_amount||0)],
    options:{headFillColor:[0,102,204]}
  });
  const sy=y+5;
  const summaryEnd=addOldEmsTaxSummaryBlock(doc,{startY:sy,marginLeft:110,tableWidth:85,rows:[
    {label:"Gross Total",value:formatPdfCurrency(h.gross_total||h.taxable_value)},
    {label:"Support Deduction Total",value:formatPdfCurrency(h.support_deduction_total)},
    ...(Number(h.gst_amount||0)>0?[{label:`GST (${Number(h.gst_percentage||0)}%)`,value:formatPdfCurrency(h.gst_amount)}]:[]),
    [{content:"Net Receivable",styles:{fontStyle:"bold"}},{content:formatPdfCurrency(h.invoice_total||h.net_receivable),styles:{fontStyle:"bold"}}]
  ]});
  const bankEnd=addOldEmsBankDetailsBlock(doc,{startY:sy,marginLeft:15,tableWidth:90});
  addOldEmsDeclarationBlock(doc,{startY:Math.max(summaryEnd,bankEnd)+8,text:"This is a system-generated client bill from the approved source document. Supporting trip records are retained in EMS.",width:90});
  await addOldEmsSignatureStampBlock(doc,{startY:248});
  return {doc,filename:formatPdfFilename(h.billing_type==="GST"?"INV":"CB",h.bill_no||"client-bill")};
}

async function createStatementPdf(source) {
  const doc=await createPdfDocument(),h=source.header||{},party=source.party||{},lines=source.lines||[];
  let y=await addOldEmsCompanyHeader(doc,{title:"Transporter Statement",verifiedText:"Digitally Verified"});
  doc.setFont("helvetica","bold");doc.setFontSize(10);doc.text("Transporter Details",15,y+10);
  doc.setFont("helvetica","normal");doc.setFontSize(9);
  [`Name: ${party.name||"N/A"}`,`Address: ${party.address||"N/A"}`,`GSTIN: ${party.gstin||party.gst_number||"N/A"}`,`Contact No: ${party.phone_number||party.contact_no||"N/A"}`].forEach((v,i)=>doc.text(doc.splitTextToSize(v,105),15,y+17+i*6));
  doc.text(`Statement No: ${h.statement_no||"—"}`,145,y+17);doc.text(`Date: ${formatPdfDate(h.statement_date)}`,145,y+24);doc.text(`Status: ${String(h.status||"—").toUpperCase()}`,145,y+31);y+=43;doc.line(15,y,195,y);
  y=addTable(doc,{startY:y+5,head:["Trip No","Truck No","Date","Qty MT","Freight Charges","Expenses","Net Payable"],body:lines.map(l=>[l.trip_no||"—","N/A",formatPdfDate(l.trip_date),formatPdfQuantity(l.quantity_mt),formatPdfCurrency(l.transporter_gross_payable),formatPdfCurrency(l.support_deduction_amount),formatPdfCurrency(l.transporter_net_payable)]),foot:["TOTAL","","",formatPdfQuantity(lines.reduce((s,l)=>s+Number(l.quantity_mt||0),0)),formatPdfCurrency(h.gross_payable_total),formatPdfCurrency(h.support_deduction_total),formatPdfCurrency(h.net_payable_total)],options:{headFillColor:[0,102,204]}});
  y=addOldEmsTaxSummaryBlock(doc,{startY:y+5,marginLeft:110,tableWidth:85,title:"Statement Summary",rows:[{label:"Gross Freight Charges",value:formatPdfCurrency(h.gross_payable_total)},{label:"Expenses",value:formatPdfCurrency(h.support_deduction_total)},...(Number(h.penalty_amount||0)>0?[{label:"Penalty",value:formatPdfCurrency(h.penalty_amount)}]:[]),[{content:"Net Payable",styles:{fontStyle:"bold"}},{content:formatPdfCurrency(h.net_payable_total),styles:{fontStyle:"bold"}}]]})+8;
  addOldEmsDeclarationBlock(doc,{startY:y,text:"This is a system-generated transporter payable statement based on approved trips and deductions.",width:90,title:"Declaration:"});await addOldEmsSignatureStampBlock(doc,{startY:248});
  return {doc,filename:formatPdfFilename("TS",h.statement_no||"transporter-statement")};
}

async function createCreditNotePdf(source) {
  const doc=await createPdfDocument(),h=source.header||{},p=source.party||{};
  let y=await addOldEmsCompanyHeader(doc,{title:"Credit Note",verifiedText:"Digitally Verified"});
  y=addDetailsSection(doc,"Credit Note Details",[{label:"Credit Note No",value:h.credit_note_no||"—"},{label:"Date",value:formatPdfDate(h.credit_note_date)},{label:"Client",value:p.company_name||p.name||"—"},{label:"Bill Reference",value:h.client_bill_id||"—"},{label:"Reason",value:h.reason||"—"},{label:"Amount",value:formatPdfCurrency(h.credit_note_amount)},{label:"Status",value:h.status||"—"}],y+8);
  addOldEmsDeclarationBlock(doc,{startY:y+10,text:"This credit note adjusts the referenced client bill and is reflected in Central Accounts.",width:120});await addOldEmsSignatureStampBlock(doc,{startY:248});
  return {doc,filename:formatPdfFilename("CN",h.credit_note_no||"credit-note")};
}

async function createInteriorBillPdf(source) {
  const doc=await createPdfDocument(),h=source.header||{},p=source.party||{},lines=source.lines||[];
  let y=await addOldEmsCompanyHeader(doc,{title:"Interiors Bill",verifiedText:"Digitally Verified"});
  y=addDetailsSection(doc,"Bill Details",[{label:"Bill No",value:h.bill_number||"—"},{label:"Date",value:formatPdfDate(h.bill_date)},{label:"Project",value:p.name||"—"},{label:"Bill Type",value:h.bill_type||"—"},{label:"Status",value:h.status||"—"}],y+8);
  y=addTable(doc,{startY:y+6,head:["Description","Quantity","Rate","Amount"],body:lines.map(l=>[l.description||"—",formatPdfQuantity(l.quantity),formatPdfCurrency(l.rate),formatPdfCurrency(l.amount)]),foot:["TOTAL","","",formatPdfCurrency(h.amount)],options:{headFillColor:[0,102,204]}});
  addOldEmsTaxSummaryBlock(doc,{startY:y+5,marginLeft:110,tableWidth:85,rows:[{label:"Subtotal",value:formatPdfCurrency(h.amount)},{label:"Tax",value:formatPdfCurrency(h.tax_amount)},[{content:"Total",styles:{fontStyle:"bold"}},{content:formatPdfCurrency(h.total_amount),styles:{fontStyle:"bold"}}]]});await addOldEmsSignatureStampBlock(doc,{startY:248});
  return {doc,filename:formatPdfFilename("IB",h.bill_number||"interiors-bill")};
}

function summaryFields(kind, h, fd) {
  if (kind === "credit_note") return [{ label:"Bill Reference",value:h.client_bill_id||"-"},{label:"Reason",value:h.reason||"-"},{label:"Credit Amount",value:formatPdfCurrency(h.credit_note_amount)}];
  return [{label:"Source Module",value:fd.source_module||"-"},{label:"Document Type",value:fd.document_family||"-"},{label:"Remarks",value:h.remarks||"-"}];
}
function lineTable(kind, lines) {
  if (["client_bill","transporter_statement"].includes(kind)) return { head:["Trip No","Date","Qty MT","Rate","Gross","Deduction","Net"], body:lines.map(l=>[l.trip_no||"-",formatPdfDate(l.trip_date),l.quantity_mt||0,formatPdfCurrency(l.client_rate_per_mt??l.transporter_rate_per_mt),formatPdfCurrency(l.client_gross_amount??l.transporter_gross_payable),formatPdfCurrency(l.support_deduction_amount),formatPdfCurrency(l.client_net_receivable??l.transporter_net_payable)]) };
  if (kind === "interior_bill") return { head:["Description","Qty","Rate","Amount"], body:lines.map(l=>[l.description||"-",l.quantity||0,formatPdfCurrency(l.rate),formatPdfCurrency(l.amount)]) };
  return { head:[], body:[] };
}
