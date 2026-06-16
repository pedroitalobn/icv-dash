// Cliente HTTP para a API de cobranças do Asaas.
// Docs: https://docs.asaas.com/reference

const ASAAS_API_URL =
  process.env.ASAAS_API_URL?.replace(/\/$/, "") ??
  "https://sandbox.asaas.com/api/v3";
const ASAAS_API_KEY = process.env.ASAAS_API_KEY ?? "";

export interface AsaasListResponse<T> {
  object: "list";
  hasMore: boolean;
  totalCount: number;
  limit: number;
  offset: number;
  data: T[];
}

export interface AsaasPayment {
  id: string;
  customer: string;
  subscription: string | null;
  value: number;
  netValue: number | null;
  billingType: string;
  status: string;
  description: string | null;
  invoiceUrl: string | null;
  dueDate: string | null;
  paymentDate: string | null;
  confirmedDate: string | null;
  dateCreated: string | null;
}

export interface AsaasCustomer {
  id: string;
  name: string | null;
  email: string | null;
  cpfCnpj: string | null;
  mobilePhone: string | null;
  dateCreated: string | null;
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  status: string | null;
  billingType: string | null;
  value: number;
  cycle: string | null;
  description: string | null;
  nextDueDate: string | null;
  dateCreated: string | null;
}

class AsaasError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
    this.name = "AsaasError";
  }
}

async function asaasFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  if (!ASAAS_API_KEY || ASAAS_API_KEY.startsWith("coloque")) {
    throw new AsaasError(
      "ASAAS_API_KEY não configurada. Defina a chave no arquivo .env.",
      500
    );
  }

  const url = new URL(`${ASAAS_API_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      access_token: ASAAS_API_KEY,
      "Content-Type": "application/json",
    },
    // Sempre dados frescos no contexto de sincronização.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AsaasError(
      `Asaas respondeu ${res.status} em ${path}`,
      res.status,
      body
    );
  }

  return (await res.json()) as T;
}

/**
 * Itera por TODAS as páginas de um endpoint de lista do Asaas (limite máx. 100/página),
 * entregando cada lote para o callback.
 */
async function paginate<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  onPage: (items: T[]) => Promise<void>
): Promise<number> {
  const limit = 100;
  let offset = 0;
  let total = 0;

  while (true) {
    const page = await asaasFetch<AsaasListResponse<T>>(path, {
      ...params,
      limit,
      offset,
    });
    if (page.data.length > 0) {
      await onPage(page.data);
      total += page.data.length;
    }
    if (!page.hasMore) break;
    offset += limit;
  }

  return total;
}

export const asaas = {
  /** Lista cobranças criadas a partir de uma data (YYYY-MM-DD), página a página. */
  listPayments(
    dateCreatedGe: string | undefined,
    onPage: (items: AsaasPayment[]) => Promise<void>
  ) {
    return paginate<AsaasPayment>(
      "/payments",
      { "dateCreated[ge]": dateCreatedGe },
      onPage
    );
  },

  /** Lista clientes, página a página. */
  listCustomers(onPage: (items: AsaasCustomer[]) => Promise<void>) {
    return paginate<AsaasCustomer>("/customers", {}, onPage);
  },

  /** Lista assinaturas (cobranças recorrentes), página a página. */
  listSubscriptions(onPage: (items: AsaasSubscription[]) => Promise<void>) {
    return paginate<AsaasSubscription>("/subscriptions", {}, onPage);
  },

  /** Busca um cliente específico pelo id. */
  getCustomer(id: string) {
    return asaasFetch<AsaasCustomer>(`/customers/${id}`);
  },
};

export { AsaasError };
