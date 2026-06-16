// Importa os dados ENVIADOS (planilhas Asaas + lista de padrinhos) para
// donors/donations. Idempotente: doadores por dedupeKey, doações por externalId.
//
//   Uso:  npm run import        (lê os arquivos em ./data/imports)
//
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { readdirSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { Prisma, PrismaClient } from "@prisma/client";
import { donorDedupeKey } from "../src/lib/donor-key";
import { mapPlanilhaForma, mapPlanilhaSituacao } from "../src/lib/format";

const prisma = new PrismaClient();
const IMPORT_DIR = path.join(process.cwd(), "data", "imports");

// ------------------------------- helpers ------------------------------------

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Identificador "796105134.0" → "796105134". */
function cleanId(v: unknown): string {
  const s = str(v);
  return s.replace(/\.0+$/, "");
}

/** dd/mm/yyyy → Date (meio-dia local p/ evitar fuso). "" → null. */
function parseDate(v: unknown): Date | null {
  const s = str(v);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function classify(file: string): { project: string; source: string } {
  const f = file.toLowerCase();
  if (f.includes("padrinho"))
    return { project: "Deixai Vir a Mim", source: "Padrinhos" };
  if (f.includes("associac"))
    return { project: "Cruz da Vida", source: "Associação (antigo)" };
  return { project: "Cruz da Vida", source: "ICV" };
}

function readRows(file: string): Record<string, unknown>[] {
  const wb = XLSX.readFile(path.join(IMPORT_DIR, file));
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
}

interface DonorInput {
  name?: string;
  email?: string;
  documentNumber?: string;
  mobilePhone?: string;
  city?: string;
  state?: string;
  project: string;
  source: string;
  metadata?: Record<string, unknown>;
}

/** Upsert do doador sem sobrescrever campos bons com vazios. Retorna o id. */
async function upsertDonor(d: DonorInput): Promise<string> {
  const dedupeKey = donorDedupeKey({
    documentNumber: d.documentNumber,
    email: d.email,
    name: d.name,
  });
  const doc = (d.documentNumber ?? "").replace(/\D/g, "") || null;
  const create = {
    dedupeKey,
    fullName: d.name?.trim() || "(sem nome)",
    email: d.email?.trim() || null,
    documentNumber: doc,
    mobilePhone: d.mobilePhone?.trim() || null,
    city: d.city || null,
    state: d.state || null,
    project: d.project,
    source: d.source,
    metadata: (d.metadata ?? {}) as Prisma.InputJsonValue,
  };
  // No update só mexemos no que tem valor (não apaga dados já existentes).
  const update: Record<string, unknown> = { project: d.project };
  if (create.fullName !== "(sem nome)") update.fullName = create.fullName;
  if (create.email) update.email = create.email;
  if (create.documentNumber) update.documentNumber = create.documentNumber;
  if (create.mobilePhone) update.mobilePhone = create.mobilePhone;
  if (create.city) update.city = create.city;

  const donor = await prisma.donor.upsert({
    where: { dedupeKey },
    create,
    update,
    select: { id: true },
  });
  return donor.id;
}

// ------------------------------- importers ----------------------------------

async function importAssinaturas(file: string) {
  const { project, source } = classify(file);
  const rows = readRows(file);
  let donations = 0;
  for (const r of rows) {
    const externalId = cleanId(r["Identificador"]);
    if (!externalId) continue;

    const donorId = await upsertDonor({
      name: str(r["Nome"]),
      email: str(r["Email"]),
      documentNumber: str(r["CPF ou CNPJ"]),
      mobilePhone: str(r["Celular"]),
      project,
      source,
    });

    const isRecurring = str(r["Tipo de cobrança"]).toLowerCase().includes("recorrente");
    const status = mapPlanilhaSituacao(str(r["Situação"]));
    const paymentMethod = mapPlanilhaForma(str(r["Forma de pagamento"]));
    const createdAt = parseDate(r["Data de criação"]) ?? parseDate(r["Vencimento"]) ?? new Date();

    const create = {
      donorId,
      externalId,
      amount: num(r["Valor"]) ?? 0,
      netAmount: num(r["Valor Líquido"]),
      originalAmount: num(r["Valor original"]),
      paymentMethod,
      status,
      statusRaw: str(r["Situação"]) || null,
      paymentMethodRaw: str(r["Forma de pagamento"]) || null,
      chargeTypeRaw: str(r["Tipo de cobrança"]) || null,
      isRecurring,
      project,
      source,
      sourceFileName: file,
      description: str(r["Descrição"]) || null,
      boletoNumber: str(r["Número do Boleto"]) || null,
      invoiceNumber: str(r["Número da fatura"]) || null,
      groupsRaw: str(r["Grupos"]) || null,
      dueDate: parseDate(r["Vencimento"]),
      originalDueDate: parseDate(r["Vencimento original"]),
      paidAt: parseDate(r["Data de Pagamento"]),
      confirmedAt: parseDate(r["Data de confirmação"]),
      importedAt: new Date(),
      createdAt,
    };
    const { createdAt: _c, ...update } = create;
    await prisma.donation.upsert({
      where: { externalId },
      create,
      update,
    });
    donations++;
  }
  console.log(`[import] ${file}: ${donations} doações (${project})`);
}

async function importClientes(file: string) {
  const { project, source } = classify(file);
  const rows = readRows(file);
  let n = 0;
  for (const r of rows) {
    if (!str(r["Nome"]) && !str(r["CPF ou CNPJ"]) && !str(r["Email"])) continue;
    await upsertDonor({
      name: str(r["Nome"]),
      email: str(r["Email"]),
      documentNumber: str(r["CPF ou CNPJ"]),
      mobilePhone: str(r["Celular"]),
      city: str(r["Cidade"]),
      state: str(r["Estado"]),
      project,
      source,
    });
    n++;
  }
  console.log(`[import] ${file}: ${n} doadores (clientes, ${project})`);
}

async function importPadrinhos(file: string) {
  const { project, source } = classify(file);
  const rows = readRows(file);
  let n = 0;
  for (const r of rows) {
    const name = str(r["name"]);
    if (!name) continue;
    await upsertDonor({
      name,
      mobilePhone: str(r["phone"]),
      city: str(r["locality"]),
      project,
      source,
      metadata: {
        birthday: str(r["birthday"]) || undefined,
        status: str(r["status"]) || undefined,
        locality: str(r["locality"]) || undefined,
      },
    });
    n++;
  }
  console.log(`[import] ${file}: ${n} padrinhos/doadores (${project})`);
}

// --------------------------------- main -------------------------------------

async function main() {
  let files: string[];
  try {
    files = readdirSync(IMPORT_DIR);
  } catch {
    console.warn(`[import] pasta ${IMPORT_DIR} não encontrada — nada a importar.`);
    return;
  }

  for (const file of files) {
    const lower = file.toLowerCase();
    try {
      if (lower.endsWith(".csv") && lower.includes("padrinho")) {
        await importPadrinhos(file);
      } else if (lower.endsWith(".xlsx") && lower.includes("assinatura")) {
        await importAssinaturas(file);
      } else if (lower.endsWith(".xlsx") && lower.includes("cliente")) {
        await importClientes(file);
      }
    } catch (e) {
      console.error(`[import] erro em ${file}:`, e instanceof Error ? e.message : e);
    }
  }

  const [donors, donations] = await Promise.all([
    prisma.donor.count(),
    prisma.donation.count(),
  ]);
  console.log(`[import] concluído. Total no banco: ${donors} doadores, ${donations} doações.`);
}

main()
  .catch((e) => {
    console.error("[import] falhou:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
