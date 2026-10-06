using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using LongBeach.Application.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace LongBeach.Infrastructure.Security;

public sealed class JwtTokenService(IOptions<JwtOptions> options) : ITokenService
{
    private readonly JwtOptions _options = options.Value;

    public IssuedTokenPair Issue(TokenPrincipal principal, DateTimeOffset now)
    {
        var accessExpiresAt = now.AddMinutes(_options.AccessTokenMinutes);
        if (principal.RequiresFirstAccess)
        {
            accessExpiresAt = now.AddMinutes(Math.Min(15, _options.AccessTokenMinutes));
            if (principal.InitialAccessExpiresAtUtc < accessExpiresAt) accessExpiresAt = principal.InitialAccessExpiresAtUtc.Value;
        }
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.SigningKey)),
            SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, principal.UserId.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(JwtRegisteredClaimNames.Email, principal.Email),
            new(
                JwtRegisteredClaimNames.Iat,
                EpochTime.GetIntDate(now.UtcDateTime).ToString(System.Globalization.CultureInfo.InvariantCulture),
                ClaimValueTypes.Integer64),
            new(ClaimTypes.NameIdentifier, principal.UserId.ToString()),
            new(ClaimTypes.Name, principal.Name),
            new("permissions_version", "1")
        };

        if (principal.Username is not null) claims.Add(new("username", principal.Username));
        if (principal.RequiresFirstAccess) claims.Add(new("requires_first_access", "true"));
        else
        {
            claims.AddRange(principal.Roles.Select(role => new Claim(ClaimTypes.Role, role)));
            claims.AddRange(principal.Permissions.Select(permission => new Claim("permission", permission)));
        }

        var jwt = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: accessExpiresAt.UtcDateTime,
            signingCredentials: credentials);

        var refreshToken = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(64));
        var csrfToken = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        return new IssuedTokenPair(
            new JwtSecurityTokenHandler().WriteToken(jwt),
            accessExpiresAt,
            refreshToken,
            HashRefreshToken(refreshToken),
            csrfToken,
            HashCsrfToken(csrfToken),
            Guid.NewGuid(),
            now.AddDays(_options.RefreshTokenDays));
    }

    public string HashRefreshToken(string refreshToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(refreshToken);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken)));
    }

    public string HashCsrfToken(string csrfToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(csrfToken);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(csrfToken)));
    }
}
