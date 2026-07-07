export const LEGAL_AGREEMENTS = [
  {
    id: "AGR-2026-0001",
    title: "Customer Service Agreement",
    type: "Service Agreement",
    party: "Sri Lakshmi Minerals",
    signer: "Client Director",
    mobile: "+91 98765 43210",
    email: "director@srilakshmi.example",
    status: "Drafting",
    risk: "Medium",
    updatedAt: "2026-07-04 10:20",
    drive: "Pending",
    didit: "Not Started"
  },
  {
    id: "AGR-2026-0002",
    title: "Vendor Transport Undertaking",
    type: "Vendor Agreement",
    party: "East Coast Transporters",
    signer: "Authorised Partner",
    mobile: "+91 91234 56780",
    email: "partner@eastcoast.example",
    status: "Ready To Send",
    risk: "High",
    updatedAt: "2026-07-04 11:05",
    drive: "Draft Folder Ready",
    didit: "Session Pending"
  },
  {
    id: "AGR-2026-0003",
    title: "NDA and Portal Terms",
    type: "NDA",
    party: "Project Consultant",
    signer: "Consultant",
    mobile: "+91 90000 11223",
    email: "consultant@example.com",
    status: "Signed",
    risk: "Low",
    updatedAt: "2026-07-03 18:15",
    drive: "Archived",
    didit: "Signed"
  }
];

export const LEGAL_AUDIT_EVENTS = [
  { at: "2026-07-04 11:05", event: "Agreement approved for sending", agreement: "AGR-2026-0002", actor: "Legal Admin", risk: "Normal" },
  { at: "2026-07-04 10:20", event: "Gemini draft prompt generated", agreement: "AGR-2026-0001", actor: "Advocate", risk: "Normal" },
  { at: "2026-07-03 18:15", event: "Didit signed PDF received", agreement: "AGR-2026-0003", actor: "Didit Webhook", risk: "Provider" },
  { at: "2026-07-03 18:12", event: "VPN attempt blocked", agreement: "AGR-2026-0003", actor: "Client Portal", risk: "High" }
];

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

export function statusPill(status) {
  return `<span class="meta-pill">${escapeHtml(status)}</span>`;
}
