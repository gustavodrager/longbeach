using System.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Bar;
using LongBeach.Application.Billing;
using LongBeach.Application.Finance;
using LongBeach.Contracts.Bar;
using LongBeach.Contracts.Billing;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using LongBeach.Application.Operations;

namespace LongBeach.Infrastructure.Billing;

public sealed partial class BillingService(LongBeachDbContext db, IPaymentGateway gateway, IBarTabs tabs,
    IRecurringGateway recurring, IRentalGroups rentals, TimeProvider time, ILogger<BillingService> logger, IConfiguration config, IBillingPaymentGateways? paymentGateways = null) : IBilling
{
    private static void Require(bool condition, string message) { if (!condition) throw new BarRuleException(message); }
    private static JsonObject Payload(OperationalRecord r) => JsonNode.Parse(r.Payload)!.AsObject();
    private static string Text(JsonObject p, string key) => p[key]?.ToString() ?? "";
    internal static async Task<(string Kind, Guid Id)> BillingSource(LongBeachDbContext db, JsonObject p, CancellationToken ct)
    {
        var kind=Text(p,"sourceKind");var id=SourceId(p);
        if(kind!="rentalMonths")return (kind,id);
        var month=await db.OperationalRecords.SingleAsync(x=>x.Id==id&&x.Kind=="rentalMonths",ct);
        return ("rentalGroups",Guid.Parse(Text(Payload(month),"rentalGroupId")));
    }
    private static Guid SourceId(JsonObject p) => Guid.TryParse(Text(p,"sourceId"), out var id) ? id : Guid.Empty;
    private static DateOnly? Date(JsonObject p, string key) => DateOnly.TryParseExact(Text(p,key),"yyyy-MM-dd",out var d) ? d : null;
    private Task ArenaLock(CancellationToken ct) => db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)",ct);
    private async Task<BillingAccount> Access(Guid id, Guid? user, CancellationToken ct)
    {
        var account=await db.Set<BillingAccount>().SingleOrDefaultAsync(x=>x.Id==id && (user==null || x.UserId==user),ct);
        if (account is null) throw new BarTabAccessException(BarTabAccessFailure.Forbidden,"Esta conta não está disponível para seu usuário.");
        return account;
    }
    private async Task<OperationalRecord> Entry(BillingAccount a, CancellationToken ct) => await db.OperationalRecords.SingleOrDefaultAsync(x=>x.Id==a.SourceId && x.Kind=="financeEntries",ct) ?? throw new BarRuleException("Lançamento não encontrado.");
    private bool Enabled=>config.GetValue("Payments:Billing:Enabled",false);
    public async Task<BillingConfig> Config(CancellationToken ct)
    {
        string? card=null,subscription=null;
        if(Enabled&&gateway.CardEnabled)try{card=await gateway.CardPublicKey(ct);}catch(Exception e)when(!ct.IsCancellationRequested){logger.LogWarning("Card setup unavailable: {FailureType}",e.GetType().Name);}
        if(Enabled&&recurring.Enabled)try{subscription=await recurring.PublicKey(ct);}catch(Exception e)when(!ct.IsCancellationRequested){logger.LogWarning("Subscription setup unavailable: {FailureType}",e.GetType().Name);}
        var courtPix=Enabled&&NewPixGateway().Gateway.Enabled;
        var barPix=Enabled&&gateway.Enabled;
        return new(courtPix||barPix,card!=null,subscription!=null,card,subscription,courtPix,barPix);
    }
    public async Task<BillingCandidates> Candidates(CancellationToken ct)
    {
        var assigned=await db.Set<BillingAccount>().Select(x=>x.SourceId).ToListAsync(ct);
        var entries=await db.OperationalRecords.AsNoTracking().Where(x=>x.Kind=="financeEntries").ToListAsync(ct);
        var candidates=entries.Where(x=>!assigned.Contains(x.Id)).Where(x=>Eligible(Payload(x))).Select(x=>new AccountCandidate("Quadra",x.Id,x.Name)).ToList();
        candidates.AddRange(await db.Set<BarTab>().Where(x=>!assigned.Contains(x.Id) && x.State=="Open").Select(x=>new AccountCandidate("Bar",x.Id,"Comanda "+x.Number+" · "+x.Name)).ToListAsync(ct));
        return new(candidates,await db.Users.Where(x=>x.IsActive).OrderBy(x=>x.Name).Select(x=>new BillingPerson(x.Id,x.Name)).ToListAsync(ct),await db.OperationalRecords.Where(x=>x.Kind=="students").OrderBy(x=>x.Name).Select(x=>new BillingPerson(x.Id,x.Name)).ToListAsync(ct));
    }
    internal static bool CourtEntry(JsonObject p)
    {
        var body = JsonSerializer.SerializeToElement(p);
        return Text(p,"direction")=="Receber" && Text(p,"sourceKind") is "reservations" or "enrollments" or "rentalMonths"
            && BusinessAllocationRules.Validate(body) is null && FinancialReceiptRules.Validate(body) is null;
    }
    private static bool Eligible(JsonObject p) => CourtEntry(p) && Text(p,"status")!="Cancelado";
    private bool VisibleCourtReceipt(JsonObject p)
    {
        // The administrative read model also includes direct receipts recorded by staff.
        // Assign and payment creation keep their narrower source-linked eligibility rules.
        if(Text(p,"direction")!="Receber"||Text(p,"status") is not ("Pendente" or "Pago")
            ||p["amount"] is not JsonValue value||!value.TryGetValue<decimal>(out var amount)
            ||amount<=0||amount>999_999_999||decimal.Round(amount,2)!=amount||Date(p,"dueDate") is null
            ||Text(p,"origin") is not ("Bar" or "Escola" or "Locações" or "Arena"))return false;
        if(Text(p,"status")=="Pago"&&(Date(p,"paidDate") is not { } paid||paid>Today))return false;
        var body=JsonSerializer.SerializeToElement(p);
        if(BusinessAllocationRules.Validate(body) is not null||FinancialReceiptRules.Validate(body) is not null)return false;
        return CourtEntry(p)||Text(p,"receiptSource")=="CourtPix"
            ||Text(p,"allocationScope")=="Unit"&&Text(p,"businessUnitId")==BusinessUnits.Court
            ||BusinessAllocationRules.FromLegacy(Text(p,"origin")).BusinessUnitId==BusinessUnits.Court;
    }
    public async Task<AccountDto> Assign(AssignAccountInput input, Guid actor, CancellationToken ct)
    {
        await using var tx=await db.Database.BeginTransactionAsync(ct); await ArenaLock(ct);
        Require(await db.Users.AnyAsync(x=>x.Id==input.UserId && x.IsActive,ct),"Escolha um usuário ativo.");
        if(input.StudentId is not null)
        {
            Require(await db.OperationalRecords.AnyAsync(x=>x.Id==input.StudentId && x.Kind=="students",ct),"Aluno inexistente.");
            Require(!await db.Set<BillingAccount>().AnyAsync(x=>x.StudentId==input.StudentId && x.UserId!=input.UserId,ct),"Este aluno já está vinculado a outro usuário. Revise o cadastro.");
        }
        if(input.Kind=="Bar") Require(await db.Set<BarTab>().AnyAsync(x=>x.Id==input.SourceId,ct),"Comanda inexistente.");
        else
        {
            var r=await db.OperationalRecords.SingleOrDefaultAsync(x=>x.Id==input.SourceId&&x.Kind=="financeEntries",ct);
            Require(r is not null && Eligible(Payload(r)),"Escolha uma cobrança de reserva, matrícula ou mensalista.");
            var p=Payload(r!);
            var (sourceKind,source)=await BillingSource(db,p,ct);
            if(sourceKind=="rentalGroups")
            {
                var linked=await db.Set<BillingAccount>().Where(x=>x.Kind=="Quadra"&&x.UserId!=input.UserId).ToListAsync(ct);
                foreach(var prior in linked)
                {
                    var identity=await BillingSource(db,Payload(await Entry(prior,ct)),ct);
                    Require(identity!=(sourceKind,source),"O grupo já possui outro responsável financeiro vinculado.");
                }
            }
            if(Text(p,"sourceKind")=="reservations")
            {
                var reservation=await db.OperationalRecords.SingleAsync(x=>x.Id==SourceId(p),ct);
                Require(string.IsNullOrEmpty(Text(Payload(reservation),"rentalGroupId")),"Encontro de mensalista não deve ser cobrado separadamente.");
            }
            if(Text(p,"sourceKind")=="enrollments")
            {
                var enrollment=await db.OperationalRecords.SingleAsync(x=>x.Id==SourceId(p),ct);
                Require(input.StudentId.HasValue && Text(Payload(enrollment),"studentId")==input.StudentId.ToString(),"Vincule o aluno da matrícula ao usuário responsável.");
            }
        }
        var existing=await db.Set<BillingAccount>().SingleOrDefaultAsync(x=>x.Kind==input.Kind&&x.SourceId==input.SourceId,ct);
        if(existing is not null) Require(existing.UserId==input.UserId && existing.StudentId==input.StudentId,"Conta já vinculada. Não é possível transferir uma dívida por este fluxo.");
        var account=existing??new BillingAccount(input.Kind,input.SourceId,input.UserId,input.StudentId,actor);
        if(existing is null) db.Add(account); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return await Account(account.Id,null,ct);
    }
    public async Task<IReadOnlyList<AccountDto>> Accounts(Guid? userId,CancellationToken ct)
    {
        // Keep the administrative overview consistent if an assignment is committed between reads.
        await using var snapshot=userId is null&&db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead,ct) : null;
        var accounts=await db.Set<BillingAccount>().AsNoTracking().Where(x=>userId==null||x.UserId==userId).OrderByDescending(x=>x.CreatedAtUtc).ToListAsync(ct);
        var administrativeBar=userId is null?await AdministrativeBarAccounts(accounts,ct):null;
        var results=new List<AccountDto>();
        foreach(var account in accounts)
            results.Add(account.Kind=="Bar"&&administrativeBar is not null
                ? administrativeBar.GetValueOrDefault(account.SourceId)??throw new BarRuleException("Comanda não encontrada.")
                : await Account(account.Id,userId,ct));
        if(userId is null)
        {
            var linked=accounts.Select(x=>(x.Kind,x.SourceId)).ToHashSet();
            results.AddRange(administrativeBar!.Values.Where(x=>!x.IsLinked));
            var entries=await db.OperationalRecords.AsNoTracking().Where(x=>x.Kind=="financeEntries").OrderByDescending(x=>x.CreatedAtUtc).ToListAsync(ct);
            foreach(var entry in entries.Where(x=>!linked.Contains(("Quadra",x.Id))))
            {
                var payload=Payload(entry);if(!VisibleCourtReceipt(payload))continue;
                var total=payload["amount"]!.GetValue<decimal>();var paid=Text(payload,"status")=="Pago"?total:0;
                // A recorded receipt is not proof of a new bank transaction. Keep its payment list empty.
                results.Add(new(entry.Id,"Quadra",entry.Id,Text(payload,"name"),Date(payload,"dueDate"),total,paid,0,Math.Max(0,total-paid),Text(payload,"status"),[],false,Guid.Empty,Text(payload,"month"),null,IsLinked:false));
            }
        }
        if(snapshot is not null)await snapshot.CommitAsync(ct);
        return results;
    }
    private async Task<Dictionary<Guid,AccountDto>> AdministrativeBarAccounts(IReadOnlyList<BillingAccount> accounts,CancellationToken ct)
    {
        var barTabs=await db.Set<BarTab>().AsNoTracking().OrderByDescending(x=>x.CreatedAtUtc).ThenByDescending(x=>x.Number).ToListAsync(ct);
        if(barTabs.Count==0)return [];
        var ids=barTabs.Select(x=>x.Id).ToArray();
        var items=(await db.Set<BarTabItem>().AsNoTracking().Where(x=>ids.Contains(x.TabId)).OrderBy(x=>x.CreatedAtUtc).ThenBy(x=>x.Id).ToListAsync(ct)).ToLookup(x=>x.TabId);
        var payments=(await db.Set<BarTabPayment>().AsNoTracking().Where(x=>ids.Contains(x.TabId)).OrderByDescending(x=>x.CreatedAtUtc).ThenByDescending(x=>x.Id).ToListAsync(ct)).ToLookup(x=>x.TabId);
        var pendingRefunds=await db.Set<BarTabRefund>().AsNoTracking().Where(x=>ids.Contains(x.TabId)&&x.State=="Pending")
            .GroupBy(x=>x.PaymentId).Select(g=>new{PaymentId=g.Key,Amount=g.Sum(x=>x.Amount)}).ToDictionaryAsync(x=>x.PaymentId,x=>x.Amount,ct);
        var linked=accounts.Where(x=>x.Kind=="Bar").ToDictionary(x=>x.SourceId);
        var result=new Dictionary<Guid,AccountDto>();
        foreach(var tab in barTabs)
        {
            var rows=payments[tab.Id].ToArray();var consumption=items[tab.Id].ToArray();
            var totals=LongBeach.Infrastructure.Bar.BarTabsService.Calculate(consumption,rows,tab.Discount);
            var account=linked.GetValueOrDefault(tab.Id);
            result.Add(tab.Id,new(account?.Id??tab.Id,"Bar",tab.Id,$"{(tab.Mode=="Immediate"?"Venda":"Comanda")} {tab.Number} · {tab.Name}",null,
                totals.Total,totals.Paid,totals.Pending,totals.Payable,tab.State,
                rows.Select(p=>new AccountPaymentDto(p.Id,p.OperationId,p.Method,p.Amount,p.State,p.Refunded,p.PixText,p.QrImageUrl,p.ExpiresAtUtc,p.ConfirmedAtUtc,p.State=="Pending"&&p.ProviderId==null,pendingRefunds.GetValueOrDefault(p.Id),p.TerminalType)).ToArray(),
                false,account?.UserId??Guid.Empty,null,null,consumption.Select(i=>new AccountItemDto(i.Id,i.Name,i.Quantity,i.UnitPrice,i.Total,i.State)).ToArray(),tab.Discount,account is not null));
        }
        return result;
    }
    private static AccountDto BarAccount(Guid id,Guid userId,TabResponse tab) =>
        new(id,"Bar",tab.Id,$"{(tab.Mode=="Immediate"?"Venda":"Comanda")} {tab.Number} · {tab.Name}",null,tab.Total,tab.Paid,tab.Pending,tab.Payable,tab.State,tab.Payments.OrderByDescending(p=>p.CreatedAtUtc).ThenByDescending(p=>p.Id).Select(p=>new AccountPaymentDto(p.Id,p.OperationId,p.Method,p.Amount,p.State,p.Refunded,p.PixText,p.QrImageUrl,p.ExpiresAtUtc,p.ConfirmedAtUtc,p.CanResume,p.RefundPending,p.TerminalType)).ToArray(),false,userId,null,null,tab.Items.Select(i=>new AccountItemDto(i.Id,i.Name,i.Quantity,i.UnitPrice,i.Total,i.State)).ToArray(),tab.Discount);
    public async Task<AccountDto> Account(Guid id,Guid? userId,CancellationToken ct)
    {
        var a=await Access(id,userId,ct);
        if(a.Kind=="Bar")
        {
            var t=await tabs.Get(a.SourceId,false,ct);
            return BarAccount(a.Id,a.UserId,t);
        }
        var p=Payload(await Entry(a,ct));var payments=await db.Set<BillingPayment>().Where(x=>x.AccountId==id).OrderByDescending(x=>x.CreatedAtUtc).ToListAsync(ct);
        var total=p["amount"]!.GetValue<decimal>();var paid=payments.Where(x=>x.State is "Approved" or "Refunded").Sum(x=>x.Amount-x.Refunded);
        if(Text(p,"status")=="Pago" && payments.All(x=>x.State=="Canceled"))paid=total;
        var paymentIds=payments.Select(x=>x.Id).ToArray();
        var refunds=await db.Set<BillingRefund>().Where(x=>x.State=="Pending"&&paymentIds.Contains(x.PaymentId)).ToListAsync(ct);
        var pending=payments.Where(x=>x.State=="Pending").Sum(x=>x.Amount);
        var (kind,source)=await BillingSource(db,p,ct);
        var subscriptionId=await db.Set<BillingSubscription>().Where(x=>x.SourceKind==kind&&x.SourceId==source&&x.State!="CANCELED"&&x.State!="EXPIRED"&&x.State!="Rejected").Select(x=>(Guid?)x.Id).SingleOrDefaultAsync(ct);
        return new(a.Id,a.Kind,a.SourceId,Text(p,"name"),Date(p,"dueDate"),total,paid,pending,Text(p,"status")=="Cancelado"?0:Math.Max(0,total-paid-pending),Text(p,"status"),payments.Select(p=>Dto(p) with { RefundPending=refunds.Where(r=>r.PaymentId==p.Id).Sum(r=>r.Amount) }).ToArray(),Eligible(p) && Text(p,"sourceKind") is "enrollments" or "rentalMonths",a.UserId,Text(p,"month"),subscriptionId);
    }
    private static AccountPaymentDto Dto(BillingPayment p)=>new(p.Id,p.OperationId,p.Method,p.Amount,p.State,p.Refunded,p.PixText,p.QrImageUrl,p.ExpiresAtUtc,p.PaidAtUtc,p.State=="Pending"&&p.ProviderId==null);
    private static void ValidatePayer(PayAccountInput i)
    {
        Require(i.OperationId!=Guid.Empty&&i.Method is "Pix" or "CreditCard","Escolha Pix ou crédito à vista.");
        BarRules.Text(i.Name,160,"Nome"); BarRules.Text(i.Email,320,"E-mail");
        Require(System.Text.RegularExpressions.Regex.IsMatch(i.Email,@"^[^\s@]+@[^\s@]+\.[^\s@]+$") && System.Text.RegularExpressions.Regex.IsMatch(i.TaxId,@"^(?:[0-9]{11}|[0-9]{14})$"),"Confira e-mail e CPF/CNPJ.");
        if(i.Method=="CreditCard")Require(!string.IsNullOrWhiteSpace(i.EncryptedCard)&&i.EncryptedCard.Length<=12000,"Informe o cartão criptografado.");
    }
    public async Task<AccountDto> Pay(Guid id,PayAccountInput input,Guid actor,bool own,CancellationToken ct)
    {
        ValidatePayer(input);var a=await Access(id,own?actor:null,ct);
        if(a.Kind=="Bar")
        {
            Require(Enabled,"Novos pagamentos pela área de contas estão desabilitados.");
            var account=await Account(id,own?actor:null,ct);var prior=account.Payments.SingleOrDefault(x=>x.OperationId==input.OperationId);
            await tabs.Pay(a.SourceId,new TabPaymentInput(input.OperationId,input.Method,input.Amount??prior?.Amount??account.Payable,Name:input.Name,Email:input.Email,TaxId:input.TaxId,EncryptedCard:input.EncryptedCard),actor,null,ct);
            return await Account(id,own?actor:null,ct);
        }
        BillingPayment payment;
        await using(var tx=await db.Database.BeginTransactionAsync(ct))
        {
            await ArenaLock(ct);var entry=await Entry(a,ct);var p=Payload(entry);
            payment=await db.Set<BillingPayment>().SingleOrDefaultAsync(x=>x.OperationId==input.OperationId,ct)??null!;
            if(payment is not null)Require(payment.AccountId==id&&payment.Method==input.Method&&payment.ActorId==actor&&(input.Amount==null||input.Amount==payment.Amount),"Chave de outro pagamento.");
            else
            {
                Require(Enabled,"Novos pagamentos pela área de contas estão desabilitados.");
                Require(Eligible(p)&&Text(p,"status")=="Pendente","Esta conta não está pendente.");
                var (kind,source)=await BillingSource(db,p,ct);
                Require(!await db.Set<BillingSubscription>().AnyAsync(x=>x.SourceId==source&&x.SourceKind==kind&&x.State!="CANCELED"&&x.State!="EXPIRED"&&x.State!="Rejected",ct),"Há assinatura vinculada. Resolva a cobrança automática antes de pagar avulso.");
                var account=await Account(id,null,ct);Require(account.Pending==0&&account.Payable>0,"Pagamento já iniciado ou conta quitada.");
                Require(input.Amount==null||input.Amount==account.Payable,"Reservas e mensalidades devem ser pagas pelo saldo integral.");
                var selected=input.Method=="Pix"?NewPixGateway():new BillingGatewaySelection("PagBank",null,null,gateway);
                Require(input.Method=="Pix"?selected.Gateway.Enabled:selected.Gateway.CardEnabled,"Forma de pagamento ainda não habilitada.");
                payment=new BillingPayment(id,input.OperationId,account.Payable,input.Method,actor,time.GetUtcNow().AddMinutes(10),selected.Provider,selected.Environment,selected.AccountId);db.Add(payment);
                if(payment.Provider=="C6")AuditC6(payment,"C6PaymentInitiated",actor);
                await db.SaveChangesAsync(ct);
            }
            await tx.CommitAsync(ct);
        }
        if(payment.State!="Pending")return await Account(id,own?actor:null,ct);
        if(payment.ProviderId is null)
        {
            Require(time.GetUtcNow()-payment.CreatedAtUtc<TimeSpan.FromHours(24),"Cobrança antiga sem confirmação. Confira a situação com o responsável financeiro antes de repetir.");
            var customer=new PixCustomer(input.Name,input.Email,input.TaxId);
            GatewayPayment remote;
            var selected=PaymentGateway(payment);
            Require(Enabled || payment.Provider=="C6","Novos pagamentos pela área de contas estão desabilitados.");
            try
            {
                remote=payment.Provider=="C6"&&(!Enabled||!selected.Enabled)
                    ? await selected.Get(payment.OperationId.ToString("N"),ct)
                    : input.Method=="Pix"?await selected.CreatePix(payment.Id,payment.OperationId,payment.Amount,payment.ExpiresAtUtc,customer,ct)
                    : await selected.CreateCard(payment.Id,payment.OperationId,payment.Amount,customer,input.EncryptedCard!,ct);
            }
            catch(Exception e) when(e is HttpRequestException or TaskCanceledException or BarRuleException) { throw new BarPaymentConfirmationPendingException(payment.Id,payment.OperationId,"A cobrança está em confirmação. Atualize ou retome com a mesma operação."); }
            Validate(payment,remote);
            await using var tx=await db.Database.BeginTransactionAsync(ct);await ArenaLock(ct);await db.Entry(payment).ReloadAsync(ct);payment.Bind(remote.OrderId,remote.ChargeId,remote.PixText,remote.QrImageUrl);await RecordOrder(payment,remote.Reference,ct);await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
        }
        return await Refresh(id,payment.Id,actor,own,ct);
    }
    public async Task<AccountDto> Refresh(Guid id,Guid paymentId,Guid actor,bool own,CancellationToken ct)
    {
        var a=await Access(id,own?actor:null,ct);
        if(a.Kind=="Bar")await tabs.Refresh(a.SourceId,paymentId,actor,null,ct);
        else
        {
            var p=await db.Set<BillingPayment>().SingleOrDefaultAsync(x=>x.Id==paymentId&&x.AccountId==id,ct)??throw new BarRuleException("Pagamento não pertence à conta.");
            if(p.Method=="Subscription")await SyncSubscriptionFor(a,ct);
            else if(p.ProviderId is not null || p.Provider=="C6")
            {
                var remote=await PaymentGateway(p).Get(p.ProviderId??p.OperationId.ToString("N"),ct);
                await Observe(p,remote,ct);
            }
            else throw new BarPaymentConfirmationPendingException(p.Id,p.OperationId,"Retome a cobrança com a mesma operação e dados do pagador.");
        }
        return await Account(id,own?actor:null,ct);
    }
    private async Task RecordOrder(BillingPayment payment,string reference,CancellationToken ct)
    {
        if(!await db.Set<BillingProviderOrder>().AnyAsync(x=>x.PaymentId==payment.Id,ct))db.Add(new BillingProviderOrder(payment.Id,payment.ProviderId!,reference,payment.Method=="Subscription"?"Invoice":"Order",payment.Amount,"BRL",payment.Provider,payment.ProviderEnvironment,payment.ProviderAccountId));
    }
    private BillingGatewaySelection NewPixGateway()
    {
        if(paymentGateways is not null)return paymentGateways.NewCourtPix();
        Require(!(config.GetValue("Integrations:C6:Enabled",false)&&config.GetValue("Integrations:C6:PixEnabled",false)),"Conexão C6 indisponível.");
        return new("PagBank",null,null,gateway);
    }
    private IPaymentGateway PaymentGateway(BillingPayment p)
    {
        if(paymentGateways is not null)return paymentGateways.For(p);
        Require(p.Provider=="PagBank","Conexão C6 indisponível para este pagamento.");
        return gateway;
    }
    private static void Validate(BillingPayment p,GatewayPayment r)
    {
        Require(r.Reference==p.Id.ToString()&&r.Amount==checked((long)(p.Amount*100))&&r.Currency=="BRL"&&(p.ProviderId==null||p.ProviderId==r.OrderId)&&(p.ChargeId==null||p.ChargeId==r.ChargeId),"Referência ou valor divergente no provedor.");
        if(p.Provider=="C6")Require(r.OrderId==p.OperationId.ToString("N")&&r.ChargeId==r.OrderId&&r.ProviderAccountId==p.ProviderAccountId&&r.ProviderEnvironment==p.ProviderEnvironment&&(r.State!="PAID"||!string.IsNullOrWhiteSpace(r.PixEndToEndId)),"Conta ou identificação Pix divergente no C6.");
    }
    private async Task Observe(BillingPayment payment,GatewayPayment remote,CancellationToken ct)
    {
        Validate(payment,remote);await using var tx=await db.Database.BeginTransactionAsync(ct);await ArenaLock(ct);await db.Entry(payment).ReloadAsync(ct);Validate(payment,remote);
        var previousVersion=payment.Version;
        if(payment.ProviderId is null || (string.IsNullOrWhiteSpace(payment.PixText) && !string.IsNullOrWhiteSpace(remote.PixText)))
        { payment.Bind(remote.OrderId,remote.ChargeId,remote.PixText,remote.QrImageUrl); await RecordOrder(payment,remote.Reference,ct); }
        payment.ObservePixIdentity(remote.PixEndToEndId);
        payment.Observe(remote.State,remote.Refunded/100m,time.GetUtcNow());
        await UpdateEntry(payment,ct);
        if(payment.Provider=="C6" && payment.Version!=previousVersion)AuditC6(payment,"C6PaymentObserved");
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
    }
    private async Task UpdateEntry(BillingPayment p,CancellationToken ct)
    {
        var account=await Access(p.AccountId,null,ct);var entry=await Entry(account,ct);var json=Payload(entry);
        var payments=await db.Set<BillingPayment>().Where(x=>x.AccountId==account.Id).ToListAsync(ct);
        var paid=payments.Where(x=>x.State is "Approved" or "Refunded").Sum(x=>x.Amount-x.Refunded);
        if((Text(json,"status") is "Pago" or "Cancelado")&&payments.All(x=>x.State=="Canceled"))return;
        var status=paid>=json["amount"]!.GetValue<decimal>()?"Pago":"Pendente";
        if(Text(json,"status")==status)return;
        json["status"]=status;
        if(status=="Pago" && p.Provider=="C6") { json["receiptSource"]="CourtPix"; json["receivingAccount"]="C6"; }
        json["paidDate"]=Text(json,"status")=="Pago"?TimeZoneInfo.ConvertTime(p.PaidAtUtc??time.GetUtcNow(),TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo")).ToString("yyyy-MM-dd"):"";
        json["version"]=(json["version"]?.GetValue<int>()??0)+1;entry.Update(entry.Name,json.ToJsonString());
    }
}
