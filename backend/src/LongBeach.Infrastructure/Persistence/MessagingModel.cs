using LongBeach.Domain.Customers;
using LongBeach.Domain.Identity;
using LongBeach.Domain.Messaging;
using Microsoft.EntityFrameworkCore;
namespace LongBeach.Infrastructure.Persistence;

public static class MessagingModel
{
    public static void Configure(ModelBuilder model)
    {
        var c = model.Entity<MessagingConversation>(); c.ToTable("messaging_conversations"); c.HasKey(x=>x.Id); c.Property(x=>x.Id).ValueGeneratedNever();
        c.Property(x=>x.ExternalId).HasMaxLength(200); c.Property(x=>x.Phone).HasMaxLength(40); c.Property(x=>x.Name).HasMaxLength(240);
        c.Property(x=>x.Status).HasMaxLength(20); c.Property(x=>x.Mode).HasMaxLength(10); c.Property(x=>x.LastMessage).HasMaxLength(240); c.Property(x=>x.Version).IsConcurrencyToken();
        c.HasIndex(x=>x.ExternalId).IsUnique(); c.HasIndex(x=>x.Phone); c.HasIndex(x=>new{x.Status,x.LastMessageAtUtc});
        c.HasOne<Customer>().WithMany().HasForeignKey(x=>x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        c.HasOne<User>().WithMany().HasForeignKey(x=>x.AssignedUserId).OnDelete(DeleteBehavior.Restrict);
        var m = model.Entity<MessagingMessage>(); m.ToTable("messaging_messages"); m.HasKey(x=>x.Id); m.Property(x=>x.Id).ValueGeneratedNever();
        m.Property(x=>x.Direction).HasMaxLength(12); m.Property(x=>x.Origin).HasMaxLength(12); m.Property(x=>x.Text).HasMaxLength(16000);
        m.Property(x=>x.State).HasMaxLength(16); m.Property(x=>x.ExternalId).HasMaxLength(200); m.Property(x=>x.Fingerprint).HasMaxLength(64);
        m.Property(x=>x.AuthorName).HasMaxLength(160); m.Property(x=>x.Purpose).HasMaxLength(32); m.Property(x=>x.ContextKind).HasMaxLength(40); m.Property(x=>x.FailureReason).HasMaxLength(500);
        m.Property(x=>x.Version).IsConcurrencyToken(); m.Property(x=>x.AutomationProcessed).IsConcurrencyToken();
        m.HasIndex(x=>x.OperationId).IsUnique(); m.HasIndex(x=>new{x.ConversationId,x.ExternalId}).IsUnique(); m.HasIndex(x=>new{x.ConversationId,x.OccurredAtUtc,x.Id}); m.HasIndex(x=>new{x.State,x.ScheduledAtUtc});
        m.HasOne<MessagingConversation>().WithMany().HasForeignKey(x=>x.ConversationId).OnDelete(DeleteBehavior.Restrict);
        m.HasOne<MessagingAttachment>().WithMany().HasForeignKey(x=>x.AttachmentId).OnDelete(DeleteBehavior.Restrict);
        var a = model.Entity<MessagingAttachment>(); a.ToTable("messaging_attachments"); a.HasKey(x=>x.Id); a.Property(x=>x.Id).ValueGeneratedNever();
        a.Property(x=>x.FileName).HasMaxLength(240); a.Property(x=>x.ContentType).HasMaxLength(100); a.Property(x=>x.Data).HasColumnType("bytea");
        var alias = model.Entity<MessagingAlias>(); alias.ToTable("messaging_aliases"); alias.HasKey(x=>x.Id); alias.Property(x=>x.Id).ValueGeneratedNever(); alias.Property(x=>x.ExternalId).HasMaxLength(200); alias.HasIndex(x=>x.ExternalId).IsUnique(); alias.HasOne<MessagingConversation>().WithMany().HasForeignKey(x=>x.ConversationId).OnDelete(DeleteBehavior.Restrict);
        var e = model.Entity<MessagingBridgeEvent>(); e.ToTable("messaging_bridge_events"); e.HasKey(x=>x.Id); e.Property(x=>x.Id).ValueGeneratedNever(); e.Property(x=>x.EventId).HasMaxLength(240); e.Property(x=>x.Type).HasMaxLength(20); e.Property(x=>x.Payload).HasColumnType("jsonb"); e.HasIndex(x=>x.EventId).IsUnique();
        var op = model.Entity<MessagingOperation>(); op.ToTable("messaging_operations"); op.HasKey(x=>x.Id); op.Property(x=>x.Id).ValueGeneratedNever(); op.Property(x=>x.Fingerprint).HasMaxLength(64);
        var s = model.Entity<MessagingSettings>(); s.ToTable("messaging_settings"); s.HasKey(x=>x.Id); s.Property(x=>x.Id).ValueGeneratedNever(); s.Property(x=>x.ReminderTime).HasMaxLength(5); s.Property(x=>x.Version).IsConcurrencyToken();
        var f = model.Entity<MessagingFaq>(); f.ToTable("messaging_faqs"); f.HasKey(x=>x.Id); f.Property(x=>x.Id).ValueGeneratedNever(); f.Property(x=>x.Question).HasMaxLength(500); f.Property(x=>x.Answer).HasMaxLength(4000); f.Property(x=>x.Version).IsConcurrencyToken();
    }
}
