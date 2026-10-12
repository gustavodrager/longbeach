namespace LongBeach.Domain.Operations;

/// <summary>Management units within LongBeach, independent of legal entities or bank accounts.</summary>
public static class BusinessUnits
{
    public const string Bar = "bar";
    public const string Court = "quadra";
    public static bool Contains(string? id) => id is Bar or Court;
}
