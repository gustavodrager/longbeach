using LongBeach.Application.Abstractions;
using LongBeach.Application.Operations;
using LongBeach.Infrastructure.Persistence;
namespace LongBeach.Infrastructure.Operations;
public sealed class GradeImportService(LongBeachDbContext db, IAuditContext audit, TimeProvider time)
    : StagedOperationsImportService(db, audit, time, false), IGradeImport;
public sealed class RentalGroupImportService(LongBeachDbContext db, IAuditContext audit, TimeProvider time)
    : StagedOperationsImportService(db, audit, time, true), IRentalGroupImport;
