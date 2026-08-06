import { addClientInvoiceSignatureBlock, addDetailsSection, addDocumentFooter, addDocumentHeader, addSummarySection, addTable, createPdfDocument, formatPdfCurrency, formatPdfDate, formatPdfFilename } from "./pdf-utils.js";
import { pdfDocToBase64, upsertHospitalBillingDocumentToDrive } from "./drive-api.js";

function values(document) {
  if (document.entityType === "hospital_credit_notes") return {
    title: "CREDIT NOTE", number: document.credit_note_number, date: document.credit_note_date,
    taxable: Number(document.taxable_amount || 0), tax: Number(document.tax_amount || 0), total: Number(document.amount || 0)
  };
  return { title: "TAX INVOICE", number: document.invoice_number, date: document.issue_date, taxable: Number(document.taxable_amount || 0), tax: Number(document.tax_amount || 0), total: Number(document.total_amount || 0) };
}

export async function buildHospitalBillingPdf(document, project, client, lines = []) {
  const meta=values(document),doc=await createPdfDocument();
  let y=await addDocumentHeader(doc,{title:meta.title,fields:[{label:meta.title==="TAX INVOICE"?"Invoice No.":"Credit Note No.",value:meta.number},{label:"Date",value:formatPdfDate(meta.date)},{label:"Project",value:project.project_code},{label:"Reference",value:document.reference_number||"—"}]});
  y=addDetailsSection(doc,"BILL TO & PROJECT",[
    {label:"Client",value:client.hospital_name},{label:"Client code",value:client.client_code},
    {label:"Billing address",value:client.billing_address||"—"},{label:"GSTIN",value:client.gstin||"N/A"},
    {label:"Project",value:`${project.project_code} · ${project.title}`},{label:"Place of supply",value:document.place_of_supply||project.location||"—"},
    {label:"Due date",value:formatPdfDate(document.due_date)},{label:"Invoice type",value:String(document.invoice_type||"credit note").replaceAll("_"," ")}
  ],y+2);
  if(document.entityType==="hospital_invoices") {
    const hasDiscount=lines.some((line)=>Number(line.discount_amount)>0),commonGst=document.gst_mode==="common";
    const itemText=(line)=>[line.item_name||line.description,line.item_name&&line.description?line.description:null].filter(Boolean).join("\n");
    const head=commonGst?(hasDiscount?["#","Item / description","HSN/SAC","Qty","Rate","Discount","Line total"]:["#","Item / description","HSN/SAC","Qty","Rate","Line total"]):(hasDiscount?["#","Item / description","HSN/SAC","Qty","Rate","Discount","Taxable","GST","Total"]:["#","Item / description","HSN/SAC","Qty","Rate","Taxable","GST","Total"]);
    const body=lines.map((line,index)=>{const cells=[index+1,itemText(line),line.hsn_sac||"—",`${Number(line.quantity).toLocaleString("en-IN")} ${line.unit}`,formatPdfCurrency(line.unit_price)];if(hasDiscount)cells.push(formatPdfCurrency(line.discount_amount));if(commonGst)cells.push(formatPdfCurrency(Number(line.quantity)*Number(line.unit_price)-Number(line.discount_amount)));else cells.push(formatPdfCurrency(line.taxable_amount),`${formatPdfCurrency(line.tax_amount)} (${Number(line.gst_rate)}%)`,formatPdfCurrency(line.total_amount));return cells;});
    const columnStyles=commonGst?(hasDiscount?{0:{cellWidth:7},1:{cellWidth:55},2:{cellWidth:24},3:{cellWidth:22},4:{cellWidth:25,halign:"right"},5:{cellWidth:23,halign:"right"},6:{cellWidth:26,halign:"right"}}:{0:{cellWidth:7},1:{cellWidth:64},2:{cellWidth:25},3:{cellWidth:23},4:{cellWidth:29,halign:"right"},5:{cellWidth:34,halign:"right"}}):(hasDiscount?{0:{cellWidth:6},1:{cellWidth:30},2:{cellWidth:15},3:{cellWidth:16},4:{cellWidth:19,halign:"right"},5:{cellWidth:17,halign:"right"},6:{cellWidth:21,halign:"right"},7:{cellWidth:26,halign:"right"},8:{cellWidth:32,halign:"right"}}:{0:{cellWidth:6},1:{cellWidth:34},2:{cellWidth:16},3:{cellWidth:18},4:{cellWidth:21,halign:"right"},5:{cellWidth:23,halign:"right"},6:{cellWidth:29,halign:"right"},7:{cellWidth:35,halign:"right"}});
    y=addTable(doc,{startY:y+3,head,body,options:{fontSize:6.5,columnStyles}});
  } else {
    y=addTable(doc,{startY:y+3,head:["Reason","Taxable value","GST","Total credit"],body:[[document.reason,formatPdfCurrency(meta.taxable),`${formatPdfCurrency(meta.tax)} (${Number(document.tax_rate||0)}%)`,formatPdfCurrency(meta.total)]]});
  }
  y=addSummarySection(doc,"DOCUMENT TOTALS",[
    {label:"Taxable value",value:formatPdfCurrency(meta.taxable)},
    {label:document.gst_mode==="common"?`GST on entire bill (${Number(document.common_gst_rate||0)}%)`:"GST",value:formatPdfCurrency(meta.tax)},
    ...(document.entityType==="hospital_invoices"&&Number(document.round_off)?[{label:"Round off",value:formatPdfCurrency(document.round_off)}]:[]),
    {label:document.entityType==="hospital_invoices"?"GRAND TOTAL":"TOTAL CREDIT",value:formatPdfCurrency(meta.total)}
  ],y+4);
  const terms=[document.payment_terms&&`Payment terms: ${document.payment_terms}`,document.notes].filter(Boolean).join("\n\n");
  if(terms){y=addTable(doc,{startY:y+4,head:["TERMS / NOTES"],body:[[terms]],options:{fontSize:7,columnStyles:{0:{cellWidth:182}}}});}
  await addClientInvoiceSignatureBlock(doc,Math.min(y+8,238));
  await addDocumentFooter(doc,meta.title==="TAX INVOICE"?"System-generated Hospital Projects invoice.":"System-generated Hospital Projects credit note.");
  return doc;
}

export async function archiveHospitalBillingPdf(document, project, client, lines = []) {
  const doc=await buildHospitalBillingPdf(document,project,client,lines);
  const result=await upsertHospitalBillingDocumentToDrive({projectId:project.id,entityType:document.entityType,entityId:document.id,date:document.issue_date||document.credit_note_date},pdfDocToBase64(doc));
  return {doc,result};
}

export async function downloadHospitalBillingPdf(document, project, client, lines = []) {
  const doc=await buildHospitalBillingPdf(document,project,client,lines),meta=values(document);
  doc.save(formatPdfFilename(meta.title==="TAX INVOICE"?"HSP-INVOICE":"HSP-CREDIT-NOTE",meta.number));
}
