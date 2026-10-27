using Microsoft.Extensions.Hosting;

namespace LongBeach.Infrastructure.C6;

public sealed class C6Options
{
    public const string SectionName = "Integrations:C6";
    public bool Enabled { get; set; }
    public bool BankingEnabled { get; set; }
    public bool PixEnabled { get; set; }
    public string Environment { get; set; } = "Sandbox";
    public string AccountId { get; set; } = "";
    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    public string CertificatePath { get; set; } = "";
    public string CertificatePassword { get; set; } = "";
    public string CertificateKeyPath { get; set; } = "";
    public string PixKey { get; set; } = "";
    public int TimeoutSeconds { get; set; } = 30;

    public IReadOnlyList<string> ConfigurationProblems(IHostEnvironment hostEnvironment)
    {
        var problems = new List<string>();
        if (Environment is not ("Sandbox" or "Production")) problems.Add("Selecione o ambiente C6 Sandbox ou Production.");
        else if ((Environment == "Production") != hostEnvironment.IsProduction()) problems.Add("O ambiente C6 deve corresponder ao ambiente da aplicação; produção não pode usar sandbox e homologação não pode usar produção.");
        if (string.IsNullOrWhiteSpace(AccountId) || AccountId.Length > 80 || AccountId.Any(char.IsControl) || AccountId != AccountId.Trim()) problems.Add("Configure a identificação interna da conta C6.");
        if (string.IsNullOrWhiteSpace(ClientId) || string.IsNullOrWhiteSpace(ClientSecret)) problems.Add("Configure as credenciais C6 no servidor.");
        if (string.IsNullOrWhiteSpace(CertificatePath)) problems.Add("Configure o certificado mTLS C6 no servidor.");
        if (PixEnabled && (string.IsNullOrWhiteSpace(PixKey) || PixKey.Length > 77 || PixKey.Any(char.IsControl))) problems.Add("Configure a chave Pix C6 no servidor.");
        if (TimeoutSeconds is < 1 or > 120) problems.Add("O tempo limite C6 deve estar entre 1 e 120 segundos.");
        return problems;
    }
}
