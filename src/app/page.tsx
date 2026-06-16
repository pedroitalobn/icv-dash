import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { RevenueChart } from "@/components/RevenueChart";
import { BillingChart } from "@/components/BillingChart";
import { FiltersBar } from "@/components/FiltersBar";
import { getCurrentUser } from "@/lib/session";
import {
  paymentMethodLabel,
  formatBRL,
  formatDate,
  statusLabel,
  maskName,
} from "@/lib/format";
import {
  getPaymentMethodBreakdown,
  getProjectBreakdown,
  getSummary,
  getTimeSeries,
  getLastSync,
  getRecurringMetrics,
  getReceivables,
  getNewVsReturning,
  getMonthOverMonth,
  getTopDonors,
  listDonations,
} from "@/lib/queries";
import { parseFilters, buildQuery } from "@/lib/filters";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  const cls = ["paid", "confirmed"].includes(status)
    ? "green"
    : status === "pending"
      ? "yellow"
      : ["overdue", "refunded", "chargeback", "cancelled", "failed"].includes(status)
        ? "red"
        : "gray";
  return <span className={`badge ${cls}`}>{statusLabel(status)}</span>;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const f = parseFilters(searchParams);
  const { since, untilDate, paymentFilters } = f;
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);
  const pageSize = 15;

  const [
    summary,
    series,
    billing,
    projects,
    payments,
    lastSync,
    recurring,
    receivables,
    newVs,
    mom,
    topDonors,
  ] = await Promise.all([
    getSummary(since, untilDate),
    getTimeSeries(since, untilDate),
    getPaymentMethodBreakdown(since, untilDate),
    getProjectBreakdown(since, untilDate),
    listDonations({ page, pageSize, filters: paymentFilters }),
    getLastSync(),
    getRecurringMetrics(),
    getReceivables(since, untilDate),
    getNewVsReturning(since, untilDate),
    getMonthOverMonth(),
    getTopDonors(since, untilDate, 10),
  ]);

  const totalPages = Math.max(1, Math.ceil(payments.total / pageSize));
  // Preserva os filtros atuais ao paginar/exportar.
  const filterParams = {
    period: f.period === "custom" ? "" : f.period,
    from: f.from,
    until: f.until,
    status: f.status,
    forma: f.billingType,
    rec: f.recurring,
    projeto: f.project,
    q: f.q,
  };
  const pageUrl = (pg: number) => buildQuery({ ...filterParams, page: pg });
  const exportUrl = `/api/export/payments${buildQuery(filterParams)}`;

  return (
    <>
      <Topbar email={user.email} />
      <main className="container">
        {/* Filtros: período, intervalo de datas, status, forma, recorrência, busca */}
        <FiltersBar />

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

        {/* Arrecadação por projeto */}
        <div className="section-title">Arrecadação por projeto</div>
        <div className="grid kpis">
          {projects.length === 0 && (
            <div className="card">
              <div className="muted">Sem doações no período.</div>
            </div>
          )}
          {projects.map((p) => (
            <div className="card" key={p.project}>
              <h3>{p.project}</h3>
              <div className="kpi-value brand">{formatBRL(p.total)}</div>
              <div className="kpi-sub">
                {p.quantidade} doações · {p.doadores} doadores
              </div>
            </div>
          ))}
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
                  <td>{maskName(d.name) || d.email || d.id}</td>
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
            href={exportUrl}
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
                <th>Projeto</th>
                <th>Forma</th>
                <th>Status</th>
                <th>Data</th>
                <th style={{ textAlign: "right" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {payments.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 30 }}>
                    Nenhuma doação encontrada para os filtros.
                  </td>
                </tr>
              )}
              {payments.rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    {maskName(p.customerName) || p.customerEmail || p.id}
                    {p.isRecurring && <span className="tag-recurring">recorrente</span>}
                  </td>
                  <td className="muted">{p.project ?? "—"}</td>
                  <td>{paymentMethodLabel(p.billingType)}</td>
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
            href={pageUrl(Math.max(1, page - 1))}
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
            href={pageUrl(Math.min(totalPages, page + 1))}
            className="btn btn-ghost"
            aria-disabled={page >= totalPages}
            style={page >= totalPages ? { pointerEvents: "none", opacity: 0.5 } : {}}
          >
            Próxima →
          </Link>
        </div>

        <p className="muted" style={{ marginTop: 20, fontSize: 12 }}>
          {lastSync
            ? `Última sincronização: ${formatDate(lastSync.finishedAt ?? lastSync.startedAt)} · status ${lastSync.status} · ${lastSync.donationsProcessed} doações`
            : "Nenhuma sincronização executada ainda."}
        </p>
      </main>
    </>
  );
}
