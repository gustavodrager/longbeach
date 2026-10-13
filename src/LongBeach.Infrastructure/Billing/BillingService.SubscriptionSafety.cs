using System.Buffers.Binary;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using LongBeach.Infrastructure.Persistence;

namespace LongBeach.Infrastructure.Billing;

public sealed partial class BillingService
{
    private async Task<IAsyncDisposable> LockSubscriptionCustomer(Guid userId, CancellationToken ct)
    {
        var key=BinaryPrimitives.ReadInt64BigEndian(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes("billing-customer:"+userId)));
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_lock({key})",ct);
            return new CustomerLock(db,key);
        }
        catch { await db.Database.CloseConnectionAsync(); throw; }
    }

    private sealed class CustomerLock(LongBeachDbContext context,long key) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            try { await context.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_unlock({key})",CancellationToken.None); }
            finally { await context.Database.CloseConnectionAsync(); }
        }
    }

    // Numeric CPF/CNPJ check digits. Recurrence rejects invalid documents before
    // recording a charge intent or sending sensitive data to the provider.
    internal static bool ValidTaxId(string value)
    {
        if(value.Length is not (11 or 14)||value.Any(c=>c<'0'||c>'9')||value.All(c=>c==value[0]))return false;
        var digits=value.Select(c=>c-'0').ToArray();
        for(var length=value.Length-2;length<value.Length;length++)
        {
            var sum=0;
            for(var i=0;i<length;i++)
            {
                var weight=value.Length==11?length+1-i:2+(length-1-i)%8;
                sum+=digits[i]*weight;
            }
            var remainder=sum%11;
            if(digits[length]!=(remainder<2?0:11-remainder))return false;
        }
        return true;
    }
}
