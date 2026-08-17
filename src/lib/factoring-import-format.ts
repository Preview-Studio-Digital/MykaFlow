export const FACTORING_IMPORT_DESCRIPTION_PREFIX = "SYNC: NF";

/**
 * Regra explícita da sincronização de antecipação:
 * - subcategoria = nome do cliente
 * - descrição = "SYNC: NF <número da nota>" ou "SYNC: NF <número da nota> (OP. ADICIONAL)"
 */
export function formatFactoringClientSubcategory(clientName: unknown) {
  const normalized = String(clientName || "CLIENTE DESCONHECIDO").trim().toUpperCase();
  return normalized || "CLIENTE DESCONHECIDO";
}

export function formatFactoringInvoiceDescription(invoiceNumber: unknown, isAdditional?: boolean) {
  const normalized = String(invoiceNumber || "S/N").trim().toUpperCase();
  const suffix = isAdditional ? " (OP. ADICIONAL)" : "";
  return `${FACTORING_IMPORT_DESCRIPTION_PREFIX} ${normalized || "S/N"}${suffix}`;
}

export function stripLegacyClientFromFactoringDescription(description: string | null | undefined, subcategoryName?: string | null) {
  const cleaned = (description || "").replace(" | VALIDAR VALOR", "").replace("VALIDAR VALOR", "").trim();
  if (!cleaned) return "";

  const upper = cleaned.toUpperCase();
  const subUpper = (subcategoryName || "").trim().toUpperCase();
  if (subUpper && upper.startsWith(`${subUpper} - ${FACTORING_IMPORT_DESCRIPTION_PREFIX}`)) {
    return cleaned.slice(`${subcategoryName} - `.length).trim();
  }

  const syncIndex = upper.indexOf(FACTORING_IMPORT_DESCRIPTION_PREFIX);
  if (syncIndex > 0) return cleaned.slice(syncIndex).trim();

  return cleaned;
}