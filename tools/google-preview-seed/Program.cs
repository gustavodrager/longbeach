using LongBeach.Tools;
using LongBeach.Infrastructure.Persistence;
using LongBeach.Infrastructure.Security;
using LongBeach.Infrastructure.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
var cs = LocalPreview.RequireDatabase(args);
var previewPassword = LocalPreview.RequirePassword();
await using var db=new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql(cs).Options,TimeProvider.System);
var hasher=new AspNetIdentityPasswordHasher(Options.Create(new PasswordHasherOptions()));
await new GoogleClientRegistration(db,hasher).EnsureClientAsync("local-preview-client-subject","client.preview@example.invalid","Cliente Google · demonstração",default);
var user=await db.Users.SingleAsync(u=>u.GoogleSubject=="local-preview-client-subject");
// Synthetic preview fixture only: allow UI inspection without a real Google account.
user.ChangePasswordHash(hasher.Hash(previewPassword));await db.SaveChangesAsync();
Console.WriteLine("Conta fictícia de novo cliente preparada na prévia local.");
