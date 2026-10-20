using System.Security.Cryptography;
using LongBeach.Contracts.Finance;
using Microsoft.Extensions.Configuration;

namespace LongBeach.Infrastructure.Payments;

public static class PaymentIntegrationDiagnostics
{
    public static IReadOnlyList<IntegrationStatus> Read(IConfiguration config)
    {
        var orders = "Payments:PagBank:";
        var common = new List<string>();
        var environment = Environment(config[orders + "BaseUrl"] ?? "https://sandbox.api.pagseguro.com/", false);
        if (environment == "Inválido") common.Add("Selecione um endereço oficial de Sandbox ou Produção para pagamentos.");
        if (!Credential(config[orders + "Token"])) common.Add("Configure o token de pagamentos do ambiente selecionado.");
        if (!Uri.TryCreate(config[orders + "WebhookUrl"], UriKind.Absolute, out var callback)
            || callback.Scheme != "https" || callback.IsLoopback || callback.UserInfo.Length > 0
            || callback.AbsolutePath != "/api/v1/integrations/pagbank/webhook" || callback.Query.Length > 0 || callback.Fragment.Length > 0)
            common.Add("Configure o endereço público HTTPS de notificações de pagamentos da Long Beach.");
        if (!ValidWebhookKey(config[orders + "WebhookPublicKey"]))
            common.Add("Configure uma chave pública ECDSA válida para as notificações deste ambiente.");

        var result = new List<IntegrationStatus>();
        foreach (var (name, flag, fallback) in new[] { ("PagBank Pix", "PixEnabled", true), ("PagBank cartão online", "CardEnabled", false) })
        {
            var enabled = config.GetValue(orders + "Enabled", false) && config.GetValue(orders + flag, fallback);
            var issues = new List<string>(common);
            if (!enabled) issues.Add("Habilite esta forma de pagamento após a homologação.");
            if (!config.GetValue("Payments:Billing:Enabled", false)) issues.Add("Habilite os pagamentos das contas do Bar e da Quadra após a homologação.");
            result.Add(new(name, !enabled ? "Desativado" : common.Count > 0 ? "Configuração incompleta" : "Configurado; validar operação",
                "Criação, consulta, confirmação e estorno. A configuração não comprova autenticação, cobrança ou homologação no provedor.",
                null, null, null, environment, issues));
        }

        var subscriptions = "Payments:PagBankSubscriptions:";
        var recurringIssues = new List<string>();
        var recurringEnvironment = Environment(config[subscriptions + "BaseUrl"] ?? "https://sandbox.api.assinaturas.pagseguro.com/", true);
        if (recurringEnvironment == "Inválido") recurringIssues.Add("Selecione um endereço oficial de Sandbox ou Produção para assinaturas.");
        if (!Credential(config[subscriptions + "Token"])) recurringIssues.Add("Configure a credencial própria de Recorrência; ela é diferente do token de pagamentos.");
        if (!config.GetValue("Payments:Billing:Enabled", false)) recurringIssues.Add("Habilite os pagamentos das contas após a homologação.");
        var recurringEnabled = config.GetValue(subscriptions + "Enabled", false);
        var incomplete = recurringIssues.Count > 0;
        if (!recurringEnabled) recurringIssues.Add("Habilite assinaturas após validar ciclos, falhas e cancelamentos.");
        recurringIssues.Add("Confirme no PagBank a habilitação da Recorrência e seu endereço de notificações.");
        result.Add(new("PagBank assinaturas", !recurringEnabled ? "Desativado" : incomplete ? "Configuração incompleta" : "Configurado; validar operação",
            "Mensalidades recorrentes com consulta de faturas e recuperação de pagamentos. Requer homologação própria.", null, null, null, recurringEnvironment, recurringIssues));

        const string c6 = "Integrations:C6:";
        var c6Issues = new List<string>();
        var c6Environment = config[c6 + "Environment"] ?? "Sandbox";
        if (c6Environment is not ("Sandbox" or "Production")) c6Issues.Add("Selecione Sandbox ou Production para a conexão C6.");
        var c6Account = config[c6 + "AccountId"];
        if (string.IsNullOrWhiteSpace(c6Account) || c6Account.Length > 80 || c6Account.Any(char.IsControl) || c6Account != c6Account.Trim())
            c6Issues.Add("Configure a identificação interna da conta C6.");
        if (!Credential(config[c6 + "ClientId"]) || !Credential(config[c6 + "ClientSecret"]))
            c6Issues.Add("Configure Client ID e Client Secret C6 do ambiente selecionado no servidor.");
        if (string.IsNullOrWhiteSpace(config[c6 + "CertificatePath"]))
            c6Issues.Add("Configure o certificado mTLS C6 com a chave privada no servidor.");
        var pixKey = config[c6 + "PixKey"];
        if (string.IsNullOrWhiteSpace(pixKey) || pixKey.Length > 77 || pixKey.Any(char.IsControl))
            c6Issues.Add("Configure a chave Pix da conta C6 no servidor.");
        var c6Configured = c6Issues.Count == 0;
        var c6ConnectionEnabled = config.GetValue(c6 + "Enabled", false);
        var c6PixEnabled = config.GetValue(c6 + "PixEnabled", false);
        var billingEnabled = config.GetValue("Payments:Billing:Enabled", false);
        if (!c6ConnectionEnabled) c6Issues.Add("Habilite a conexão C6 após a homologação.");
        if (!c6PixEnabled) c6Issues.Add("Habilite novas cobranças Pix C6 após validar o fluxo completo.");
        if (!billingEnabled) c6Issues.Add("Habilite os pagamentos das contas após a homologação.");
        result.Add(new("C6 Pix", !(c6ConnectionEnabled && c6PixEnabled && billingEnabled) ? "Desativado"
            : !c6Configured ? "Configuração incompleta" : "Configurado; validar operação",
            "Pix avulso da Quadra. Suspender novas cobranças preserva a consulta de pagamentos existentes enquanto a conexão permanecer habilitada. A configuração não comprova autenticação, validade do certificado ou homologação no C6.",
            null, null, null, c6Environment == "Production" ? "Produção" : c6Environment == "Sandbox" ? "Sandbox" : "Inválido", c6Issues));
        return result;
    }

    private static bool Credential(string? value) => !string.IsNullOrWhiteSpace(value) && !value.Any(char.IsWhiteSpace);
    private static string Environment(string url, bool subscriptions) => (url, subscriptions) switch
    {
        ("https://sandbox.api.pagseguro.com/", false) or ("https://sandbox.api.assinaturas.pagseguro.com/", true) => "Sandbox",
        ("https://api.pagseguro.com/", false) or ("https://api.assinaturas.pagseguro.com/", true) => "Produção",
        _ => "Inválido"
    };

    public static bool ValidWebhookKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) return false;
        try
        {
            var bytes = Convert.FromBase64String(key);
            using var ec = ECDsa.Create();
            ec.ImportSubjectPublicKeyInfo(bytes, out var read);
            return read == bytes.Length;
        }
        catch (Exception e) when (e is FormatException or CryptographicException) { return false; }
    }
}
