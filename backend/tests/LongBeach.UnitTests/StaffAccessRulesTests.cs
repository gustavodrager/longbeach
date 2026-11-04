using LongBeach.Application.Abstractions;
using LongBeach.Application.Auth;
using LongBeach.Application.Staff;
using LongBeach.Domain.Identity;
using LongBeach.Infrastructure.Auth;
using Microsoft.Extensions.Options;

namespace LongBeach.UnitTests;

public sealed class StaffAccessRulesTests
{
    private static readonly DateTimeOffset Now=new(2026,11,4,12,0,0,TimeSpan.Zero);
    private static StaffAuthorization Resolver(params Guid[] owners)=>new(Options.Create(new StaffAccessOptions{OwnerUserIds=owners}));
    private static User Managed(string type)
    {
        var user=User.Create("Pessoa de teste","staff@example.test","hash");var template=StaffAccessCatalog.Default(type);
        user.AssignRole(new Role(template.Role));user.AttachStaffMembership(new(user.Id,Guid.NewGuid(),template));return user;
    }
    [Theory]
    [InlineData("(11) 99999-0000","+5511999990000")]
    [InlineData("11999990000","+5511999990000")]
    [InlineData("+55 (11) 99999-0000","+5511999990000")]
    [InlineData("5511999990000","+5511999990000")]
    [InlineData("(11) 3333-4444","+551133334444")]
    [InlineData("+1 212 555 0100","+12125550100")]
    public void Phone_login_uses_one_canonical_identity(string value,string expected)=>Assert.Equal(expected,User.NormalizePhoneLogin(value));
    [Theory]
    [InlineData("ligar depois")][InlineData("12345")][InlineData("+00000000000")][InlineData("+55abc11999990000")][InlineData("1234567890123456")]
    public void Invalid_contact_text_is_not_a_phone_login(string value)=>Assert.Throws<ArgumentException>(()=>User.NormalizePhoneLogin(value));
    [Fact]
    public void Blank_phone_is_optional_and_does_not_change_contact_or_username()
    {
        var user=User.Create("Pessoa","person@example.test","hash");user.SetUsername("pessoa.teste");user.SetPhoneLogin("11999990000");user.SetPhoneLogin(null);
        Assert.Null(user.PhoneLogin);Assert.Equal("pessoa.teste",user.Username);Assert.Equal("person@example.test",user.Email);
    }
    [Fact]
    public void Phone_login_does_not_relax_existing_username_rules()
    {
        var user=User.Create("Pessoa","person@example.test","hash");
        Assert.Throws<ArgumentException>(()=>user.SetUsername("11999990000"));
        user.SetPhoneLogin("11999990000");Assert.Equal("+5511999990000",user.PhoneLogin);
    }
    [Fact]
    public void Inconsistent_stored_type_and_profile_fail_closed()
    {
        var type=new StaffAccessType(Guid.NewGuid(),"bar","Bar",SystemRoles.Manager,["bar.tabs"],[]);
        Assert.Throws<StaffAccessException>(()=>StaffAccessCatalog.Permissions(type));
    }
    [Fact]
    public void Classes_calendar_can_read_occupancy_without_reservation_or_finance_writes()
    {
        var type=new StaffAccessType(Guid.NewGuid(),"atendente","Turmas",SystemRoles.Operations,["classes"],["classes.operate"]);
        var permissions=StaffAccessCatalog.Permissions(type);
        Assert.Contains(SystemPermissions.ProjectsRead,permissions);Assert.Contains(SystemPermissions.StudentsWrite,permissions);
        Assert.DoesNotContain(SystemPermissions.ProjectsWrite,permissions);Assert.DoesNotContain(SystemPermissions.FinanceRead,permissions);
        Assert.DoesNotContain(SystemPermissions.FinanceWrite,permissions);
    }
    [Fact]
    public void Stock_consultation_has_legacy_read_dependencies_without_adjustment_grants()
    {
        var type=new StaffAccessType(Guid.NewGuid(),"gestor","Consulta de estoque",SystemRoles.Manager,["stock"],[]);
        var permissions=StaffAccessCatalog.Permissions(type);
        Assert.Contains(SystemPermissions.BarCatalogWrite,permissions);Assert.Contains(SystemPermissions.BarPurchasesManage,permissions);
        Assert.DoesNotContain(SystemPermissions.BarStockManage,permissions);Assert.DoesNotContain(SystemPermissions.BarStockOutput,permissions);
        Assert.DoesNotContain(SystemPermissions.ReceivedInvoicesManage,permissions);Assert.DoesNotContain(SystemPermissions.BarSupervise,permissions);
    }
    [Fact]
    public void Only_explicit_account_identity_confers_owner_authority()
    {
        var user=Managed("gestor");Assert.False(Resolver().Resolve(user).CanManageStaff);
        Assert.False(Resolver(Guid.NewGuid()).Resolve(user).CanManageStaff);Assert.True(Resolver(user.Id).Resolve(user).CanManageStaff);
        user.Deactivate();Assert.False(Resolver(user.Id).Resolve(user).CanManageStaff);
    }
    [Fact]
    public void Owner_authority_cannot_be_removed_by_an_editable_type_menu()
    {
        var user=Managed("gestor");user.StaffMembership!.AccessType.Update("Financeiro",["finance"],["finance.operate"]);
        var access=Resolver(user.Id).Resolve(user);Assert.True(access.CanManageStaff);
        Assert.Contains(SystemPermissions.EmployeesRead,access.Permissions);Assert.Contains(SystemPermissions.EmployeesWrite,access.Permissions);
    }
    [Fact]
    public void A_blocked_or_unusable_owner_is_not_counted_as_an_administrator()
    {
        var user=Managed("gestor");user.StaffMembership!.SetEnabled(false);Assert.False(Resolver(user.Id).IsOwner(user));
        user.StaffMembership.SetEnabled(true);user.DisableLocalPassword("destroyed-temporary-hash");Assert.False(Resolver(user.Id).IsOwner(user));
        user.LinkGoogle("verified-subject","owner@example.test");Assert.True(Resolver(user.Id).IsOwner(user));
    }
    [Fact]
    public void Google_bootstrap_also_cannot_complete_new_staff_password_setup()
    {
        var user=User.CreateForStaffFirstAccess("Pessoa",null,"11999990000","hash",Now.AddHours(24));
        Assert.Throws<InvalidOperationException>(()=>user.PrepareGoogleAccess("owner@example.test","newhash"));
        Assert.True(user.RequiresFirstAccess);Assert.True(user.RequiresLocalPasswordChange);Assert.True(user.LocalPasswordEnabled);Assert.Null(user.GoogleSubject);
    }
    [Fact]
    public void Bar_is_scoped_without_manager_financial_or_supervision_grants()
    {
        var user=Managed("bar");var access=Resolver().Resolve(user);
        Assert.Equal(SystemRoles.Operations,user.GetRoleNames().Single());Assert.Equal("bar",access.StaffAccess!.TypeId);
        Assert.Equal("/atendimento/vender",access.StaffAccess.HomePath);Assert.Contains(SystemPermissions.BarSalesOperate,access.Permissions);
        Assert.DoesNotContain(SystemPermissions.CustomersRead,access.Permissions);Assert.DoesNotContain(SystemPermissions.StudentsRead,access.Permissions);
        Assert.DoesNotContain(SystemPermissions.BarSupervise,access.Permissions);Assert.DoesNotContain(SystemPermissions.BarRefundApprove,access.Permissions);
        Assert.DoesNotContain(SystemPermissions.FinanceRead,access.Permissions);Assert.DoesNotContain(SystemPermissions.BarCatalogWrite,access.Permissions);
        Assert.DoesNotContain(SystemPermissions.BarPurchasesManage,access.Permissions);Assert.DoesNotContain(SystemPermissions.BarStockOutput,access.Permissions);
    }
    [Fact]
    public void Professor_never_gets_general_student_permissions()
    {
        var access=Resolver().Resolve(Managed("professor"));Assert.Empty(access.Permissions);
        Assert.Equal("/professor",access.StaffAccess!.HomePath);Assert.All(access.StaffAccess.Menus,x=>Assert.StartsWith("teaching.",x));
        Assert.Contains("teaching.presence",access.StaffAccess.Actions);
    }
    [Fact]
    public void A_legacy_non_staff_account_keeps_its_profile_permissions()
    {
        var user=User.Create("Cliente","client@example.test","hash");user.AssignRole(new Role(SystemRoles.Student));
        var access=Resolver().Resolve(user);Assert.Null(access.StaffAccess);Assert.Empty(access.Permissions);Assert.False(access.CanManageStaff);
    }
    [Fact]
    public void Type_cannot_expand_its_profile_or_invent_authorization()
    {
        Assert.Throws<StaffAccessException>(()=>StaffAccessCatalog.Validate("bar",["finance"],["finance.operate"]));
        Assert.Throws<StaffAccessException>(()=>StaffAccessCatalog.Validate("bar",["bar.tabs"],["bar.supervise"]));
        Assert.Throws<StaffAccessException>(()=>StaffAccessCatalog.Validate("professor",["students"],["students.operate"]));
        Assert.Throws<StaffAccessException>(()=>StaffAccessCatalog.Validate("gestor",["administration"],["owners:grant"]));
    }
    [Fact]
    public void An_action_requires_its_menu_and_a_type_requires_an_accessible_area()
    {
        Assert.Throws<StaffAccessException>(()=>StaffAccessCatalog.Validate("bar",["bar.tabs"],["bar.receive"]));
        Assert.Throws<StaffAccessException>(()=>StaffAccessCatalog.Validate("bar",["bar.sell"],[]));
        Assert.Throws<StaffAccessException>(()=>StaffAccessCatalog.Validate("bar",["bar.sell","bar.tabs"],[]));
        Assert.Throws<StaffAccessException>(()=>StaffAccessCatalog.Validate("bar",[],[]));
        StaffAccessCatalog.Validate("bar",["bar.tabs"],[]);
        Assert.Equal("/atendimento/comandas",StaffAccessCatalog.Home(["bar.sell","bar.tabs"],[]));
    }
    [Fact]
    public void Operational_templates_keep_required_arena_permission_dependencies()
    {
        var type=StaffAccessCatalog.Default("atendente");var grants=StaffAccessCatalog.Permissions(type);
        Assert.Contains(SystemPermissions.ProjectsRead,grants);Assert.Contains(SystemPermissions.ProjectsWrite,grants);
        Assert.Contains(SystemPermissions.StudentsRead,grants);Assert.Contains(SystemPermissions.StudentsWrite,grants);
        Assert.Equal("/",StaffAccessCatalog.Home(type.Menus,type.Actions));
    }
    [Fact]
    public void Gestor_keeps_business_administration_without_obtaining_staff_owner_authority()
    {
        var type=StaffAccessCatalog.Default("gestor");var grants=StaffAccessCatalog.Permissions(type);
        Assert.Equal(SystemPermissions.All.Where(p=>p!=SystemPermissions.EmployeesWrite).Order(StringComparer.Ordinal),grants.Order(StringComparer.Ordinal));
        Assert.False(Resolver().Resolve(Managed("gestor")).CanManageStaff);
        Assert.Throws<StaffAccessException>(()=>StaffAccessCatalog.Validate("gestor",["customers"],["customers.merge"]));
        Assert.Throws<StaffAccessException>(()=>StaffAccessCatalog.Validate("gestor",["materials"],["materials.adjust"]));
        Assert.Throws<StaffAccessException>(()=>StaffAccessCatalog.Validate("gestor",["stock"],["stock.fiscal"]));
    }
    [Fact]
    public async Task New_staff_phone_login_has_a_restricted_first_access_and_google_cannot_skip_password()
    {
        var user=User.CreateForStaffFirstAccess("Pessoa",null,"11999990000","hash:Temporary#Only2026",Now.AddHours(24));
        var type=StaffAccessCatalog.Default("bar");user.AssignRole(new Role(type.Role));user.AttachStaffMembership(new(user.Id,Guid.NewGuid(),type));
        var tokens=new Tokens();var service=new AuthService(new Users(user),new Hasher(),tokens,new FixedClock(),Resolver());
        var session=await service.LoginAsync("(11) 99999-0000","Temporary#Only2026",null);
        Assert.Equal(user.Id,session.Response.User.Id);Assert.Equal("+5511999990000",session.Response.User.PhoneLogin);
        Assert.True(session.Response.User.RequiresFirstAccess);Assert.True(session.Response.User.RequiresLocalPasswordChange);Assert.Empty(session.Response.User.Roles);Assert.Empty(session.Response.User.Permissions);
        await Assert.ThrowsAsync<AuthenticationFailedException>(()=>service.CompleteFirstAccessWithGoogleAsync(user.Id,"subject","other@example.test",null));
        Assert.Null(user.GoogleSubject);Assert.True(user.RequiresLocalPasswordChange);
        await service.ChangePasswordAsync(user.Id,"Temporary#Only2026","Definitiva#Segura2026",null);
        Assert.False(user.RequiresFirstAccess);Assert.False(user.RequiresLocalPasswordChange);Assert.All(user.RefreshTokens,t=>Assert.NotNull(t.RevokedAtUtc));
        await Assert.ThrowsAsync<AuthenticationFailedException>(()=>service.LoginAsync("11999990000","Temporary#Only2026",null));
        session=await service.LoginAsync("+55 11 99999-0000","Definitiva#Segura2026",null);
        Assert.Equal("bar",session.Response.User.StaffAccess!.TypeId);Assert.Contains(SystemPermissions.BarSalesOperate,session.Response.User.Permissions);
    }
    private sealed class FixedClock:TimeProvider { public override DateTimeOffset GetUtcNow()=>Now; }
    private sealed class Hasher:IPasswordHasher
    {public string DummyHash=>"hash:dummy";public string Hash(string password)=>"hash:"+password;public PasswordHashVerificationResult Verify(string password,string encodedHash)=>encodedHash==Hash(password)?PasswordHashVerificationResult.Success:PasswordHashVerificationResult.Failed;}
    private sealed class Tokens:ITokenService
    {
        public IssuedTokenPair Issue(TokenPrincipal p,DateTimeOffset now)=>new("access",now.AddMinutes(15),"refresh",Guid.NewGuid().ToString(),"csrf","csrfhash",Guid.NewGuid(),now.AddDays(3));
        public string HashRefreshToken(string value)=>value;public string HashCsrfToken(string value)=>value;
    }
    private sealed class Users(User user):IUserRepository
    {
        public Task<User?> FindByIdAsync(Guid id,CancellationToken ct=default)=>Task.FromResult<User?>(id==user.Id?user:null);
        public Task<User?> FindByEmailAsync(string email,CancellationToken ct=default)=>Task.FromResult<User?>(email==user.NormalizedEmail?user:null);
        public Task<User?> FindByUsernameAsync(string username,CancellationToken ct=default)=>Task.FromResult<User?>(username==user.NormalizedUsername?user:null);
        public Task<User?> FindByPhoneLoginAsync(string phone,CancellationToken ct=default)=>Task.FromResult<User?>(phone==user.PhoneLogin?user:null);
        public Task<User?> FindByGoogleSubjectAsync(string subject,CancellationToken ct=default)=>Task.FromResult<User?>(subject==user.GoogleSubject?user:null);
        public Task<User?> FindByRefreshTokenHashAsync(string hash,CancellationToken ct=default)=>Task.FromResult<User?>(null);
        public Task AddAsync(User value,CancellationToken ct=default)=>Task.CompletedTask;public Task SaveChangesAsync(CancellationToken ct=default)=>Task.CompletedTask;
    }
}
