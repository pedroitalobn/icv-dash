import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { RevenueChart } from "@/components/RevenueChart";
import { BillingChart } from "@/components/BillingChart";
import { getCurrentUser } from "@/lib/session";
import {
  billingTypeLabel,
  formatBRL,
  formatDate,
  statusLabel,
} from "@/lib/format";
import {
  getBillingBreakdown,
  getSummary,
  getTimeSeries,
  getLastSync,
  getRecurringMetrics,
  getReceivables,
  getNewVsReturning,
  getMonthOverMonth,
  getTopDonors,
  listPayments,
  periodToDate,
  type Period,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const PERIODS: { key: Period; label: string }[] = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "365d", label: "12 meses" },
  { key: "all", label: "Tudo" },
];

function statusBadge(status: string) {
  const cls =
    ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(status)
      ? "green"
      : status === "PENDING" || status === "AWAITING_RISK_ANALYSIS"
        ? "yellow"
        : ["OVERDUE", "REFUNDED", "CHARGEBACK_REQUESTED"].includes(status)
          ? "red"
          : "gray";
  return <span className={`badge ${cls}`}>{statusLabel(status)}</span>;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { period?: string; page?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const period = (
    PERIODS.some((p) => p.key === searchParams.period)
      ? searchParams.period
      : "30d"
  ) as Period;
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);
  const pageSize = 15;
  const since = periodToDate(period);

  const [
    summary,
    series,
    billing,
    payments,
    lastSync,
    recurring,
    receivables,
    newVs,
    mom,
    topDonors,
  ] = await Promise.all([
    getSummary(since),
    getTimeSeries(since),
    getBillingBreakdown(since),
    listPayments({ page, pageSize, since }),
    getLastSync(),
    getRecurringMetrics(),
    getReceivables(since),
    getNewVsReturning(since),
    getMonthOverMonth(),
    getTopDonors(since, 10),
  ]);

  const totalPages = Math.max(1, Math.ceil(payments.total / pageSize));
  const buildUrl = (p: Period, pg = 1) => `/?period=${p}&page=${pg}`;

  return (
    <>
      <Topbar email={user.email} />
      <main className="container">
        {/* Filtros de período */}
        <div className="filters">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={buildUrl(p.key)}
              className={p.key === period ? "active" : ""}
            >
              {p.label}
            </Link>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid kpis">
          <div className="card">
            <h3>Total arrecadado</h3>
            <div className="kpi-value brand">{formatBRL(summary.totalArrecadado)}</div>
            <div className="kpi-sub">{summary.totalRecebidas} doações recebidas</div>
          </div>
          <div className="card">
            <h3>Doadores únicos</h3>
            <div className="kpi-value">{summary.totalDoadores}</div>
            <div className="kpi-sub">no período selecionado</div>
          </div>
          <div className="card">
            <h3>Ticket médio</h3>
            <div className="kpi-value">{formatBRL(summary.ticketMedio)}</div>
            <div className="kpi-sub">por doação</div>
          </div>
          <div className="card">
            <h3>Doadores c/ 3 recorrentes</h3>
            <div className="kpi-value green">{summary.doadoresComTresRecorrentes}</div>
            <div className="kpi-sub">exatamente 3 cobranças recorrentes pagas</div>
          </div>
        </div>

        {/* KPIs — recorrência, inadimplência, retenção */}
        <div className="grid kpis" style={{ marginTop: 16 }}>
          <div className="card">
            <h3>MRR (receita recorrente)</h3>
            <div className="kpi-value brand">{formatBRL(recurring.mrr)}</div>
            <div className="kpi-sub">
              {recurring.activeSubs} assinaturas ativas · {recurring.canceledSubs} canceladas
            </div>
          </div>
          <div className="card">
            <h3>Inadimplência (vencidas)</h3>
            <div className="kpi-value" style={{ color: "#b91c1c" }}>
              {formatBRL(receivables.overdueValue)}
            </div>
            <div className="kpi-sub">{receivables.overdueCount} cobranças vencidas</div>
          </div>
          <div className="card">
            <h3>A receber (pendentes)</h3>
            <div className="kpi-value">{formatBRL(receivables.pendingValue)}</div>
            <div className="kpi-sub">{receivables.pendingCount} cobranças pendentes</div>
          </div>
          <div className="card">
            <h3>Novos vs. recorrentes</h3>
            <div className="kpi-value">
              {newVs.novos}
              <span className="muted" style={{ fontSize: 16, fontWeight: 600 }}>
                {" "}
                / {newVs.recorrentes}
              </span>
            </div>
            <div className="kpi-sub">novos doadores / que retornaram</div>
          </div>
          <div className="card">
            <h3>Mês atual vs. anterior</h3>
            <div className="kpi-value">{formatBRL(mom.atual)}</div>
            <div className="kpi-sub">
              {mom.variacaoPct == null ? (
                "sem base do mês anterior"
              ) : (
                <span style={{ color: mom.variacaoPct >= 0 ? "#16a34a" : "#b91c1c" }}>
                  {mom.variacaoPct >= 0 ? "▲" : "▼"} {Math.abs(mom.variacaoPct).toFixed(1)}%
                  {" "}vs. {formatBRL(mom.anterior)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Gráfico de arrecadação */}
        <div className="section-title">Arrecadação por dia</div>
        <div className="card">
          <RevenueChart data={series} />
        </div>

        {/* Formas de pagamento */}
        <div className="section-title">Formas de pagamento</div>
        <div className="card">
          <BillingChart data={billing} />
        </div>

        {/* Top doadores */}
        <div className="section-title">Top doadores</div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Doador</th>
                <th>Doações</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {topDonors.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    Sem doadores no período.
                  </td>
                </tr>
              )}
              {topDonors.map((d, i) => (
                <tr key={d.id}>
                  <td className="muted">{i + 1}</td>
                  <td>{d.name || d.email || d.id}</td>
                  <td className="muted">{d.quantidade}x</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>
                    {formatBRL(d.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Lista de transações */}
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "flex-end" }}
        >
          <div className="section-title">Doações / transações</div>
          <a
            href={`/api/export/payments?period=${period}`}
            className="btn btn-ghost"
            style={{ padding: "8px 14px", fontSize: 13 }}
          >
            ⬇ Exportar CSV
          </a>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>Doador</th>
                <th>Forma</th>
                <th>Status</th>
                <th>Data</th>
                <th style={{ textAlign: "right" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {payments.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 30 }}>
                    Nenhuma transação encontrada. Rode a sincronização.
                  </td>
                </tr>
              )}
              {payments.rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.customerName || p.customerEmail || p.id}
                    {p.isRecurring && <span className="tag-recurring">recorrente</span>}
                  </td>
                  <td>{billingTypeLabel(p.billingType)}</td>
                  <td>{statusBadge(p.status)}</td>
                  <td>{formatDate(p.paymentDate ?? p.dateCreated)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>
                    {formatBRL(p.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <Link
            href={buildUrl(period, Math.max(1, page - 1))}
            className="btn btn-ghost"
            aria-disabled={page <= 1}
            style={page <= 1 ? { pointerEvents: "none", opacity: 0.5 } : {}}
          >
            ← Anterior
          </Link>
          <span className="muted">
            Página {page} de {totalPages} · {payments.total} registros
          </span>
          <Link
            href={buildUrl(period, Math.min(totalPages, page + 1))}
            className="btn btn-ghost"
            aria-disabled={page >= totalPages}
            style={page >= totalPages ? { pointerEvents: "none", opacity: 0.5 } : {}}
          >
            Próxima →
          </Link>
        </div>

        <p className="muted" style={{ marginTop: 20, fontSize: 12 }}>
          {lastSync
            ? `Última sincronização: ${formatDate(lastSync.finishedAt ?? lastSync.startedAt)} · status ${lastSync.status} · ${lastSync.paymentsProcessed} cobranças`
            : "Nenhuma sincronização executada ainda."}
        </p>
      </main>
    </>
  );
}
