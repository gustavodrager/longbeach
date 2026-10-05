using LongBeach.Contracts.Bar;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Cash;
using LongBeach.Domain.Inventory;
using Microsoft.EntityFrameworkCore;

namespace LongBeach.Infrastructure.Bar;

public sealed partial class BarTabsService
{
    public async Task<TabSourceDetails> Source(string kind, Guid id, int page, int pageSize, CancellationToken ct)
    {
        (page, pageSize) = Paging(page, pageSize);
        await using var snapshot = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        TabSourceDetails response;
        if (kind == "cash")
        {
            var session = await db.Set<CashSession>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new BarRuleException("Caixa não encontrado.");
            var closing = await db.Set<CashClosing>().AsNoTracking().Where(x => x.SessionId == id).OrderByDescending(x => x.CreatedAtUtc).FirstOrDefaultAsync(ct);
            var query = db.Set<CashMovement>().AsNoTracking().Where(x => x.SessionId == id);
            var rows = (await query.OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct)).Select(x => new TabSourceRow(x.Id, CashLabel(x.Kind), x.Reason, x.CreatedAtUtc, x.Amount, null, x.OriginId, x.Kind == "TabPayment" ? "payment" : null)).ToArray();
            response = new(id, kind, "Caixa " + session.Terminal, session.State, session.Expected, closing?.Counted, closing?.Difference, null, new(rows, page, pageSize, await query.CountAsync(ct)));
        }
        else if (kind == "stock")
        {
            var product = await db.Set<BarProduct>().AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new BarRuleException("Produto não encontrado.");
            var balances = await db.Set<StockBalance>().AsNoTracking().Where(x => x.ProductId == id).ToListAsync(ct);
            var query = db.Set<StockMovement>().AsNoTracking().Where(x => x.ProductId == id);
            var locationNames = await db.Set<StockLocation>().AsNoTracking().Where(x => balances.Select(b => b.LocationId).Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Name, ct);
            var rows = (await query.OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct)).Select(x => new TabSourceRow(x.Id, StockLabel(x.Kind), x.Reason + " · " + locationNames.GetValueOrDefault(x.LocationId, "Local encerrado"), x.CreatedAtUtc, null, x.Quantity, x.OriginId, null)).ToArray();
            response = new(id, kind, product.Name, product.Active ? "Active" : "Inactive", null, null, null, balances.Sum(x => x.Available), new(rows, page, pageSize, await query.CountAsync(ct)));
        }
        else throw new BarRuleException("Origem não encontrada.");
        await snapshot.CommitAsync(ct); return response;
    }
    private static string ReportDetail(string metric, string detail)
    {
        if (metric == "received") return detail switch { "Cash" => "Dinheiro", "CardManual" => "Cartão aprovado na maquininha", "Pix" => "Pix confirmado", _ => "Recebimento confirmado" };
        if (metric is "orders" or "requests")
        {
            var index = detail.LastIndexOf(" · ", StringComparison.Ordinal);
            if (index >= 0) return detail[..index] + " · " + (detail[(index + 3)..] == "Requested" ? "Esperando a equipe confirmar" : "Aceito · Esperando entrega");
        }
        return detail;
    }
    private static string CashLabel(string kind) => kind switch { "Opening" => "Fundo inicial", "TabPayment" => "Recebimento da comanda", "TabRefund" => "Estorno da comanda", "Supply" => "Colocar dinheiro", "Withdraw" => "Retirar dinheiro", "Expense" => "Despesa", "ClosingDifference" => "Diferença no fechamento", "Reopen" => "Reabertura pela supervisão", "Sale" => "Venda histórica", "Refund" => "Estorno de venda histórica", _ => "Movimento de caixa" };
    private static string StockLabel(string kind) => kind switch { "TabDelivery" => "Entrega da comanda", "TabReturn" => "Devolução física", "Initial" => "Entrada inicial", "Inventory" => "Contagem física", "Purchase" => "Recebimento de compra", "Loss" => "Perda", "Sale" => "Venda histórica", "SaleReturn" => "Devolução de venda histórica", _ => "Movimento de estoque" };
    private sealed class ReportProjection
    {
        public Guid Id { get; init; }
        public string Label { get; init; } = "";
        public string Detail { get; init; } = "";
        public DateTimeOffset Date { get; init; }
        public decimal? Amount { get; init; }
        public int? Count { get; init; }
        public string Resource { get; init; } = "";
        public Guid ResourceId { get; init; }
    }
    private async Task<TabReportResponse> ReportCore(string metric, DateTimeOffset? fromUtc, DateTimeOffset? toUtc, int page, int pageSize, CancellationToken ct)
    {
        var requestedMetric = metric;
        metric = metric switch { "pending-payments" => "pending", "consumption" => "consumed", "low-stock" => "lowStock", "cash-differences" => "differences", _ => metric };
        var now = time.GetUtcNow(); var zone = TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo"); var day = TimeZoneInfo.ConvertTime(now, zone).Date;
        var start = fromUtc?.ToUniversalTime() ?? new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(day, DateTimeKind.Unspecified), zone)); var to = toUtc?.ToUniversalTime() ?? start.AddDays(1);
        if (to <= start || to - start > TimeSpan.FromDays(366)) throw new BarRuleException("Período inválido; selecione até 366 dias.");
        (page, pageSize) = Paging(page, pageSize);
        await using var snapshot = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var tabs = db.Set<BarTab>().AsNoTracking(); var items = db.Set<BarTabItem>().AsNoTracking(); var payments = db.Set<BarTabPayment>().AsNoTracking();
        var current = metric is "receivable" or "pending" or "lowStock" or "cash" or "requests" or "open-tabs" or "orders";
        IQueryable<ReportProjection> query; var title = ""; var explanation = ""; var unit = "money";
        switch (metric)
        {
            case "open-tabs":
                title = "Comandas abertas agora"; explanation = "Contas abertas, independentemente do caixa e turno."; unit = "count";
                query = tabs.Where(t => t.State == "Open").Select(t => new ReportProjection { Id = t.Id, Label = "Comanda " + t.Number + (t.Name == "" ? "" : " · " + t.Name), Detail = "Aberta", Date = t.CreatedAtUtc, Amount = null, Count = 1, Resource = "tab", ResourceId = t.Id }); break;
            case "orders":
            case "requests":
                title = "Itens esperando a equipe"; explanation = "Linhas solicitadas sem consumo, ou aceitas esperando entrega."; unit = "count";
                query = from i in items join t in tabs on i.TabId equals t.Id
                        where i.State == "Requested" || metric == "orders" && i.State == "Accepted"
                        select new ReportProjection { Id = i.Id, Label = "Comanda " + t.Number + (t.Name == "" ? "" : " · " + t.Name), Detail = i.Quantity + " × " + i.Name + " · " + i.State, Date = i.CreatedAtUtc, Amount = null, Count = 1, Resource = "tab", ResourceId = t.Id }; break;
            case "consumed":
                title = "Consumo confirmado"; explanation = "Itens aceitos ou entregues pela data da aceitação. Solicitados, recusados e corrigidos não compõem este total.";
                query = from i in items join t in tabs on i.TabId equals t.Id
                        where (i.State == "Accepted" || i.State == "Fulfilled") && i.AcceptedAtUtc >= start && i.AcceptedAtUtc < to
                        select new ReportProjection { Id = i.Id, Label = "Comanda " + t.Number + (t.Name == "" ? "" : " · " + t.Name), Detail = i.Quantity + " × " + i.Name, Date = i.AcceptedAtUtc!.Value, Amount = i.Total, Count = null, Resource = "tab", ResourceId = t.Id }; break;
            case "received":
                title = "Recebimentos confirmados"; explanation = "Recebimento bruto confirmado, com estornos separados. Não representa saldo bancário.";
                query = from p in payments join t in tabs on p.TabId equals t.Id
                        where p.State == "Approved" && p.ConfirmedAtUtc >= start && p.ConfirmedAtUtc < to
                        select new ReportProjection { Id = p.Id, Label = "Comanda " + t.Number + (t.Name == "" ? "" : " · " + t.Name), Detail = p.Method, Date = p.ConfirmedAtUtc!.Value, Amount = p.Amount, Count = null, Resource = "payment", ResourceId = p.Id }; break;
            case "refunds":
                title = "Estornos confirmados"; explanation = "Somente estornos confirmados; solicitações pendentes não reduzem o recebido.";
                query = from r in db.Set<BarTabRefund>().AsNoTracking() join t in tabs on r.TabId equals t.Id
                        where r.State == "Confirmed" && r.ConfirmedAtUtc >= start && r.ConfirmedAtUtc < to
                        select new ReportProjection { Id = r.Id, Label = "Comanda " + t.Number + (t.Name == "" ? "" : " · " + t.Name), Detail = r.Reason, Date = r.ConfirmedAtUtc!.Value, Amount = r.Amount, Count = null, Resource = "payment", ResourceId = r.PaymentId }; break;
            case "fees":
                title = "Taxas conciliadas"; explanation = "Somente taxas efetivamente registradas; nenhuma porcentagem é presumida.";
                query = from p in payments join t in tabs on p.TabId equals t.Id
                        where p.State == "Approved" && p.FeeConfirmedAtUtc != null && p.ConfirmedAtUtc >= start && p.ConfirmedAtUtc < to
                        select new ReportProjection { Id = p.Id, Label = "Comanda " + t.Number + (t.Name == "" ? "" : " · " + t.Name), Detail = "Taxa conciliada", Date = p.ConfirmedAtUtc!.Value, Amount = p.Fee, Count = null, Resource = "payment", ResourceId = p.Id }; break;
            case "pending":
                title = "Pix pendentes agora"; explanation = "Alocações esperando provedor, sem recebimento confirmado ou dinheiro físico.";
                query = from p in payments join t in tabs on p.TabId equals t.Id where p.State == "Pending"
                        select new ReportProjection { Id = p.Id, Label = "Comanda " + t.Number + (t.Name == "" ? "" : " · " + t.Name), Detail = p.ProviderId == null ? "Repita criação com a mesma chave" : "Esperando provedor", Date = p.CreatedAtUtc, Amount = p.Amount, Count = null, Resource = "payment", ResourceId = p.Id }; break;
            case "receivable":
                title = "Falta receber agora"; explanation = "Saldos das comandas abertas, incluindo Pix pendentes.";
                query = from t in tabs where t.State == "Open"
                        let consumed = items.Where(i => i.TabId == t.Id && (i.State == "Accepted" || i.State == "Fulfilled")).Sum(i => (decimal?)i.Total) ?? 0
                        let paid = payments.Where(p => p.TabId == t.Id && p.State == "Approved").Sum(p => (decimal?)(p.Amount - p.Refunded)) ?? 0
                        where consumed - t.Discount > paid
                        select new ReportProjection { Id = t.Id, Label = "Comanda " + t.Number + (t.Name == "" ? "" : " · " + t.Name), Detail = "Saldo ainda não confirmado", Date = now, Amount = consumed - t.Discount - paid, Count = null, Resource = "tab", ResourceId = t.Id }; break;
            case "lowStock":
                title = "Estoque baixo agora"; explanation = "Produto/local no mínimo ou abaixo; reservas já são descontadas."; unit = "count";
                query = from p in db.Set<BarProduct>().AsNoTracking() where p.Active && p.ControlsStock && (!p.Prepared || !db.Set<BarRecipeVersion>().Any(r=>r.ProductId==p.Id))
                        from l in db.Set<StockLocation>().AsNoTracking()
                        join b in db.Set<StockBalance>().AsNoTracking() on new { ProductId = p.Id, LocationId = l.Id } equals new { b.ProductId, b.LocationId } into balances
                        from b in balances.DefaultIfEmpty()
                        let available = b == null ? 0 : b.Quantity - b.Reserved
                        where available <= p.MinimumStock
                        select new ReportProjection { Id = b == null ? p.Id : b.Id, Label = p.Name, Detail = available + " disponíveis · " + l.Name, Date = now, Amount = null, Count = 1, Resource = "stock", ResourceId = p.Id }; break;
            case "cash":
                title = "Dinheiro nos caixas abertos"; explanation = "Saldo físico esperado com fundo e movimentos; Pix e cartão não entram neste valor.";
                query = from c in db.Set<CashSession>().AsNoTracking() join r in db.Set<CashRegister>().AsNoTracking() on c.RegisterId equals r.Id
                        where c.State == "Open" || c.State == "Reopened"
                        select new ReportProjection { Id = c.Id, Label = r.Name, Detail = c.Terminal, Date = now, Amount = c.Expected, Count = null, Resource = "cash", ResourceId = c.Id }; break;
            case "differences":
                title = "Diferenças de caixa"; explanation = "Soma absoluta das diferenças de fechamentos no período; detalhes mostram sobra ou falta.";
                query = from c in db.Set<CashClosing>().AsNoTracking() join s in db.Set<CashSession>().AsNoTracking() on c.SessionId equals s.Id
                        where c.CreatedAtUtc >= start && c.CreatedAtUtc < to && c.Difference != 0
                        select new ReportProjection { Id = c.Id, Label = "Caixa " + s.Terminal, Detail = (c.Difference < 0 ? "Faltou " : "Sobrou ") + Math.Abs(c.Difference) + " · " + c.Reason, Date = c.CreatedAtUtc, Amount = Math.Abs(c.Difference), Count = null, Resource = "cash", ResourceId = s.Id }; break;
            default: throw new BarRuleException("Indicador não encontrado.");
        }
        var total = await query.CountAsync(ct);
        var value = unit == "count" ? total : await query.SumAsync(x => x.Amount, ct) ?? 0;
        var projections = await query.OrderByDescending(x => x.Date).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        await snapshot.CommitAsync(ct);
        var hasData = metric != "fees" || total > 0;
        return new(requestedMetric, title, value, unit, current, start, to, now, explanation, new(projections.Select(x => new TabReportRow(x.Id, x.Label, ReportDetail(metric, x.Detail), x.Date, x.Amount, x.Count, x.Resource, x.ResourceId)).ToArray(), page, pageSize, total), hasData);
    }
}
