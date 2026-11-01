using LongBeach.Domain.Identity;
using LongBeach.Domain.Messaging;
using LongBeach.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LongBeach.UnitTests;

public sealed class MessagingRulesTests
{
    [Fact]
    public void Shared_contact_is_not_identity_and_consent_requires_explicit_verification()
    {
        var c=new MessagingConversation("5511999990000@s.whatsapp.net","5511999990000","Cliente sintético",Guid.NewGuid());
        Assert.False(c.IdentityVerified);Assert.False(c.ConsentForReminders);
        Assert.Throws<MessagingRuleException>(()=>c.Link(c.CustomerId,false,true));
        Assert.Throws<MessagingRuleException>(()=>c.Link(null,true,false));
        c.Link(c.CustomerId,true,true);Assert.True(c.ConsentForReminders);
        c.Link(null,false,false);Assert.False(c.IdentityVerified);
    }
    [Fact]
    public void Team_assignment_conflicts_and_replies_reopen_completed_conversation()
    {
        var c=new MessagingConversation("a@lid",null,"Contato");var actor=Guid.NewGuid();c.Act("assume",actor);
        Assert.Equal("Team",c.Mode);Assert.Equal("InProgress",c.Status);
        Assert.Equal(409,Assert.Throws<MessagingRuleException>(()=>c.Act("assume",Guid.NewGuid())).StatusCode);
        c.Act("complete",actor);c.Observe("Nova dúvida",DateTimeOffset.UtcNow,true,false);
        Assert.Equal("NeedsTeam",c.Status);Assert.Null(c.AssignedUserId);Assert.Equal(1,c.UnreadCount);
        c.Act("read",actor);Assert.Equal(0,c.UnreadCount);
    }
    [Fact]
    public void Delayed_receipts_never_regress_delivery_and_cancelled_messages_stay_cancelled()
    {
        var m=new MessagingMessage(Guid.NewGuid(),"Outbound","Staff","Mensagem",DateTimeOffset.UtcNow,"Sending","external",Guid.NewGuid());
        m.Transition("Read");m.Transition("Delivered");m.Transition("Failed");m.Transition("Uncertain");Assert.Equal("Read",m.State);
        var cancelled=new MessagingMessage(Guid.NewGuid(),"Outbound","Bot","Mensagem",DateTimeOffset.UtcNow,"Queued","second",Guid.NewGuid());cancelled.Suppress("Equipe assumiu");cancelled.Transition("Sent");Assert.Equal("Cancelled",cancelled.State);
    }
    [Theory]
    [InlineData("image/png")][InlineData("image/jpeg")][InlineData("application/pdf")]
    public void Renaming_an_executable_does_not_make_it_an_attachment(string mime)=>Assert.Throws<MessagingRuleException>(()=>MessagingRules.AttachmentType("MZ synthetic executable"u8.ToArray(),mime,false));
    [Fact]
    public void Audio_is_receive_only_and_size_is_bounded()
    {
        Assert.Equal("audio/ogg",MessagingRules.AttachmentType("OggSsynthetic"u8.ToArray(),"audio/ogg",true));
        Assert.Throws<MessagingRuleException>(()=>MessagingRules.AttachmentType("OggSsynthetic"u8.ToArray(),"audio/ogg",false));
        Assert.Throws<MessagingRuleException>(()=>MessagingRules.AttachmentType(new byte[MessagingRules.MaxAttachmentBytes+1],"application/pdf",true));
    }
    [Fact]
    public void Messaging_permissions_and_snapshot_are_consistent()
    {
        Assert.Contains(SystemPermissions.MessagingManage,ProfileAccess.Permissions([SystemRoles.Manager],[]));
        var operations=ProfileAccess.Permissions([SystemRoles.Operations],SystemPermissions.All);Assert.Contains(SystemPermissions.MessagingRead,operations);Assert.Contains(SystemPermissions.MessagingOperate,operations);Assert.DoesNotContain(SystemPermissions.MessagingManage,operations);
        Assert.DoesNotContain(SystemPermissions.MessagingRead,ProfileAccess.Permissions([SystemRoles.Teacher],SystemPermissions.All));Assert.DoesNotContain(SystemPermissions.MessagingRead,ProfileAccess.Permissions([SystemRoles.Student],SystemPermissions.All));
        using var db=new LongBeachDbContext(new DbContextOptionsBuilder<LongBeachDbContext>().UseNpgsql("Host=127.0.0.1;Port=1;Database=synthetic;Username=synthetic;Password=synthetic").Options,TimeProvider.System);
        Assert.NotNull(db.Model.FindEntityType(typeof(MessagingAttachment)));Assert.False(db.Database.HasPendingModelChanges());
    }
}
