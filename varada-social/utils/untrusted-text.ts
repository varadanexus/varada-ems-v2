const instructionPatterns = [
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /system\s+prompt/gi,
  /developer\s+message/gi,
  /reveal\s+(your\s+)?secrets/gi,
  /api[_\s-]?key/gi,
];

export function sanitizeUntrustedText(value: string, maxLength = 2000): string {
  let clean = String(value || "").replace(/\u0000/g, "").slice(0, maxLength);
  instructionPatterns.forEach((pattern) => {
    clean = clean.replace(pattern, "[filtered]");
  });
  return clean;
}
