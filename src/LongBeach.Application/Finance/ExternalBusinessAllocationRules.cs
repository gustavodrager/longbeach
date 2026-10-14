using LongBeach.Domain.Operations;

namespace LongBeach.Application.Finance;

/// <summary>
/// Read-time allocation from an identified business source. This does not change
/// source documents, confirm receipt, or create additional revenue.
/// </summary>
public static class ExternalBusinessAllocationRules
{
    public static string? FromHistory(string series, string metric) => series switch
    {
        // A Pix recorded in PagVendas is still a Bar sale, not a direct court receipt.
        "pagvendas-vendas" => BusinessUnits.Bar,
        "alunos" or "mensalistas" or "aulas" => BusinessUnits.Court,
        "consolidado" or "consolidado-com-dividas" when metric == "vendas-bar-bruto" => BusinessUnits.Bar,
        // A bank/provider, balance, transfer, or generic income label does not identify a unit.
        _ => null
    };
}
