using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Billing;
using LongBeach.Contracts.Billing;
using LongBeach.Domain.Bar;
using LongBeach.Domain.Billing;
using LongBeach.Domain.Operations;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Billing;
public sealed partial class BillingService
{
    private DateOnly Today=>DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(time.GetUtcNow(),TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo")).DateTime);
    private static SubscriptionDto Dto(BillingSubscription s)=>new(s.Id,s.OperationId,s.AccountId,s.Amount,s.FirstDue,s.State,s.ProviderId==null&&s.State=="Creating"&&!s.CreationAttempted,s.UpdateExistingCustomerCard,s.FailureReason);
    public async Task<IReadOnlyList<SubscriptionDto>> Subscriptions(Guid userId,CancellationToken ct)=> (await db.Set<BillingSubscription>().Where(x=>x.UserId==userId).OrderByDescending(x=>x.CreatedAtUtc).ToListAsync(ct)).Select(Dto).ToArray();
    public async Task<SubscriptionDto> Subscribe(Guid accountId,SubscribeInput input,Guid userId,CancellationToken ct)
    {
        // A session lock spans the customer-card update AND subscription creation,
        // across replicas. Keep the physical connection open until explicit release.
        await using var customerLock=await LockSubscriptionCustomer(userId,ct);
        return await SubscribeLocked(accountId,input,userId,ct);
    }
    private async Task<SubscriptionDto> SubscribeLocked(Guid accountId,SubscribeInput input,Guid userId,CancellationToken ct)
    {
        Require(Enabled&&recurring.Enabled,"Assinaturas ainda não habilitadas.");Require(input.Consent,"Confirme a autorização da cobrança mensal.");
        ValidatePayer(new(input.OperationId,"CreditCard",input.Name,input.Email,input.TaxId,input.EncryptedCard));
        Require(ValidTaxId(input.TaxId),"Confira o CPF/CNPJ informado antes de autorizar a assinatura.");
        Require(input.Email.Length<=60&&input.Name.Length<=150&&System.Text.RegularExpressions.Regex.IsMatch(input.Phone,"^[0-9]{10,11}$")&&System.Text.RegularExpressions.Regex.IsMatch(input.SecurityCode,"^[0-9]{3,4}$"),"Confira nome, e-mail, telefone e código de segurança.");
        BillingSubscription s;
        await using(var tx=await db.Database.BeginTransactionAsync(ct))
        {
            await ArenaLock(ct);var a=await Access(accountId,userId,ct);Require(a.Kind=="Quadra","Assinatura disponível somente para mensalidades.");var entry=await Entry(a,ct);var p=Payload(entry);
            s=await db.Set<BillingSubscription>().SingleOrDefaultAsync(x=>x.OperationId==input.OperationId,ct)??null!;
            if(s is not null)Require(s.AccountId==accountId&&s.UserId==userId&&s.Amount==input.ExpectedAmount&&s.FirstDue==input.ExpectedFirstDue&&s.UpdateExistingCustomerCard==input.UpdateExistingCustomerCard,"Operação de outra assinatura.");
            else
            {
                Require(!await db.Set<BillingSubscription>().AnyAsync(x=>x.UserId==userId&&x.State=="Creating"&&x.CreationAttempted&&x.ProviderId==null,ct),"Há outra adesão deste responsável aguardando confirmação. Concilie antes de atualizar o cartão ou iniciar outra mensalidade.");
                var account=await Account(accountId,userId,ct);Require(account.RecurringEligible&&account.Paid==0&&account.Pending==0&&account.Payable==account.Total&&account.Total>0,"Escolha uma mensalidade integral ainda não paga.");
                Require(account.DueDate.HasValue&&account.DueDate.Value>=Today&&account.Total==input.ExpectedAmount&&account.DueDate.Value==input.ExpectedFirstDue,"Valor ou vencimento mudou. Confira antes de autorizar.");
                Require(account.Competence==input.ExpectedFirstDue.ToString("yyyy-MM"),"A primeira cobrança deve pertencer à competência do vencimento.");
                var (kind,source)=await BillingSource(db,p,ct);
                if(kind=="rentalGroups")
                {
                    var group=Payload(await db.OperationalRecords.SingleAsync(x=>x.Id==source&&x.Kind==kind,ct));
                    Require(Text(group,"fifthPolicy")=="Incluído"&&Text(group,"status")=="Ativo"&&group["monthlyAmount"]?.GetValue<decimal>()==account.Total,"Assinatura exige grupo ativo com mensalidade fixa e quinto encontro incluído.");
                }
                Require(!await db.Set<BillingSubscription>().AnyAsync(x=>x.SourceKind==kind&&x.SourceId==source&&x.State!="CANCELED"&&x.State!="EXPIRED"&&x.State!="Rejected",ct),"Já existe assinatura para esta matrícula ou grupo.");
                var entries=await db.OperationalRecords.Where(x=>x.Kind=="financeEntries").ToListAsync(ct);
                foreach(var existing in entries)
                {
                    var payload=Payload(existing);
                    if(StringComparer.Ordinal.Compare(Text(payload,"month"),account.Competence)<0)continue;
                    if(await BillingSource(db,payload,ct)!=(kind,source))continue;
                    Require(Text(payload,"status")!="Pago","Há competências futuras pagas. Concilie antes de aderir.");
                    var existingAccount=await db.Set<BillingAccount>().SingleOrDefaultAsync(x=>x.Kind=="Quadra"&&x.SourceId==existing.Id,ct);
                    if(existingAccount is not null)Require(!await db.Set<BillingPayment>().AnyAsync(x=>x.AccountId==existingAccount.Id&&x.State!="Canceled"&&x.State!="Refunded",ct),"Há cobrança futura em processamento. Concilie antes de aderir.");
                }
                s=new BillingSubscription(accountId,input.OperationId,userId,kind,source,account.Total,input.ExpectedFirstDue,time.GetUtcNow(),input.UpdateExistingCustomerCard);db.Add(s);await db.SaveChangesAsync(ct);
            }
            await tx.CommitAsync(ct);
        }
        if(s.State=="Rejected")return Dto(s);
        if(s.ProviderId is null && s.CreationAttempted)
        {
            // A new cryptogram changes the idempotent request body. Never replay an
            // uncertain charge or customer-card mutation with freshly entered data.
            await RecoverSubscriptionBinding(s,ct);
            if(s.ProviderId is null)return Dto(s);
        }
        if(s.ProviderId is null)
        {
            Require(!await db.Set<BillingSubscription>().AnyAsync(x=>x.UserId==userId&&x.Id!=s.Id&&x.State=="Creating"&&x.CreationAttempted&&x.ProviderId==null,ct),"Há outra adesão deste responsável aguardando confirmação. Concilie antes de atualizar o cartão ou iniciar outra mensalidade.");
            Require(time.GetUtcNow()-s.CreatedAtUtc<TimeSpan.FromHours(24),"Assinatura sem confirmação há mais de um dia. Concilie a operação no PagBank.");
            Require(DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(s.CreatedAtUtc,TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo")).DateTime)==Today,"Retomada após mudança de data exige conciliação para preservar o vencimento autorizado.");
            try
            {
                var customer=await recurring.FindCustomer(input.TaxId,ct);
                if(customer is not null)
                {
                    var owned=customer.TaxId==input.TaxId&&(customer.Reference==userId.ToString()||
                        (Guid.TryParse(customer.Reference,out var legacy)&&await db.Set<BillingSubscription>().AnyAsync(x=>x.Id==legacy&&x.UserId==userId,ct)));
                    if(!owned)throw new RecurringCreationRejectedException("O cadastro PagBank deste CPF/CNPJ não está vinculado ao seu usuário. Solicite a revisão do responsável financeiro.");
                    if(!s.UpdateExistingCustomerCard)throw new RecurringCreationRejectedException("Este CPF/CNPJ já possui cadastro no PagBank. Para usar o cartão informado, autorize a atualização do cartão do assinante e tente novamente.");
                }
                if(s.PlanId is null)
                {
                    var plan=await recurring.CreatePlan(s.Id,s.Amount,s.FirstDue.DayNumber-Today.DayNumber,ct);
                    await using var tx=await db.Database.BeginTransactionAsync(ct);await ArenaLock(ct);await db.Entry(s).ReloadAsync(ct);s.Plan(plan);await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
                }
                await using(var tx=await db.Database.BeginTransactionAsync(ct))
                {
                    await ArenaLock(ct);await db.Entry(s).ReloadAsync(ct);s.BeginCreation();await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
                }
                var remote=customer is null?await recurring.Create(s.Id,s.OperationId,s.PlanId!,input,ct):
                    await recurring.CreateForCustomer(s.Id,s.OperationId,s.PlanId!,input,customer,ct);
                Validate(s,remote);
                await BindSubscription(s,remote,ct);
            }
            catch(RecurringCreationRejectedException ex)
            {
                // Only explicit provider validation or pre-dispatch local refusal is
                // terminal. Network failures and idempotency conflicts stay Creating.
                await using var tx=await db.Database.BeginTransactionAsync(ct);await ArenaLock(ct);await db.Entry(s).ReloadAsync(ct);
                if(s.ProviderId is null&&s.State=="Creating"){s.Reject(ex.Message);await db.SaveChangesAsync(ct);}
                await tx.CommitAsync(ct);
                if(s.ProviderId is null)return Dto(s);
            }
        }
        await SyncSubscription(s.Id,ct);return Dto(s);
    }
    private async Task BindSubscription(BillingSubscription s,RecurringState remote,CancellationToken ct)
    {
        Validate(s,remote);
        await using var tx=await db.Database.BeginTransactionAsync(ct);await ArenaLock(ct);await db.Entry(s).ReloadAsync(ct);
        Validate(s,remote);s.Bind(remote.Id);s.Observe(remote.State);await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
    }
    private async Task RecoverSubscriptionBinding(BillingSubscription s,CancellationToken ct)
    {
        var remote=await recurring.FindSubscription(s.Id,ct);
        if(remote is not null)await BindSubscription(s,remote,ct);
    }
    public async Task<SubscriptionDto> RefreshSubscription(Guid subscriptionId,Guid userId,CancellationToken ct)
    {
        var s=await db.Set<BillingSubscription>().SingleOrDefaultAsync(x=>x.Id==subscriptionId&&x.UserId==userId,ct)
            ??throw new BarTabAccessException(BarTabAccessFailure.Forbidden,"Assinatura não disponível para seu usuário.");
        if(s.State=="Rejected")return Dto(s);
        if(s.ProviderId is null&&s.CreationAttempted)await RecoverSubscriptionBinding(s,ct);
        if(s.ProviderId is not null)await SyncSubscription(s.Id,ct);
        return Dto(s);
    }
    public async Task<SubscriptionDto> Cancel(Guid subscriptionId,CancelSubscriptionInput input,Guid userId,CancellationToken ct)
    {
        var s=await db.Set<BillingSubscription>().SingleOrDefaultAsync(x=>x.Id==subscriptionId&&x.UserId==userId,ct)??throw new BarTabAccessException(BarTabAccessFailure.Forbidden,"Assinatura não disponível para seu usuário.");
        if(s.State=="CANCELED")return Dto(s);Require(s.ProviderId is not null,"Confirme a criação antes de cancelar a assinatura.");
        await using(var tx=await db.Database.BeginTransactionAsync(ct)){await ArenaLock(ct);await db.Entry(s).ReloadAsync(ct);s.Cancel(input.OperationId);await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);}
        await SyncSubscription(s.Id,ct);return Dto(s);
    }
    private static void Validate(BillingSubscription s,RecurringState r)=>Require(r.Reference==s.Id.ToString()&&r.Amount==checked((long)(s.Amount*100))&&r.Currency=="BRL"&&(s.ProviderId==null||s.ProviderId==r.Id),"Assinatura externa divergente.");
    private async Task SyncSubscriptionFor(BillingAccount account,CancellationToken ct)
    {
        var p=Payload(await Entry(account,ct));var (kind,source)=await BillingSource(db,p,ct);
        foreach(var id in await db.Set<BillingSubscription>().Where(x=>x.SourceId==source&&x.SourceKind==kind&&x.ProviderId!=null).Select(x=>x.Id).ToListAsync(ct))await SyncSubscription(id,ct);
    }
    private async Task SyncSubscription(Guid id,CancellationToken ct)
    {
        var s=await db.Set<BillingSubscription>().SingleAsync(x=>x.Id==id,ct);if(s.ProviderId is null)return;
        var remote=s.CancelOperationId.HasValue&&s.State!="CANCELED"?await recurring.Cancel(s.ProviderId,s.CancelOperationId.Value,ct):await recurring.Get(s.ProviderId,ct);Validate(s,remote);
        var invoices=await recurring.Invoices(s.ProviderId,ct);
        if(s.SourceKind=="rentalGroups")
        {
            foreach(var invoice in invoices)
            {
                Require(invoice.Occurrence>0,"Ciclo inválido.");
                var month=s.FirstDue.AddMonths(invoice.Occurrence-1).ToString("yyyy-MM");
                var preview=await rentals.Preview(s.SourceId,month,ct);
                Require(preview.Amount==s.Amount,"Valor do grupo mudou; concilie a assinatura antes de gerar outra competência.");
                await rentals.Generate(s.SourceId,new(month,preview.GroupVersion,true),ct);
            }
        }
        await using var tx=await db.Database.BeginTransactionAsync(ct);await ArenaLock(ct);await db.Entry(s).ReloadAsync(ct);Validate(s,remote);
        // Never release an automatic collection on a cancellation response alone:
        // reconcile all returned invoices in the same local transaction first.
        foreach(var invoice in invoices)
        {
            Require(invoice.Occurrence>0&&invoice.Amount==checked((long)(s.Amount*100))&&invoice.Currency=="BRL","Fatura fora do valor/ciclo autorizado. Conciliação necessária.");
            var due=s.FirstDue.AddMonths(invoice.Occurrence-1);var month=due.ToString("yyyy-MM");
            var sourceEntries=await db.OperationalRecords.Where(x=>x.Kind=="financeEntries").ToListAsync(ct);
            var matching=new List<OperationalRecord>();
            foreach(var candidate in sourceEntries)
            {
                var payload=Payload(candidate);
                if(Text(payload,"month")==month&&Text(payload,"status")!="Cancelado"&&await BillingSource(db,payload,ct)==(s.SourceKind,s.SourceId))matching.Add(candidate);
            }
            var matches=matching.ToArray();
            Require(matches.Length<=1,"Competência com cobranças duplicadas. Concilie antes de continuar.");
            OperationalRecord entry;
            if(matches.Length==0)
            {
                Require(s.SourceKind=="enrollments","Gere a competência do grupo antes de conciliar.");
                var original=Payload(await Entry(await Access(s.AccountId,null,ct),ct));var entryId=Guid.NewGuid();
                original["id"]=entryId.ToString();original["month"]=month;original["dueDate"]=due.ToString("yyyy-MM-dd");original["status"]="Pendente";original["paidDate"]="";original["amount"]=s.Amount;original["version"]=1;original["name"]="Mensalidade · "+month;
                entry=new OperationalRecord(entryId,"financeEntries",Text(original,"name"),original.ToJsonString());db.Add(entry);
            }
            else entry=matches[0];
            var pld=Payload(entry);Require(pld["amount"]!.GetValue<decimal>()==s.Amount&&Date(pld,"dueDate")==due,"Competência com valor ou vencimento divergente.");
            var account=await db.Set<BillingAccount>().SingleOrDefaultAsync(x=>x.Kind=="Quadra"&&x.SourceId==entry.Id,ct);
            if(account is null){var first=await Access(s.AccountId,null,ct);account=new BillingAccount("Quadra",entry.Id,s.UserId,first.StudentId,s.UserId);db.Add(account);}
            Require(account.UserId==s.UserId,"Competência vinculada a outro responsável.");
            var payment=await db.Set<BillingPayment>().SingleOrDefaultAsync(x=>x.ProviderId==invoice.Id,ct);
            if(payment is null)
            {
                Require(Text(pld,"status")!="Pago"&&!await db.Set<BillingPayment>().AnyAsync(x=>x.AccountId==account.Id&&x.State!="Canceled"&&x.State!="Refunded",ct),"Competência já recebida ou em processamento por outro pagamento.");
                payment=new BillingPayment(account.Id,Guid.NewGuid(),s.Amount,"Subscription",s.UserId,new DateTimeOffset(due.ToDateTime(TimeOnly.MinValue),TimeSpan.FromHours(-3)));db.Add(payment);
                payment.Bind(invoice.Id,invoice.PaymentId,null,null);
            }
            else Require(payment.AccountId==account.Id,"Fatura vinculada a outra competência.");
            if(invoice.PaymentId is not null)payment.Bind(invoice.Id,invoice.PaymentId,null,null);
            if(invoice.PaymentState=="REFUNDED")payment.Observe("PAID",s.Amount,time.GetUtcNow());
            else if(invoice.State=="PAID"&&invoice.PaymentState=="APPROVED")payment.Observe("PAID",0,time.GetUtcNow());
            else if(remote.State=="CANCELED"&&invoice.SafeToRelease)payment.Observe("CANCELED",0,time.GetUtcNow());
            await RecordOrder(payment,s.Id.ToString(),ct);await db.SaveChangesAsync(ct);await UpdateEntry(payment,ct);
        }
        s.Observe(remote.State);await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
    }
    public async Task<bool> SubscriptionWebhook(byte[] body,CancellationToken ct)
    {
        // This product has a different webhook contract. The notification is only
        // a refresh hint: never use its amount/status/URLs as financial authority.
        using var json=JsonDocument.Parse(body);
        if(json.RootElement.ValueKind!=JsonValueKind.Object||!json.RootElement.TryGetProperty("resource",out var resource)||resource.ValueKind!=JsonValueKind.Object||!resource.TryGetProperty("id",out var id)||id.ValueKind!=JsonValueKind.String)return false;
        var providerId=id.GetString();
        // Plan/customer/refund events share this endpoint; they are not subscription IDs.
        if(providerId is null||!System.Text.RegularExpressions.Regex.IsMatch(providerId,"^SUBS_[A-Za-z0-9-]{1,80}$"))return false;
        var s=await db.Set<BillingSubscription>().SingleOrDefaultAsync(x=>x.ProviderId==providerId,ct);
        if(s is null&&resource.TryGetProperty("reference_id",out var reference)&&reference.ValueKind==JsonValueKind.String&&Guid.TryParse(reference.GetString(),out var local))
        {
            s=await db.Set<BillingSubscription>().SingleOrDefaultAsync(x=>x.Id==local,ct);if(s is null)return false;
            var remote=await recurring.Get(providerId!,ct);Validate(s,remote);
            await using var tx=await db.Database.BeginTransactionAsync(ct);await ArenaLock(ct);await db.Entry(s).ReloadAsync(ct);s.Bind(remote.Id);await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
        }
        // The durable provider binding is picked up by BillingWorker every minute,
        // including after restarts. Fetching every invoice here exceeds the provider's
        // callback timeout. Only authenticated reconciliation can change balances/state.
        return s is not null;
    }
}
