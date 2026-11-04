using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using LongBeach.Application.Abstractions;
using LongBeach.Application.Operations;
using LongBeach.Application.Staff;
using LongBeach.Contracts.Staff;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Operations;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;

namespace LongBeach.Infrastructure.Auth;

public sealed class StaffAccessService(LongBeachDbContext db, IStaffAuthorization authorization, IPasswordHasher passwords,
    IOptions<StaffAccessOptions> options, TimeProvider clock) : IStaffAccess
{
    private IQueryable<User> Users() => db.Users.Include(u=>u.RefreshTokens).Include(u=>u.UserRoles).ThenInclude(r=>r.Role)
        .Include(u=>u.StaffMembership).ThenInclude(m=>m!.AccessType);
    private async Task<User> Owner(Guid actor, CancellationToken ct)
    {
        var user=await Users().SingleOrDefaultAsync(u=>u.Id==actor,ct);
        if(user is null || !authorization.IsOwner(user)) throw new StaffAccessException("Somente as contas dos donos podem administrar a equipe.",403);
        return user;
    }
    private async Task Lock(CancellationToken ct) { await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031904)",ct);await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(724031918)",ct); }
    private async Task Save(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); }
        catch(DbUpdateConcurrencyException) { throw new StaffAccessException("O cadastro ou o acesso foi alterado. Atualize antes de continuar.",409); }
        catch(DbUpdateException ex) when(ex.InnerException is PostgresException {SqlState:PostgresErrorCodes.UniqueViolation})
        { throw new StaffAccessException("O usuário, telefone ou vínculo já está em uso. Confira a ficha antes de continuar.",409); }
    }
    private static JsonElement Payload(OperationalRecord record) => JsonDocument.Parse(record.Payload).RootElement.Clone();
    private static string Hash<T>(T input)
    {
        using var doc=JsonDocument.Parse(JsonSerializer.Serialize(input));using var stream=new MemoryStream();using(var writer=new Utf8JsonWriter(stream)) Canonical(doc.RootElement,writer);
        return Convert.ToHexString(SHA256.HashData(stream.ToArray())).ToLowerInvariant();
    }
    private static void Canonical(JsonElement value,Utf8JsonWriter writer)
    {
        if(value.ValueKind==JsonValueKind.Object){writer.WriteStartObject();foreach(var p in value.EnumerateObject().OrderBy(p=>p.Name,StringComparer.Ordinal)){writer.WritePropertyName(p.Name);Canonical(p.Value,writer);}writer.WriteEndObject();}
        else if(value.ValueKind==JsonValueKind.Array){writer.WriteStartArray();foreach(var p in value.EnumerateArray())Canonical(p,writer);writer.WriteEndArray();}
        else value.WriteTo(writer);
    }
    private async Task<bool> Replayed(Guid id,Guid actor,Guid team,string kind,string hash,CancellationToken ct)
    {
        if(id==Guid.Empty)throw new StaffAccessException("Identifique esta operação antes de salvar.");
        var prior=await db.Set<StaffAccessOperation>().SingleOrDefaultAsync(x=>x.Id==id,ct);
        if(prior is null)return false;
        if(prior.ActorId!=actor||prior.TeamId!=team||prior.Kind!=kind||prior.RequestHash!=hash)
            throw new StaffAccessException("Esta operação já foi usada com outros dados. Atualize a ficha.",409);
        return true;
    }
    private static void Version(StaffMembership? member,int expected)
    { if(expected<0||(member?.Version??0)!=expected)throw new StaffAccessException("O acesso foi alterado. Atualize a ficha antes de salvar.",409); }
    private void Record(Guid id,Guid actor,Guid team,string kind,string hash)=>db.Add(new StaffAccessOperation(id,actor,team,kind,hash));
    private async Task<StaffAccessType> Type(string code,CancellationToken ct) => await db.Set<StaffAccessType>().SingleOrDefaultAsync(t=>t.Code==code,ct)
        ?? throw new StaffAccessException("Tipo de acesso não encontrado.",404);
    private static StaffAccessTypeSummary Summary(StaffAccessType type,int count)=>new(type.Code,type.Name,type.Role,type.Menus,type.Actions,count,type.Version);
    private StaffMemberAccessStatus Status(Guid team,User? user)=>new(team,user?.Id,user?.StaffMembership?.AccessType.Code,user?.PhoneLogin,user?.Username,
        user?.IsActive is true&&user.StaffMembership?.Enabled is true,user?.RequiresFirstAccess??false,user?.InitialAccessExpiresAtUtc,
        user?.GoogleSubject is not null,user?.LocalPasswordEnabled??false,user?.StaffMembership?.Version??0,user is not null&&options.Value.OwnerUserIds.Contains(user.Id));
    private async Task<User?> MemberUser(Guid team,CancellationToken ct)=>await Users().SingleOrDefaultAsync(u=>u.StaffMembership!=null&&u.StaffMembership.TeamId==team,ct);
    private async Task<StaffMemberResult> Result(Guid actor,Guid team,CancellationToken ct,string? password=null,DateTimeOffset? expires=null)
    {
        var row=await db.OperationalRecords.SingleOrDefaultAsync(r=>r.Id==team&&r.Kind=="team",ct)??throw new StaffAccessException("Pessoa da equipe não encontrada.",404);
        var actorUser=await Users().SingleAsync(u=>u.Id==actor,ct);
        var financeRead=authorization.Resolve(actorUser).Permissions.Contains(SystemPermissions.FinanceRead);
        var visible=JsonDocument.Parse(OperationalRecordAccess.VisiblePayload(row.Payload,"team",financeRead)).RootElement.Clone();
        return new(visible,Status(team,await MemberUser(team,ct)),password,expires);
    }
    public async Task<StaffAccessContext> ContextAsync(Guid actorId,CancellationToken ct=default)
    {
        await Owner(actorId,ct);var users=await Users().OrderBy(u=>u.Name).ToListAsync(ct);
        var team=await db.OperationalRecords.Where(r=>r.Kind=="team").OrderBy(r=>r.Name).ToListAsync(ct);
        var teacherLinks=await db.OperationalRecords.Where(r=>r.Kind=="teacherLinks").ToListAsync(ct);
        Guid? LegacyTeacher(User user)
        {
            var links=teacherLinks.Select(Payload).Where(p=>Guid.TryParse(OperationalValidation.Text(p,"userId"),out var id)&&id==user.Id).ToArray();
            return links.Length==1&&Guid.TryParse(OperationalValidation.Text(links[0],"teamId"),out var teamId)&&teamId!=Guid.Empty?teamId:null;
        }
        var types=await db.Set<StaffAccessType>().OrderBy(t=>t.Name).ToListAsync(ct);
        return new(types.Select(t=>Summary(t,users.Count(u=>u.StaffMembership?.AccessTypeId==t.Id))).ToArray(),StaffAccessCatalog.Response(),
            team.Select(t=>Status(t.Id,users.SingleOrDefault(u=>u.StaffMembership?.TeamId==t.Id))).ToArray(),
            users.Where(u=>ProfileAccess.HasValidProfile(u.GetRoleNames())&&u.GetRoleNames().Single()!=SystemRoles.Student).Select(u=>new StaffAccountChoice(u.Id,u.Name,u.Username,u.PhoneLogin,u.GetRoleNames().Single(),u.IsActive,u.GoogleSubject is not null,u.LocalPasswordEnabled,u.StaffMembership?.TeamId??LegacyTeacher(u))).ToArray());
    }
    public async Task<StaffAccessTypeSummary[]> TypesAsync(Guid actorId,CancellationToken ct=default)=>(await ContextAsync(actorId,ct)).Types;
    public async Task<StaffMemberAccessStatus> MemberAsync(Guid actorId,Guid teamId,CancellationToken ct=default)
    { await Owner(actorId,ct);return (await Result(actorId,teamId,ct)).Access; }
    public async Task<StaffAccessTypeSummary> SaveTypeAsync(Guid actorId,string typeId,StaffAccessTypeInput input,CancellationToken ct=default)
    {
        await using var tx=await db.Database.BeginTransactionAsync(ct);await Lock(ct);await Owner(actorId,ct);
        StaffAccessCatalog.Validate(typeId,input.Menus,input.Actions);var type=await Type(typeId,ct);
        if(type.Version!=input.Version)throw new StaffAccessException("O tipo de acesso foi alterado. Atualize antes de salvar.",409);
        if(string.IsNullOrWhiteSpace(input.Name)||input.Name.Trim().Length>80)throw new StaffAccessException("Informe um nome de até 80 caracteres.");
        type.Update(input.Name,input.Menus,input.Actions);var affected=await Users().Where(u=>u.StaffMembership!=null&&u.StaffMembership.AccessTypeId==type.Id).ToListAsync(ct);
        foreach(var user in affected){user.InvalidateCredentials(clock.GetUtcNow(),null,"Staff access type changed");user.StaffMembership!.Touch();}
        await Save(ct);await tx.CommitAsync(ct);return Summary(type,affected.Count);
    }
    private async Task LastOwner(User user,bool active,string role,bool firstAccess,CancellationToken ct)
    {
        if(!options.Value.OwnerUserIds.Contains(user.Id)||active&&role==SystemRoles.Manager&&!firstAccess)return;
        var candidates=await Users().Where(u=>options.Value.OwnerUserIds.Contains(u.Id)&&u.Id!=user.Id).ToListAsync(ct);
        if(!candidates.Any(authorization.IsOwner))throw new StaffAccessException("Mantenha pelo menos um dono ativo com o primeiro acesso concluído.",409);
    }
    private static string Secret()=>"Aa1!"+Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)).Replace('+','x').Replace('/','y').TrimEnd('=');
    private async Task Login(User user,StaffMemberAccessInput input,CancellationToken ct)
    {
        var suppliedPhone=input.PhoneLogin??user.PhoneLogin;
        var phone=User.NormalizePhoneLogin(suppliedPhone);
        if(phone is not null&&await db.Users.AnyAsync(u=>u.Id!=user.Id&&u.PhoneLogin==phone,ct))throw new StaffAccessException("Este telefone de acesso já pertence a outra conta. Confira o vínculo.",409);
        if(phone is not null)
        {
            var legacyUsernames=await db.Users.Where(u=>u.Id!=user.Id&&u.Username!=null).Select(u=>u.Username).ToArrayAsync(ct);
            static string? AsPhone(string? value){try{return User.NormalizePhoneLogin(value);}catch(ArgumentException){return null;}}
            if(legacyUsernames.Any(username=>AsPhone(username)==phone))throw new StaffAccessException("Este telefone coincide com um usuário já existente. Confira a conta antes de vincular.",409);
        }
        if(!string.IsNullOrWhiteSpace(input.Username))
        {
            var normalized=User.NormalizeEmail(input.Username);
            if(await db.Users.AnyAsync(u=>u.Id!=user.Id&&u.NormalizedUsername==normalized,ct))throw new StaffAccessException("Este usuário já pertence a outra conta.",409);
            user.SetUsername(input.Username);
        }
        user.SetPhoneLogin(suppliedPhone);
        if(user.Username is null&&user.PhoneLogin is null&&user.Email.EndsWith("@unlinked.longbeach.invalid",StringComparison.Ordinal))throw new StaffAccessException("Informe o telefone de acesso ou um usuário.");
    }
    private static void ValidateMember(Guid id,JsonElement body)
    {
        var error=OperationalValidation.Validate("team",id,body,new Dictionary<string,JsonElement[]>(),DateOnly.MinValue);
        if(error is not null)throw new StaffAccessException(error);
        if(OperationalValidation.Text(body,"name").Trim().Length>160)throw new StaffAccessException("Use um nome de até 160 caracteres.");
        if(OperationalValidation.Text(body,"status") is not("Ativo" or "Inativo" or "A confirmar"))throw new StaffAccessException("Confira a situação da pessoa da equipe.");
        var accessKeys=new HashSet<string>(["userId","account","phoneLogin","username","roles","permissions","access","accessTypeId","typeId","googleSubject","googleEmail","canManageStaff","isOwner","requiresFirstAccess","requiresLocalPasswordChange","localPasswordEnabled","staffAccess","staffMembership","initialAccessExpiresAtUtc","credentialVersion","refreshTokens"],StringComparer.OrdinalIgnoreCase);
        foreach(var key in body.EnumerateObject().Select(p=>p.Name))
            if(key.Contains("password",StringComparison.OrdinalIgnoreCase)||key.Contains("secret",StringComparison.OrdinalIgnoreCase)||key.Contains("token",StringComparison.OrdinalIgnoreCase)||accessKeys.Contains(key))
                throw new StaffAccessException("Informe o acesso somente na seção própria da conta.");
    }
    public async Task<StaffMemberResult> SaveMemberAsync(Guid actorId,Guid teamId,StaffMemberInput input,CancellationToken ct=default)
    {
        if(input.Access is null)throw new StaffAccessException("Confira a seção de acesso.");
        if(input.Member.ValueKind!=JsonValueKind.Object)throw new StaffAccessException("Confira o cadastro da pessoa da equipe.");
        await using var tx=await db.Database.BeginTransactionAsync(ct);await Lock(ct);var actor=await Owner(actorId,ct);var hash=Hash(input);
        if(await Replayed(input.OperationId,actorId,teamId,"Save",hash,ct))return await Result(actorId,teamId,ct);
        if(teamId==Guid.Empty)throw new StaffAccessException("Escolha uma pessoa da equipe válida.");
        var row=await db.OperationalRecords.SingleOrDefaultAsync(r=>r.Id==teamId&&r.Kind=="team",ct);
        var actorPermissions=authorization.Resolve(actor).Permissions;
        var prepared=OperationalRecordAccess.PrepareWrite(input.Member.GetRawText(),row?.Payload,"team",actorPermissions.Contains(SystemPermissions.FinanceRead),actorPermissions.Contains(SystemPermissions.FinanceWrite));
        if(!prepared.Allowed)throw new StaffAccessException("Seu acesso não permite alterar os dados financeiros da equipe.",403);
        var memberBody=JsonDocument.Parse(prepared.Body.ToJsonString()).RootElement.Clone();ValidateMember(teamId,memberBody);
        var recordVersion=row is null?0:OperationalValidation.Version(Payload(row));
        if(OperationalValidation.Version(memberBody)!=recordVersion)throw new StaffAccessException("O cadastro da equipe foi alterado. Atualize antes de salvar.",409);
        var user=await MemberUser(teamId,ct);Version(user?.StaffMembership,input.Access.Version);
        var mode=input.Access.Mode;if(mode is not("create" or "link" or "keep" or "none"))throw new StaffAccessException("Escolha como vincular a conta.");
        string? secret=null;DateTimeOffset? expires=null;var credentialChange=false;
        if(mode=="none")
        {
            if(row is null)throw new StaffAccessException("Crie ou vincule uma conta individual para a nova pessoa da equipe.");
            if(user is not null)throw new StaffAccessException("Bloqueie o acesso existente sem remover o vínculo.",409);
        }
        else
        {
            var type=await Type(input.Access.TypeId,ct);
            if(mode=="create")
            {
                if(user is not null)throw new StaffAccessException("Esta pessoa já tem uma conta vinculada.",409);
                secret=Secret();expires=clock.GetUtcNow().AddHours(24);
                user=User.CreateForStaffFirstAccess(OperationalValidation.Text(memberBody,"name"),input.Access.Username,input.Access.PhoneLogin,passwords.Hash(secret),expires.Value);
                var role=await db.Roles.SingleOrDefaultAsync(r=>r.Name==type.Role,ct)??throw new StaffAccessException("Perfil indisponível. Confira a configuração.",409);user.AssignRole(role);db.Users.Add(user);credentialChange=true;
            }
            else if(mode=="link")
            {
                if(user is not null)throw new StaffAccessException("A ficha já está vinculada. Use a manutenção do acesso.",409);
                user=await Users().SingleOrDefaultAsync(u=>u.Id==input.Access.UserId,ct)??throw new StaffAccessException("Escolha uma conta existente.");
                if(user.StaffMembership is not null||!user.IsActive||!user.GetRoleNames().SequenceEqual([type.Role]))throw new StaffAccessException("A conta escolhida possui outro vínculo ou perfil. Confira a identidade e o acesso antes de vincular.",409);
                credentialChange=true;
            }
            else if(user is null)throw new StaffAccessException("Esta ficha ainda não tem uma conta vinculada.",409);
            if(options.Value.OwnerUserIds.Contains(user!.Id)&&type.Role!=SystemRoles.Manager)throw new StaffAccessException("As contas administrativas dos donos não podem mudar de perfil neste cadastro.",409);
            var previousPhone=user.PhoneLogin;var previousUsername=user.Username;await Login(user,input.Access,ct);
            credentialChange|=previousPhone!=user.PhoneLogin||previousUsername!=user.Username;
            if(!user.GetRoleNames().SequenceEqual([type.Role])){user.SetRole(await db.Roles.SingleAsync(r=>r.Name==type.Role,ct));credentialChange=true;}
            var member=user.StaffMembership;
            if(member is null){member=new(user.Id,teamId,type);user.AttachStaffMembership(member);db.Add(member);}
            else {credentialChange|=member.AccessTypeId!=type.Id;member.SetType(type);}
            var active=OperationalValidation.Text(memberBody,"status")!="Inativo";
            await LastOwner(user,active,type.Role,user.RequiresFirstAccess,ct);
            credentialChange|=user.IsActive!=active||member.Enabled!=active;member.SetEnabled(active);
            if(active)user.Activate();else user.Deactivate();
            if(credentialChange)user.InvalidateCredentials(clock.GetUtcNow(),null,"Staff access changed");
        }
        var data=JsonNode.Parse(memberBody.GetRawText())!.AsObject();var name=OperationalValidation.Text(memberBody,"name").Trim();data["name"]=name;data["version"]=recordVersion+1;
        if(row is null){row=new(teamId,"team",name,data.ToJsonString());db.Add(row);}else row.Update(name,data.ToJsonString());
        if(user is not null)await TeacherLink(user,teamId,user.StaffMembership!.AccessType.Role==SystemRoles.Teacher,ct);
        Record(input.OperationId,actorId,teamId,"Save",hash);await Save(ct);await tx.CommitAsync(ct);return await Result(actorId,teamId,ct,secret,expires);
    }
    private async Task TeacherLink(User user,Guid team,bool teacher,CancellationToken ct)
    {
        var links=await db.OperationalRecords.Where(r=>r.Kind=="teacherLinks").ToListAsync(ct);
        static Guid Value(OperationalRecord row,string key)=>Guid.TryParse(OperationalValidation.Text(Payload(row),key),out var id)?id:Guid.Empty;
        var mine=links.Where(r=>Value(r,"userId")==user.Id).ToArray();
        if(mine.Length>1||teacher&&links.Any(r=>Value(r,"userId")!=user.Id&&Value(r,"teamId")==team))throw new StaffAccessException("Há um vínculo de professor em conflito. Confira os registros existentes.",409);
        if(teacher&&mine.Any(r=>Value(r,"teamId")!=Guid.Empty&&Value(r,"teamId")!=team))
            throw new StaffAccessException("Esta conta de professor já está ligada a outra ficha. Confira a identidade antes de vincular.",409);
        if(!teacher&&mine.Length==0)return;
        var row=mine.SingleOrDefault();var id=row?.Id??Guid.NewGuid();var payload=JsonSerializer.Serialize(new{id,userId=user.Id,teamId=teacher?(Guid?)team:null});
        if(row is null)db.Add(new OperationalRecord(id,"teacherLinks","Vínculo de professor",payload));else row.Update("Vínculo de professor",payload);
    }
    public async Task<StaffMemberResult> ResetAsync(Guid actorId,Guid teamId,StaffMemberCommand input,CancellationToken ct=default)
    {
        await using var tx=await db.Database.BeginTransactionAsync(ct);await Lock(ct);await Owner(actorId,ct);var hash=Hash(input);
        if(await Replayed(input.OperationId,actorId,teamId,"Reset",hash,ct))return await Result(actorId,teamId,ct);
        var user=await MemberUser(teamId,ct)??throw new StaffAccessException("Esta ficha ainda não tem conta.",404);Version(user.StaffMembership,input.Version);
        if(!user.IsActive||!user.StaffMembership!.Enabled)throw new StaffAccessException("Reative a conta antes de emitir um novo primeiro acesso.",409);
        await LastOwner(user,true,user.GetRoleNames().Single(),true,ct);
        var secret=Secret();var expiry=clock.GetUtcNow().AddHours(24);user.RequireLocalFirstAccess(passwords.Hash(secret),expiry);user.InvalidateCredentials(clock.GetUtcNow(),null,"Staff initial access reissued");user.StaffMembership.Touch();
        Record(input.OperationId,actorId,teamId,"Reset",hash);await Save(ct);await tx.CommitAsync(ct);return await Result(actorId,teamId,ct,secret,expiry);
    }
    private async Task<StaffMemberAccessStatus> Active(Guid actor,Guid team,StaffMemberCommand input,bool active,CancellationToken ct)
    {
        await using var tx=await db.Database.BeginTransactionAsync(ct);await Lock(ct);await Owner(actor,ct);var kind=active?"Reactivate":"Block";var hash=Hash(input);
        if(await Replayed(input.OperationId,actor,team,kind,hash,ct))return (await Result(actor,team,ct)).Access;
        var user=await MemberUser(team,ct)??throw new StaffAccessException("Esta ficha ainda não tem conta.",404);Version(user.StaffMembership,input.Version);await LastOwner(user,active,user.GetRoleNames().Single(),user.RequiresFirstAccess,ct);
        if(active)user.Activate();else user.Deactivate();user.StaffMembership!.SetEnabled(active);user.InvalidateCredentials(clock.GetUtcNow(),null,active?"Staff access reactivated":"Staff access blocked");
        var row=await db.OperationalRecords.SingleAsync(r=>r.Id==team&&r.Kind=="team",ct);var payload=JsonNode.Parse(row.Payload)!.AsObject();payload["status"]=active?"Ativo":"Inativo";payload["version"]=OperationalValidation.Version(Payload(row))+1;row.Update(row.Name,payload.ToJsonString());
        Record(input.OperationId,actor,team,kind,hash);await Save(ct);await tx.CommitAsync(ct);return Status(team,user);
    }
    public Task<StaffMemberAccessStatus> BlockAsync(Guid actorId,Guid teamId,StaffMemberCommand input,CancellationToken ct=default)=>Active(actorId,teamId,input,false,ct);
    public Task<StaffMemberAccessStatus> ReactivateAsync(Guid actorId,Guid teamId,StaffMemberCommand input,CancellationToken ct=default)=>Active(actorId,teamId,input,true,ct);
}
