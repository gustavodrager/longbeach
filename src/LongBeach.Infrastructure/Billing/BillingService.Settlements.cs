using System.Text.Json;
using LongBeach.Contracts.Billing;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Billing;
public sealed partial class BillingService
{
    private sealed record EdiDocument(Guid Id,string Payload,string Movement,bool Validated);
    public async Task<object> SettlementCandidates(CancellationToken ct)
    {
        var documents=await db.Database.SqlQuery<EdiDocument>($"SELECT id AS \"Id\",payload::text AS \"Payload\",movement AS \"Movement\",validated AS \"Validated\" FROM provider_documents WHERE provider='pagbank-edi' AND movement='financial' AND validated=true AND fetched_at_utc=(SELECT MAX(v.fetched_at_utc) FROM provider_documents v WHERE v.provider=provider_documents.provider AND v.movement=provider_documents.movement AND v.movement_date=provider_documents.movement_date AND v.validated=true) ORDER BY movement_date DESC,page_number LIMIT 100").ToListAsync(ct);
        var used=await db.Set<BillingSettlement>().Select(x=>x.ExternalId).ToListAsync(ct);var rows=new List<object>();var seen=new HashSet<string>();
        foreach(var document in documents)
        {
            using var json=JsonDocument.Parse(document.Payload);
            foreach(var row in json.RootElement.GetProperty("detalhes").EnumerateArray())
            {
                if(!IsSettlement(row))continue;var external=row.GetProperty("movimento_api_codigo").GetString()!;if(used.Contains(external)||!seen.Add(external))continue;
                rows.Add(new{documentId=document.Id,externalId=external,transactionId=row.GetProperty("codigo_transacao").GetString(),gross=row.GetProperty("valor_original_transacao").GetDecimal(),net=row.GetProperty("valor_liquido_transacao").GetDecimal(),date=row.GetProperty("data_movimentacao").GetString()});
            }
        }
        return new{records=rows,settlements=await db.Set<BillingSettlement>().OrderByDescending(x=>x.CreatedAtUtc).Take(200).ToListAsync(ct)};
    }
    private static bool IsSettlement(JsonElement row)=>row.TryGetProperty("tipo_evento",out var e)&&e.GetString()?.TrimStart('0')=="1"&&row.TryGetProperty("status_pagamento",out var s)&&s.GetString()?.TrimStart('0')=="3"&&row.TryGetProperty("quantidade_parcelas",out var q)&&int.TryParse(q.GetString(),out var n)&&n<=1&&row.TryGetProperty("taxa_antecipacao",out var fee)&&fee.GetDecimal()==0;
    public async Task<object> Settle(Guid accountId,SettlementInput input,Guid actor,CancellationToken ct)
    {
        await using var tx=await db.Database.BeginTransactionAsync(ct);
        Require(await db.Database.SqlQuery<bool>($"SELECT pg_try_advisory_xact_lock(19771007) AS \"Value\"").SingleAsync(ct),"Coleta EDI em andamento. Aguarde e atualize os documentos.");
        await ArenaLock(ct);
        BarRules.Text(input.Reason,500,"Motivo da associação");var a=await Access(accountId,null,ct);var account=await Account(accountId,null,ct);var p=account.Payments.SingleOrDefault(x=>x.Id==input.PaymentId)??throw new BarRuleException("Pagamento não pertence à conta.");
        Require(p.State=="Approved"&&p.Refunded==0&&p.Method is "Pix" or "CreditCard" or "Subscription","Concilie somente pagamentos aprovados sem estornos.");
        var document=await db.Database.SqlQuery<EdiDocument>($"SELECT id AS \"Id\",payload::text AS \"Payload\",movement AS \"Movement\",validated AS \"Validated\" FROM provider_documents WHERE id={input.DocumentId} AND provider='pagbank-edi' AND fetched_at_utc=(SELECT MAX(v.fetched_at_utc) FROM provider_documents v WHERE v.provider=provider_documents.provider AND v.movement=provider_documents.movement AND v.movement_date=provider_documents.movement_date AND v.validated=true)").SingleOrDefaultAsync(ct);
        Require(document is {Validated:true,Movement:"financial"},"Selecione um extrato financeiro EDI validado.");
        using var json=JsonDocument.Parse(document!.Payload);var matches=json.RootElement.GetProperty("detalhes").EnumerateArray().Where(x=>x.GetProperty("movimento_api_codigo").GetString()==input.ExternalId).ToArray();Require(matches.Length==1&&IsSettlement(matches[0]),"Movimento não é uma liquidação simples elegível.");
        var row=matches[0];var gross=row.GetProperty("valor_original_transacao").GetDecimal();var net=row.GetProperty("valor_liquido_transacao").GetDecimal();var fee=row.GetProperty("taxa_intermediacao").GetDecimal()+row.GetProperty("tarifa_intermediacao").GetDecimal();
        Require(gross==p.Amount&&gross==net+fee,"Bruto, taxa e líquido não conferem com o pagamento.");
        var settlement=new BillingSettlement(accountId,p.Id,document.Id,input.ExternalId,gross,fee,net,DateOnly.ParseExact(row.GetProperty("data_movimentacao").GetString()!,"yyyy-MM-dd"));
        if(a.Kind=="Bar")await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM bar_tabs WHERE \"Id\"={a.SourceId} FOR UPDATE",ct);
        db.ChangeTracker.Clear();
        var current=(await Account(accountId,null,ct)).Payments.Single(x=>x.Id==input.PaymentId);
        Require(!await db.Set<BillingRefund>().AnyAsync(x=>x.PaymentId==input.PaymentId&&x.State=="Pending",ct)&&!await db.Set<BarTabRefund>().AnyAsync(x=>x.PaymentId==input.PaymentId&&x.State=="Pending",ct),"Há estorno em confirmação.");
        Require(current.State=="Approved"&&current.Refunded==0,"Pagamento alterado durante a conciliação.");
        var previous=await db.Set<BillingSettlement>().SingleOrDefaultAsync(x=>x.PaymentId==p.Id||x.ExternalId==input.ExternalId,ct);
        if(previous is not null){Require(previous.PaymentId==p.Id&&previous.ExternalId==input.ExternalId,"Pagamento ou movimento já conciliado.");return previous;}
        db.Add(settlement);db.AuditLogs.Add(LongBeach.Domain.Auditing.AuditLog.Create(actor,"EdiPaymentMatched","BillingSettlement",settlement.Id.ToString(),JsonSerializer.Serialize(new{input.Reason,input.PaymentId,input.DocumentId,input.ExternalId}),null,"LongBeachOS",settlement.Id.ToString(),time.GetUtcNow()));
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return settlement;
    }
}
