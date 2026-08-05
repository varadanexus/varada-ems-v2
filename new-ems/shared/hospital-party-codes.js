export function generateHospitalPartyCode(prefix, existingCodes = []) {
  const used = new Set((existingCodes || []).map((code) => String(code || "").trim().toUpperCase()));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const year = String(new Date().getUTCFullYear()).slice(-2);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const random = new Uint32Array(7);
    globalThis.crypto.getRandomValues(random);
    const token = Array.from(random, (value) => alphabet[value % alphabet.length]).join("");
    const code = `${String(prefix || "").trim().toUpperCase()}-${year}-${token}`;
    if (!used.has(code)) return code;
  }
  throw new Error("A unique party code could not be generated. Please try again.");
}

export function isDuplicatePartyCodeError(error, fieldName) {
  const text = `${error?.message || ""} ${error?.details || ""} ${error?.constraint || ""}`.toLowerCase();
  return String(error?.code || "") === "23505" && text.includes(String(fieldName || "").toLowerCase());
}
