// Chave natural para deduplicar doadores entre fontes (Asaas API e planilhas).

export function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function cleanEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Gera uma chave determinística para o doador, priorizando:
 *  1. documento (CPF/CNPJ)  2. e-mail  3. id externo (Asaas)  4. nome.
 */
export function donorDedupeKey(input: {
  documentNumber?: string | null;
  email?: string | null;
  externalId?: string | null;
  name?: string | null;
}): string {
  const doc = onlyDigits(input.documentNumber);
  if (doc.length >= 11) return `doc:${doc}`;
  const email = cleanEmail(input.email);
  if (email) return `email:${email}`;
  if (input.externalId) return `ext:${input.externalId}`;
  const name = (input.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (name) return `name:${name}`;
  return `anon:${Math.random().toString(36).slice(2)}`;
}
