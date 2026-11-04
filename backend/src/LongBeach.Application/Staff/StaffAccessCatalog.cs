using LongBeach.Contracts.Staff;
using LongBeach.Domain.Identity;

namespace LongBeach.Application.Staff;

public static class StaffAccessCatalog
{
    public static readonly string[] TypeIds = ["bar", "professor", "atendente", "gestor"];
    private static readonly string[] Operations = ["atendente", "gestor"];
    private static readonly string[] Management = ["gestor"];
    private static readonly string[] Bar = ["bar", "atendente", "gestor"];
    private static readonly string[] Teaching = ["professor", "gestor"];
    public static readonly StaffMenuDefinition[] Menus = [
        new("bar.sell","Vender","Bar","/atendimento/vender",Bar), new("bar.tabs","Comandas","Bar","/atendimento/comandas",Bar),
        new("bar.orders","Pedidos","Bar","/atendimento/pedidos",Bar), new("bar.receive","Receber","Bar","/atendimento/receber",Bar), new("bar.cash","Meu caixa","Bar","/bar/caixa",Bar),
        new("teaching.today","Aulas de hoje","Minhas aulas","/professor",Teaching),new("teaching.classes","Minhas turmas","Minhas aulas","/professor/turmas",Teaching),new("teaching.attendance","Presenças","Minhas aulas","/professor/presencas",Teaching),
        new("overview","Visão geral","Arena","/",Operations),new("customers","Clientes","Arena","/clientes",Operations),
        new("messaging","Conversas","WhatsApp","/whatsapp",Operations),new("messaging.sends","Envios","WhatsApp","/whatsapp/envios",Operations),new("messaging.automation","Automação","WhatsApp","/whatsapp/automacao",Management),
        new("agenda","Agenda","Arena","/agenda",Operations),new("agenda.settings","Quadras e horários","Agenda","/agenda/funcionamento",Management),new("agenda.requests","Solicitações","Agenda","/solicitacoes-clientes",Operations),
        new("recurring","Mensalistas","Arena","/mensalistas",Operations),new("classes","Turmas","Aulas","/escola",Operations),new("students","Alunos","Aulas","/alunos",Operations),new("enrollments","Matrículas","Aulas","/escola/matriculas",Operations),new("presences","Presenças da escola","Aulas","/escola/presencas",Operations),
        new("materials","Materiais","Arena","/administracao/materiais",Operations),new("projects","Projetos","Arena","/projetos",Operations),new("maintenance","Manutenção","Arena","/manutencao",Operations),
        new("finance","Financeiro","Gestão","/financeiro",Management),new("stock","Estoque e compras","Gestão","/bar/produtos",Management),new("reports","Relatórios","Gestão","/bar/indicadores",Management),new("administration","Administração","Gestão","/importacoes",Management)
    ];
    public static readonly StaffActionDefinition[] Actions = Menus.Where(m=>!m.Id.StartsWith("teaching.",StringComparison.Ordinal)).SelectMany(m=>
        m.Id.StartsWith("bar.",StringComparison.Ordinal) ? new[]{new StaffActionDefinition(m.Id,m.Label,m.Id,m.TypeIds)} :
        m.Id is "overview" or "reports" ? [] : new[]{new StaffActionDefinition(m.Id+".operate","Alterar",m.Id,m.TypeIds)})
        .Concat([new("teaching.presence","Registrar presença","teaching.attendance",Teaching),new("bar.supervise","Supervisionar comandas e caixas","bar.tabs",Management),new("bar.refund","Estornar recebimentos","bar.receive",Management),
            new("customers.merge","Unificar clientes","customers",Management,["customers.operate"]),new("materials.adjust","Corrigir saldo de materiais","materials",Management,["materials.operate"]),new("stock.fiscal","Importar notas fiscais","stock",Management,["stock.operate"])])
        .ToArray();
    public static StaffAccessCatalogResponse Response() => new(Menus, Actions);
    public static string Role(string type) => type switch { "professor"=>SystemRoles.Teacher,"gestor"=>SystemRoles.Manager,"bar" or "atendente"=>SystemRoles.Operations,_=>throw new StaffAccessException("Tipo de acesso inválido.") };
    public static Guid Id(string type) => type switch {"bar"=>Guid.Parse("671612c0-e086-4bc1-92ed-000000000001"),"professor"=>Guid.Parse("671612c0-e086-4bc1-92ed-000000000002"),"atendente"=>Guid.Parse("671612c0-e086-4bc1-92ed-000000000003"),"gestor"=>Guid.Parse("671612c0-e086-4bc1-92ed-000000000004"),_=>throw new StaffAccessException("Tipo de acesso inválido.")};
    public static void Validate(string type, string[]? menus, string[]? actions)
    {
        _ = Role(type);
        if (menus is null || actions is null || menus.Length>80 || actions.Length>120 || menus.Distinct(StringComparer.Ordinal).Count()!=menus.Length || actions.Distinct(StringComparer.Ordinal).Count()!=actions.Length ||
            menus.Any(m=>!Menus.Any(x=>x.Id==m&&x.TypeIds.Contains(type))) || actions.Any(a=>!Actions.Any(x=>x.Id==a&&x.TypeIds.Contains(type))))
            throw new StaffAccessException("Escolha os menus e ações disponíveis para este tipo.");
        foreach(var a in actions.Select(id=>Actions.Single(x=>x.Id==id)))
        {
            if (!menus.Contains(a.MenuId))
                throw new StaffAccessException("Uma ação precisa do seu menu habilitado.");
            if(a.RequiresActions?.Any(required=>!actions.Contains(required)) is true)
                throw new StaffAccessException("Habilite a ação de alterar do mesmo menu antes de conceder esta operação administrativa.");
        }
        if(menus.Any(m=>m is "bar.sell" or "bar.orders" or "bar.receive" or "bar.cash" && !actions.Contains(m)))
            throw new StaffAccessException("Vender, Pedidos, Receber e Caixa exigem sua ação de atendimento habilitada.");
        if (menus.Length==0 || Home(menus,actions)=="/conta") throw new StaffAccessException("Escolha pelo menos uma área de consulta ou habilite sua ação de atendimento.");
    }
    public static StaffAccessType Default(string type)
    {
        var menus=Menus.Where(m=>m.TypeIds.Contains(type)).Select(m=>m.Id).ToArray();
        var actions=Actions.Where(a=>a.TypeIds.Contains(type)).Select(a=>a.Id).ToArray();
        return new(Id(type),type,type switch{"bar"=>"Bar","professor"=>"Professor","atendente"=>"Atendente",_=>"Gestor"},Role(type),menus,actions);
    }
    public static string Home(string[] menus,string[]? actions=null) => menus.Contains("overview") ? "/" : Menus.FirstOrDefault(m=>menus.Contains(m.Id) && (m.Id is not ("bar.sell" or "bar.orders" or "bar.receive" or "bar.cash") || actions?.Contains(m.Id) is true))?.Path ?? "/conta";
    public static string[] Permissions(StaffAccessType type)
    {
        Validate(type.Code,type.Menus,type.Actions);
        if(type.Role!=Role(type.Code))throw new StaffAccessException("Perfil incompatível com o tipo de acesso.");
        var p=new HashSet<string>(StringComparer.Ordinal);
        void Add(params string[] values){foreach(var v in values)p.Add(v);}
        foreach(var m in type.Menus)
        {
            bool write=type.Actions.Contains(m.StartsWith("bar.",StringComparison.Ordinal)?m:m+".operate");
            switch(m)
            {
                case "bar.sell":case "bar.tabs":case "bar.orders":case "bar.receive": Add(SystemPermissions.BarCatalogRead,SystemPermissions.BarSalesRead,SystemPermissions.BarCashOperate);if(write)Add(SystemPermissions.BarSalesOperate);break;
                case "bar.cash":Add(SystemPermissions.BarSalesRead,SystemPermissions.BarCashOperate);break;
                case "customers":Add(SystemPermissions.CustomersRead);if(write)Add(SystemPermissions.CustomersWrite);break;
                case "messaging":case "messaging.sends":Add(SystemPermissions.MessagingRead);if(write)Add(SystemPermissions.MessagingOperate);break;
                case "messaging.automation":Add(SystemPermissions.MessagingRead);if(write)Add(SystemPermissions.MessagingManage);break;
                case "agenda":case "agenda.settings":case "agenda.requests":case "recurring":Add(SystemPermissions.ProjectsRead,SystemPermissions.StudentsRead,SystemPermissions.EmployeesRead);if(write)Add(SystemPermissions.ProjectsWrite);if(m=="agenda.requests"&&write)Add(SystemPermissions.StudentsWrite);break;
                case "classes":case "students":case "enrollments":case "presences":Add(SystemPermissions.StudentsRead,SystemPermissions.EmployeesRead);if(m=="classes")Add(SystemPermissions.ProjectsRead);if(write)Add(SystemPermissions.StudentsWrite);break;
                case "materials":Add(SystemPermissions.InventoryRead);if(write)Add(SystemPermissions.InventoryWrite);break;
                case "projects":case "maintenance":Add(SystemPermissions.ProjectsRead);if(write)Add(SystemPermissions.ProjectsWrite);break;
                case "finance":Add(SystemPermissions.FinanceRead);if(write)Add(SystemPermissions.FinanceWrite);break;
                case "stock":Add(SystemPermissions.BarCatalogRead,SystemPermissions.BarCatalogWrite,SystemPermissions.BarStockRead,SystemPermissions.BarFinanceRead,SystemPermissions.BarPurchasesManage);if(write)Add(SystemPermissions.BarStockManage,SystemPermissions.BarStockOutput);break;
                case "reports":Add(SystemPermissions.FinanceRead,SystemPermissions.BarFinanceRead);break;
                case "administration":Add(SystemPermissions.EmployeesRead,SystemPermissions.AuditRead,SystemPermissions.UsersManage);break;
            }
        }
        if(type.Actions.Contains("bar.supervise"))Add(SystemPermissions.BarSupervise);
        if(type.Actions.Contains("bar.refund"))Add(SystemPermissions.BarRefundApprove);
        if(type.Actions.Contains("customers.merge"))Add(SystemPermissions.CustomersMerge);
        if(type.Actions.Contains("materials.adjust"))Add(SystemPermissions.InventoryAdjust);
        if(type.Actions.Contains("stock.fiscal"))Add(SystemPermissions.ReceivedInvoicesManage);
        return p.Intersect(ProfileAccess.Grants[type.Role],StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
    }
}
