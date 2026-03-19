# .NET Testing Anti-Patterns & Code Smells Checklist

> **Purpose**: Reference guide for code review and test writing in the store-mgmt backend project.
> **Stack**: .NET 8, xUnit, Moq, FluentAssertions, Clean Architecture, CQRS, MediatR
> **Maintain for**: All contributors and reviewers

---

## Table of Contents

1. [Async/Await Anti-Patterns](#1-asyncawait-anti-patterns)
2. [Null Reference Issues](#2-null-reference-issues)
3. [EF Core Tracking Problems](#3-ef-core-tracking-problems)
4. [MediatR/Handler Issues](#4-mediatorhandler-issues)
5. [Repository Pattern Problems](#5-repository-pattern-problems)
6. [Validation Anti-Patterns](#6-validation-anti-patterns)
7. [Error Handling Anti-Patterns](#7-error-handling-anti-patterns)
8. [Test Structure Issues](#8-test-structure-issues)

---

## 1. Async/Await Anti-Patterns

### [ ] AP-001: `ForEachAsync` with void lambda (fire-and-forget in disguise)

**Why It's a Problem**:
- Tasks are started but NOT awaited
- Exceptions are swallowed silently
- Tests pass even when operations fail
- Race conditions and unpredictable test outcomes

**How to Detect**:
```csharp
// Pattern to find:
collection.ForEachAsync(async x => await DoSomethingAsync(x));
// or
collection.AsParallel().ForAll(async x => await DoSomethingAsync(x));
```

**Correct Alternative**:
```csharp
// For side effects, use:
await Parallel.ForEachAsync(collection, async (item, ct) => 
{
    await ProcessItemAsync(item);
});

// For collection transformation, use:
var tasks = collection.Select(async x => await TransformAsync(x));
var results = await Task.WhenAll(tasks);
```

---

### [ ] AP-002: Blocking on async code (`GetAwaiter().GetResult()`)

**Why It's a Problem**:
- Causes deadlocks in ASP.NET Core context
- Hides `AggregateException` wrapping real exceptions
- Breaks test isolation
- Masks async-related bugs

**How to Detect**:
```csharp
// Search for:
.Task.Wait()
.Task.Result
.Task.GetAwaiter().GetResult()
.ConfigureAwait(false).GetAwaiter().GetResult()
```

**Correct Alternative**:
```csharp
// Make the calling method async:
public async Task<TestResult> When_processing_valid_request()
{
    var result = await _handler.Handle(query, CancellationToken.None);
    result.Should().NotBeNull();
}

// If you MUST block (rare cases only):
await Task.Run(() => /* sync code */).ConfigureAwait(false);
```

---

### [ ] AP-003: Async void (except event handlers)

**Why It's a Problem**:
- Exceptions crash the application
- No way to await completion
- Exception behavior is undefined

**How to Detect**:
```csharp
// Pattern to find:
private async void HandleSomething() { }  // WRONG in non-event-handler context
```

**Correct Alternative**:
```csharp
// Always return Task:
private async Task HandleSomethingAsync() { }
```

---

### [ ] AP-004: `Task.WhenAll` without proper error handling

**Why It's a Problem**:
- Only first exception surfaces
- Other failures are hidden
- Flaky test behavior

**How to Detect**:
```csharp
// This loses error context:
try 
{
    await Task.WhenAll(tasks);
}
catch (Exception ex)
{
    // ex only contains first exception
}
```

**Correct Alternative**:
```csharp
// Option 1: Aggregate exceptions properly
var results = await Task.WhenAll(tasks.Select(async t =>
{
    try { return await t; }
    catch (Exception ex) { return ExceptionResult.From(ex); }
}));

// Option 2: Use results for inspection
var allTasks = collection.Select(async item => 
{
    var result = new OperationResult();
    try { result.Value = await ProcessAsync(item); }
    catch (Exception ex) { result.Exception = ex; }
    return result;
});
var allResults = await Task.WhenAll(allTasks);
allResults.Should().OnlyContain(r => r.Exception == null);
```

---

### [ ] AP-005: Async method returning `Task<List<T>>` then converting to sync collection

**Why It's a Problem**:
- Defeats purpose of async
- Forces unnecessary thread pool allocations
- Confusing API contract

**How to Detect**:
```csharp
async Task<List<Product>> GetProductsAsync()
{
    var products = await _repository.GetAllAsync();
    return products.ToList(); // Redundant sync conversion
}
```

**Correct Alternative**:
```csharp
async Task<IReadOnlyList<Product>> GetProductsAsync()
{
    var products = await _repository.GetAllAsync();
    return products; // Return the async-friendly collection type
}
```

---

## 2. Null Reference Issues

### [ ] AP-101: Asserting `null` with equality comparison

**Why It's a Problem**:
- `Should().BeNull()` provides better error messages
- Equality assertion doesn't indicate intent
- FluentAssertions gives visual diff on failure

**How to Detect**:
```csharp
// Pattern to find:
Assert.Equal(null, result);
Assert.True(result == null);
if (result == null) ...
```

**Correct Alternative**:
```csharp
result.Should().BeNull("because the entity should not exist after deletion");
result.Should().NotBeNull();
```

---

### [ ] AP-102: Not testing null scenarios for command/query parameters

**Why It's a Problem**:
- Null guard violations cause 500 errors in production
- Missing boundary condition coverage
- Potential null reference exceptions

**How to Detect**:
```csharp
// Commands without null checks in tests:
[Fact]
public async Task Handle_ValidCommand_ReturnsSuccess() { /* no null test */ }
```

**Correct Alternative**:
```csharp
[Theory]
[InlineData(null)]
[InlineData("")]
[InlineData("   ")]
public async Task Handle_NullOrEmptyName_ThrowsArgumentException(string invalidName)
{
    var command = new CreateProductCommand(invalidName, 10m);
    await Assert.ThrowsAsync<ArgumentException>(() => _handler.Handle(command));
}
```

---

### [ ] AP-103: Nullable reference types not tested for null

**Why It's a Problem**:
- Warnings become runtime exceptions
- Nullable annotations give false confidence
- Missing optional field validation

**How to Detect**:
```csharp
// Check if nullable properties are tested:
public class CreateOrderCommand
{
    public string? Notes { get; init; } // Nullable, but...
}

// Does test cover Notes = null case?
```

**Correct Alternative**:
```csharp
[Fact]
public async Task Handle_CommandWithNullNotes_Succeeds()
{
    var command = new CreateOrderCommand(Items, null); // Explicit null
    var result = await _handler.Handle(command);
    result.IsSuccess.Should().BeTrue();
}
```

---

### [ ] AP-104: Not verifying navigation properties are loaded

**Why It's a Problem**:
- Lazy loading exceptions in production (if enabled)
- N+1 queries hidden in tests
- Null reference when accessing related entities

**How to Detect**:
```csharp
// Query handler returns entity, but test doesn't check includes:
var order = await _context.Orders.FindAsync(orderId);
order.Customer.Should().NotBeNull(); // Might pass if CustomerId exists but Customer isn't loaded
```

**Correct Alternative**:
```csharp
[Fact]
public async Task Handle_ValidQuery_EagerLoadsCustomer()
{
    var query = new GetOrderQuery(_orderId);
    
    var result = await _handler.Handle(query, CancellationToken.None);
    
    result.Should().NotBeNull();
    result.Customer.Should().NotBeNull("Customer should be eagerly loaded");
    result.Customer.Name.Should().Be("Test Customer");
}
```

---

## 3. EF Core Tracking Problems

### [ ] AP-201: Testing with tracked entities when testing detached behavior

**Why It's a Problem**:
- Updates succeed due to tracking, not actual logic
- False positive test coverage
- Real behavior differs in production

**How to Detect**:
```csharp
// DbContext added to test, but:
var trackedEntity = await _context.Products.FindAsync(productId);
trackedEntity.Price = 50m;
await _context.SaveChangesAsync(); // Works because tracked!
```

**Correct Alternative**:
```csharp
[Fact]
public async Task Handle_DetachedEntityUpdate_UpdatesCorrectly()
{
    // Arrange - detach the entity
    var product = await _context.Products.FindAsync(productId);
    _context.Entry(product).State = EntityState.Detached;
    
    product.Price = 50m;
    
    // Act - use a command handler that works with detached entities
    var command = new UpdateProductCommand(product);
    var result = await _handler.Handle(command);
    
    // Assert
    result.IsSuccess.Should().BeTrue();
    var updated = await _context.Products.AsNoTracking().FindAsync(productId);
    updated!.Price.Should().Be(50m);
}
```

---

### [ ] AP-202: Not resetting `ChangeTracker` between tests

**Why It's a Problem**:
- State leaks between tests
- Tests depend on execution order
- Flaky tests in random order
- Memory growth from tracked entities

**How to Detect**:
```csharp
// Check test base class or fixtures for:
public abstract class TestBase
{
    protected AppDbContext _context;
    
    // Is ChangeTracker cleared between tests?
    // Is a new DbContext created per test?
}
```

**Correct Alternative**:
```csharp
public class TestBase : IDisposable
{
    protected readonly AppDbContext _context;
    
    public TestBase()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()) // Unique per test
            .Options;
        _context = new AppDbContext(options);
    }
    
    protected void ResetTracker()
    {
        _context.ChangeTracker.Clear();
    }
    
    public void Dispose()
    {
        _context.Dispose();
    }
}
```

---

### [ ] AP-203: Testing with `AsNoTracking()` but production uses tracking

**Why It's a Problem**:
- Different behavior in tests vs production
- `FindAsync` doesn't work as expected with AsNoTracking
- Change detection differences

**How to Detect**:
```csharp
// InMemoryProvider defaults to tracking
// Check if test explicitly sets tracking mode differently from production
```

**Correct Alternative**:
```csharp
// For read-only tests, use AsNoTracking explicitly
[Fact]
public async Task GetProducts_ReturnsAllProducts()
{
    // Arrange - seed data with tracked context
    await SeedTestData(_context);
    
    // Act - query with AsNoTracking (matching read scenarios)
    var products = await _context.Products.AsNoTracking().ToListAsync();
    
    // Assert
    products.Should().HaveCount(3);
}

// For write tests, ensure tracking is enabled (default)
[Fact]
public async Task UpdateProduct_ModifiesEntity()
{
    var product = await _context.Products.FirstAsync();
    // Default tracking is enabled
    product.Price = 99.99m;
    await _context.SaveChangesAsync();
}
```

---

### [ ] AP-204: Not testing entity state transitions

**Why It's a Problem**:
- Handlers might set wrong entity state
- Unintended side effects in production
- Data integrity issues

**How to Detect**:
```csharp
// Check if tests verify EntityState:
var entry = _context.Entry(product);
entry.State.Should().Be(EntityState.Added); // or Modified, Deleted, etc.
```

**Correct Alternative**:
```csharp
[Fact]
public async Task Handle_NewProduct_SetsStateToAdded()
{
    var command = new CreateProductCommand("New", 10m);
    
    await _handler.Handle(command, CancellationToken.None);
    
    var entry = _context.Entry(_context.Products.Local.First());
    entry.State.Should().Be(EntityState.Added);
}
```

---

## 4. MediatR/Handler Issues

### [ ] AP-301: Not testing MediatR pipeline behaviors

**Why It's a Problem**:
- Validation, logging, transaction behavior untested
- Handlers pass invalid data
- Production errors not reproduced in tests

**How to Detect**:
```csharp
// Pipeline behaviors (IPipelineBehavior) are often skipped:
// - FluentValidation behavior
// - Transaction behavior
// - Logging behavior
// - Caching behavior
```

**Correct Alternative**:
```csharp
[Fact]
public async Task Handle_InvalidCommand_FailsDueToValidation()
{
    var command = new CreateProductCommand("", -10m); // Invalid
    
    var result = await _mediator.Send(command);
    
    result.IsSuccess.Should().BeFalse();
    result.Errors.Should().Contain(e => e.Property == "Name");
    result.Errors.Should().Contain(e => e.Property == "Price");
}

[Fact]
public async Task Handle_ValidCommand_ExecutesWithinTransaction()
{
    // Test that transaction behavior is registered
    _serviceProvider.Should().Resolve<IPipelineBehavior<,>>();
}
```

---

### [ ] AP-302: Testing handler in isolation without MediatR

**Why It's a Problem**:
- Doesn't test request/response pipeline
- MediatR-specific features untested
- Different DI resolution than production

**How to Detect**:
```csharp
// Direct handler instantiation:
var handler = new CreateProductHandler(_context);
var result = await handler.Handle(command, CancellationToken.None);

// Missing MediatR flow
```

**Correct Alternative**:
```csharp
[Fact]
public async Task Send_CreateProductCommand_ReturnsSuccessViaMediatR()
{
    // Arrange - resolve handler through DI (as production does)
    var handler = _serviceProvider.GetRequiredService<IRequestHandler<CreateProductCommand, Result>>();
    
    var command = new CreateProductCommand("Test Product", 25.00m);
    
    // Act
    var result = await _mediator.Send(command);
    
    // Assert
    result.IsSuccess.Should().BeTrue();
}
```

---

### [ ] AP-303: Not testing query result shape matches DTOs

**Why It's a Problem**:
- Extra data serialized unnecessarily
- API contract mismatches
- Performance issues hidden

**How to Detect**:
```csharp
// Check if query results are tested for exact shape:
[Fact]
public void GetOrderQuery_Result_ContainsExpectedFields()
{
    var query = new GetOrderQuery(1);
    var result = _mapper.Map<OrderDto>(query);
    
    // Are we testing all expected fields?
    result.GetType().GetProperties().Should().HaveCount(8); // Specific count
}
```

**Correct Alternative**:
```csharp
[Fact]
public async Task Handle_ValidQuery_ReturnsCorrectDto()
{
    var query = new GetOrderQuery(_orderId);
    
    var result = await _handler.Handle(query, CancellationToken.None);
    
    result.Should().BeOfType<OrderDto>();
    result.Id.Should().Be(_orderId);
    result.CustomerName.Should().NotBeNullOrEmpty();
    result.Items.Should().NotBeEmpty();
    result.Total.Should().BePositive();
}
```

---

### [ ] AP-304: Handler throws exception instead of returning failure result

**Why It's a Problem**:
- Inconsistent error handling
- Exception-based flow is slow
- MediatR pipeline can't intercept uniformly

**How to Detect**:
```csharp
// Pattern to find in handlers:
if (entity == null)
    throw new NotFoundException($"Entity with ID {id} not found");
```

**Correct Alternative**:
```csharp
// Pattern to use:
if (entity == null)
    return Result.Failure(new NotFoundError(nameof(Product), id));
    
// Tests verify this:
[Fact]
public async Task Handle_NonExistentId_ReturnsNotFound()
{
    var command = new GetProductQuery(Guid.NewGuid());
    
    var result = await _handler.Handle(command, CancellationToken.None);
    
    result.IsSuccess.Should().BeFalse();
    result.Error.Should().BeOfType<NotFoundError>();
}
```

---

## 5. Repository Pattern Problems

### [ ] AP-401: Repository returning `IQueryable` leaking persistence concerns

**Why It's a Problem**:
- Business logic ends up in tests or presentation layer
- Test complexity increases
- Repository contract is violated
- Hard to mock correctly

**How to Detect**:
```csharp
// Pattern to find:
interface IProductRepository
{
    IQueryable<Product> GetAll(); // LEAKS EF Core to callers
}
```

**Correct Alternative**:
```csharp
// Return concrete types:
interface IProductRepository
{
    Task<IReadOnlyList<Product>> GetAllAsync(CancellationToken ct = default);
    Task<Product?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<Product>> GetByCategoryAsync(string category, CancellationToken ct = default);
}
```

---

### [ ] AP-402: Not testing repository specifications

**Why It's a Problem**:
- Filtering logic untested
- Complex queries fail silently
- Specification changes break functionality

**How to Detect**:
```csharp
// Check if specifications have dedicated tests:
[Fact]
public async Task GetActiveProductsInCategory_ReturnsCorrectProducts()
{
    var spec = new ActiveProductsByCategorySpec(Category.Electronics);
    
    var results = await _repository.FindAsync(spec);
    
    results.Should().OnlyContain(p => p.IsActive);
    results.Should().OnlyContain(p => p.Category == Category.Electronics);
}
```

**Correct Alternative**:
```csharp
public class ActiveProductsByCategorySpecTests
{
    [Fact]
    public void Spec_IncludesActiveProductsOnly()
    {
        var spec = new ActiveProductsByCategorySpec(Category.Electronics);
        
        var products = TestData.ActiveProducts.Concat(TestData.InactiveProducts);
        
        var filtered = products.AsQueryable().Where(spec.WhereExpression);
        
        filtered.Should().OnlyContain(p => p.IsActive);
    }
    
    [Fact]
    public void Spec_FiltersByCategory()
    {
        var spec = new ActiveProductsByCategorySpec(Category.Electronics);
        
        var products = TestData.ElectronicsProducts.Concat(TestData.ClothingProducts);
        
        var filtered = products.AsQueryable().Where(spec.WhereExpression);
        
        filtered.Should().OnlyContain(p => p.Category == Category.Electronics);
    }
}
```

---

### [ ] AP-403: Tests coupling to specific repository implementation

**Why It's a Problem**:
- Test implementation details, not behavior
- Brittle tests break on refactoring
- Not true unit tests

**How to Detect**:
```csharp
// Testing EF-specific internals when should test via interface:
public class ProductRepositoryTests
{
    [Fact]
    public async Task GetAllAsync_UsesNoTracking() // Implementation detail!
    {
        var options = new DbContextOptionsBuilder<StoreDbContext>()
            .UseInMemoryDatabase()
            .Options;
        
        using var context = new StoreDbContext(options);
        var repo = new EFProductRepository(context);
        
        await repo.GetAllAsync();
        
        // Testing internal state - WRONG
        context.ChangeTracker.QueryTrackingBehavior.Should().BeNull();
    }
}
```

**Correct Alternative**:
```csharp
public class ProductRepositoryTests
{
    [Fact]
    public async Task GetAllAsync_ReturnsAllProducts()
    {
        var products = new[]
        {
            new Product { Name = "Product A" },
            new Product { Name = "Product B" }
        };
        await _repository.AddRangeAsync(products);
        
        var result = await _repository.GetAllAsync();
        
        result.Should().HaveCount(2);
    }
}
```

---

### [ ] AP-404: Not testing async enumerable handling

**Why It's a Problem**:
- Memory issues with large result sets
- Streaming not utilized
- Different behavior than expected

**How to Detect**:
```csharp
// Check if repository has async enumerable methods and they're tested:
IAsyncEnumerable<Product> GetAllAsyncEnumerable();
```

**Correct Alternative**:
```csharp
[Fact]
public async Task GetAllAsyncEnumerable_YieldsProductsWithoutLoadingAll()
{
    var repo = new EFProductRepository(_context);
    
    await using var enumerator = repo.GetAllAsyncEnumerable().GetAsyncEnumerator();
    
    var count = 0;
    while (await enumerator.MoveNextAsync())
    {
        count++;
        if (count > 100) break; // Verify streaming behavior
    }
    
    count.Should().BeGreaterThan(0);
}
```

---

## 6. Validation Anti-Patterns

### [ ] AP-501: Testing FluentValidation validators in isolation without proper setup

**Why It's a Problem**:
- Validator tests might pass but validation fails in pipeline
- Dependency injection not tested
- Class-level vs Property-level validation confused

**How to Detect**:
```csharp
[Fact]
public void CreateProductValidator_ValidProduct_Passes()
{
    var validator = new CreateProductValidator();
    var result = validator.Validate(_validProduct);
    result.IsValid.Should().BeTrue();
}

// Missing: Test with actual validator dependencies mocked
```

**Correct Alternative**:
```csharp
public class CreateProductValidatorTests
{
    private readonly CreateProductValidator _validator;
    private readonly Mock<IProductUniquenessChecker> _uniquenessChecker;

    public CreateProductValidatorTests()
    {
        _uniquenessChecker = new Mock<IProductUniquenessChecker>();
        _validator = new CreateProductValidator(_uniquenessChecker.Object);
    }

    [Fact]
    public void Validate_DuplicateSku_Fails()
    {
        _uniquenessChecker.Setup(x => x.IsSkuUnique(It.IsAny<string>(), It.IsAny<Guid?>()))
            .ReturnsAsync(false);
        
        var command = new CreateProductCommand("Test", 10m) { Sku = "DUPLICATE" };
        
        var result = _validator.Validate(command);
        
        result.Should().HaveValidationErrorFor(c => c.Sku)
            .WithErrorMessage("SKU must be unique");
    }
}
```

---

### [ ] AP-502: Not testing cross-property validation

**Why It's a Problem**:
- Business rules spanning multiple properties untested
- Complex validations fail silently
- Data integrity at risk

**How to Detect**:
```csharp
// Look for validators with Must() or custom logic:
RuleFor(x => x).Must(HaveValidDateRange);
// No test for: StartDate > EndDate, StartDate < Today, etc.
```

**Correct Alternative**:
```csharp
[Theory]
[InlineData("2024-01-01", "2024-01-01")] // Same date - depends on business rule
[InlineData("2024-02-01", "2024-01-01")] // End before start - should fail
[InlineData("2024-01-01", "2025-01-01")] // Valid range
public void Validate_PromotionPeriod_HasCorrectValidation(DateTime start, DateTime end, bool shouldPass)
{
    var command = new CreatePromotionCommand(start, end, "Test");
    
    var result = _validator.Validate(command);
    
    if (!shouldPass)
        result.Should().HaveValidationErrorFor("Period");
}
```

---

### [ ] AP-503: Testing validator instead of validation behavior in handler

**Why It's a Problem**:
- Integration between validation and command handling untested
- Validator might be replaced/disabled in pipeline
- Real-world flow differs

**How to Detect**:
```csharp
// Only testing validator, not handler's validation integration:
[Fact]
public void Validator_RulesAreCorrect() { /* only this */ }

// Missing:
[Fact]
public async Task Handle_InvalidCommandViaMediator_FailsValidation()
```

**Correct Alternative**:
```csharp
[Fact]
public async Task Send_InvalidCommandViaMediatR_ReturnsValidationErrors()
{
    var command = new CreateProductCommand("", -10m);
    
    var result = await _mediator.Send(command);
    
    result.IsSuccess.Should().BeFalse();
    result.Errors.Should().Contain(e => e.Property == "Name");
    result.Errors.Should().Contain(e => e.Property == "Price");
}
```

---

### [ ] AP-504: Not testing maximum constraint validations

**Why It's a Problem**:
- Boundary values untested
- Potential overflow or truncation issues
- Validation might not match database constraints

**How to Detect**:
```csharp
// Check for edge case tests:
[Theory]
[InlineData(0)] // Lower boundary
[InlineData(999999999.99)] // Upper boundary from DB?
public void Validate_Price_WithinBounds(decimal price)
```

**Correct Alternative**:
```csharp
[Theory]
[InlineData(0, false, "Price must be positive")]
[InlineData(-0.01, false, "Price must be positive")]
[InlineData(0.01, true, "Minimum positive price")]
[InlineData(999999999.99, true, "Maximum allowed price")]
[InlineData(1000000000, false, "Exceeds maximum")]
public void Validate_Price_RespectsConstraints(decimal price, bool shouldPass, string reason)
{
    var command = new CreateProductCommand("Test", price);
    
    var result = _validator.Validate(command);
    
    if (shouldPass)
        result.Should().NotHaveValidationErrorFor(c => c.Price);
    else
        result.Should().HaveValidationErrorFor(c => c.Price);
}
```

---

## 7. Error Handling Anti-Patterns

### [ ] AP-601: Swallowing exceptions in tests

**Why It's a Problem**:
- Tests pass when they should fail
- Error paths untested
- Masked failures in production

**How to Detect**:
```csharp
// Pattern to find:
try 
{
    await _handler.Handle(command);
}
catch
{
    // Swallowed - test will pass regardless
}
```

**Correct Alternative**:
```csharp
[Fact]
public async Task Handle_DatabaseFailure_ThrowsException()
{
    _context.Database.EnsureDeleted(); // Force failure
    
    await Assert.ThrowsAsync<DbUpdateException>(() => 
        _handler.Handle(command));
}

// OR testing failure result pattern:
[Fact]
public async Task Handle_DatabaseFailure_ReturnsFailureResult()
{
    _context.Database.EnsureDeleted();
    
    var result = await _handler.Handle(command);
    
    result.IsSuccess.Should().BeFalse();
    result.Error.Should().BeOfType<DatabaseError>();
}
```

---

### [ ] AP-602: Not testing specific exception types

**Why It's a Problem**:
- Tests pass for wrong reasons
- Error type changes break tests silently
- Exception hierarchy not respected

**How to Detect**:
```csharp
// Generic exception catching:
try { ... }
catch (Exception) // Too broad
{
    Assert.True(true); // Always passes
}
```

**Correct Alternative**:
```csharp
[Fact]
public async Task Handle_EntityNotFound_ThrowsNotFoundException()
{
    var query = new GetProductQuery(Guid.NewGuid());
    
    var exception = await Assert.ThrowsAsync<NotFoundException>(() => 
        _handler.Handle(query, CancellationToken.None));
    
    exception.Message.Should().Contain("Product");
    exception.EntityId.Should().Be(query.ProductId);
}
```

---

### [ ] AP-603: Testing error handling with real exceptions instead of custom error types

**Why It's a Problem**:
- Coupling to implementation details
- Hard to maintain
- Error contract unclear

**How to Detect**:
```csharp
// Testing with raw exceptions:
[Fact]
public async Task Handle_DuplicateSku_ThrowsDbUpdateException()
{
    // ...setup duplicate...
    
    Action act = () => _handler.Handle(command);
    
    act.Should().Throw<DbUpdateException>(); // Exposes implementation
}
```

**Correct Alternative**:
```csharp
[Fact]
public async Task Handle_DuplicateSku_ReturnsDomainError()
{
    // ...setup duplicate...
    
    var result = await _handler.Handle(command);
    
    result.IsSuccess.Should().BeFalse();
    result.Error.Should().BeOfType<ValidationError>();
    result.Error.Message.Should().Contain("SKU");
}
```

---

### [ ] AP-604: Not testing exception messages and details

**Why It's a Problem**:
- Error messages not user-friendly
- Logging might miss important details
- Debugging in production harder

**How to Detect**:
```csharp
// Only checking exception type, not message:
Assert.Throws<NotFoundException>(() => ...);
// Missing: exception.Message.Contains("...")
```

**Correct Alternative**:
```csharp
[Fact]
public async Task Handle_NotFound_IncludesEntityDetails()
{
    var productId = Guid.NewGuid();
    
    var exception = await Assert.ThrowsAsync<NotFoundException>(() => 
        _handler.Handle(new GetProductQuery(productId)));
    
    exception.Message.Should().Contain("Product");
    exception.Message.Should().Contain(productId.ToString());
    exception.EntityType.Should().Be(typeof(Product));
}
```

---

### [ ] AP-605: Missing rollback/abort scenario tests

**Why It's a Problem**:
- Partial operations leave data in invalid state
- Transactions not properly handled
- Data integrity issues

**How to Detect**:
```csharp
// Check for tests that verify no partial commits:
[Fact]
public async Task Handle_FailsMidway_NoChangesPersisted()
{
    // Setup that fails after partial work
    // Assert: database should be unchanged
}
```

**Correct Alternative**:
```csharp
[Fact]
public async Task Handle_ValidationFailsAfterDbWrite_NoPartialData()
{
    // Arrange - pre-existing entity
    var existingProduct = await _context.Products.AddAsync(new Product 
    { 
        Sku = "EXISTING", 
        Name = "Existing" 
    });
    await _context.SaveChangesAsync();
    
    // Act - command that passes DB but fails validation
    var command = new CreateProductCommand("New") { Sku = "EXISTING" }; // Duplicate
    
    await _mediator.Send(command);
    
    // Assert - no extra product created
    await _context.Products.Should().HaveCountAsync(1);
}
```

---

## 8. Test Structure Issues

### [ ] AP-701: Magic strings/numbers without explanation

**Why It's a Problem**:
- Tests are not self-documenting
- Purpose of values unclear
- Hard to identify regression values

**How to Detect**:
```csharp
// Pattern to find:
Assert.Equal(42, result.Count);
command.Price = 999.99m; // Why this specific value?
```

**Correct Alternative**:
```csharp
private const decimal MaximumAllowedPrice = 999.99m;

[Fact]
public void Calculate_TotalPrice_ExceedsMaximum_Throws()
{
    var command = new CalculateTotalCommand(MaximumAllowedPrice, quantity: 10);
    
    Action act = () => _calculator.Calculate(command);
    
    act.Should().Throw<PriceExceededException>()
        .WithMessage($"Price exceeds maximum of {MaximumAllowedPrice:C}");
}
```

---

### [ ] AP-702: Test names don't describe behavior

**Why It's a Problem**:
- Test intent unclear
- Hard to find specific test failures
- Documentation value lost

**How to Detect**:
```csharp
// Bad names:
[Fact]
public void Test1() { }
[Fact]
public void HandleTest() { }
[Fact]
public void Create_Valid() { }
```

**Correct Alternative**:
```csharp
// Use: Method_ExpectedBehavior_Context
[Fact]
public async Task Handle_ValidCreateProductCommand_ReturnsSuccessWithCreatedId()
[Fact]
public async Task Handle_DuplicateSku_ReturnsConflictError()
[Fact]
public async Task Handle_EmptyProductName_ThrowsArgumentValidationError()

// Arrange-Act-Assert in name (GWT - Given-When-Then):
[Fact]
public async Task Given_ValidOrder_When_ProcessingPayment_Then_OrderStatusIsPaid()
```

---

### [ ] AP-703: Multiple assertions without logical grouping

**Why It's a Problem**:
- First failure stops all checks
- Hard to identify what actually failed
- Mixed concerns

**How to Detect**:
```csharp
[Fact]
public async Task Handle_ValidQuery_ReturnsCorrectData()
{
    var result = await _handler.Handle(query);
    
    Assert.Equal("Test", result.Name);
    Assert.Equal(10, result.Items.Count);
    Assert.Equal(100m, result.Total);
    Assert.True(result.IsActive);
    Assert.NotNull(result.CreatedDate);
    // Too many unrelated assertions
}
```

**Correct Alternative**:
```csharp
[Fact]
public async Task Handle_ValidQuery_ReturnsCorrectMetadata()
{
    var result = await _handler.Handle(query);
    
    result.Name.Should().Be("Test");
    result.IsActive.Should().BeTrue();
    result.CreatedDate.Should().NotBeNull();
}

[Fact]
public async Task Handle_ValidQuery_ReturnsCorrectOrderItems()
{
    var result = await _handler.Handle(query);
    
    result.Items.Should().HaveCount(10);
    result.Items.Should().OnlyContain(i => i.Quantity > 0);
}

[Fact]
public async Task Handle_ValidQuery_CalculatesTotalCorrectly()
{
    var result = await _handler.Handle(query);
    
    result.Total.Should().Be(100m);
    result.Subtotal.Should().Be(90m);
    result.Tax.Should().Be(10m);
}
```

---

### [ ] AP-704: Not using `[Theory]` with `[InlineData]` for parameter variations

**Why It's a Problem**:
- Code duplication across tests
- Same logic tested with different values not obvious
- Maintenance burden

**How to Detect**:
```csharp
// Repetitive tests:
[Fact] public async Task Handle_NegativePrice_Throws() { ... }
[Fact] public async Task Handle_ZeroPrice_Throws() { ... }
[Fact] public async Task Handle_MinusOnePrice_Throws() { ... }
```

**Correct Alternative**:
```csharp
[Theory]
[InlineData(-1)]
[InlineData(-0.01)]
[InlineData(-999999)]
[InlineData(double.MinValue)]
public async Task Handle_NegativePrice_ThrowsArgumentException(decimal invalidPrice)
{
    var command = new CreateProductCommand("Test", invalidPrice);
    
    var exception = await Assert.ThrowsAsync<ArgumentException>(() => 
        _handler.Handle(command));
    
    exception.ParamName.Should().Be("Price");
}
```

---

### [ ] AP-705: Tests depending on execution order

**Why It's a Problem**:
- Tests fail when run individually
- TestOrder/Random fails in CI
- Non-deterministic behavior

**How to Detect**:
```csharp
[Fact]
public async Task Test3_RunsAfterTest2() // Implicit order dependency
{
    var previousResult = Test2State; // Shared state!
}
```

**Correct Alternative**:
```csharp
// Each test is self-contained:
[Fact]
public async Task Handle_CreatesNewOrder_EachTestIsolated()
{
    // Arrange - create any prerequisites WITHIN this test
    var customer = await _context.Customers.AddAsync(new Customer { Name = "Test" });
    await _context.SaveChangesAsync();
    
    // Act
    var command = new CreateOrderCommand(customer.Entity.Id, Items);
    var result = await _handler.Handle(command);
    
    // Assert
    result.Should().NotBeNull();
}
```

---

### [ ] AP-706: Shared mutable state between tests

**Why It's a Problem**:
- Order-dependent failures
- Flaky tests
- Race conditions in parallel execution

**How to Detect**:
```csharp
private static List<Product> _sharedProducts = new(); // SHARED STATE!

[Fact]
public async Task Test1_AddsProduct() 
{
    _sharedProducts.Add(product); // Mutates shared state
}

[Fact]
public async Task Test2_CountsProducts()
{
    var count = _sharedProducts.Count; // Depends on Test1!
}
```

**Correct Alternative**:
```csharp
// Each test creates its own data:
[Fact]
public async Task Handle_CreatesProduct_CountIsOne()
{
    var products = new List<Product>();
    await _repository.AddAsync(new Product { Name = "Test" });
    
    var count = await _repository.GetAllAsync();
    
    count.Should().HaveCount(1); // Independent
}
```

---

### [ ] AP-707: Not using proper test fixtures for expensive setup

**Why It's a Problem**:
- Slow test suite
- Setup code duplicated
- Not clear what setup is shared

**How to Detect**:
```csharp
// Duplicate setup in every test:
[Fact]
public async Task Test1()
{
    await SetupDatabase();
    await SetupProducts();
    await SetupCustomers();
    // ... 50 lines of setup
}
```

**Correct Alternative**:
```csharp
// Shared fixture for common setup:
public class IntegrationTestFixture : IAsyncLifetime
{
    public StoreDbContext Context { get; private set; }
    public IMediator Mediator { get; private set; }
    
    public async Task InitializeAsync()
    {
        var options = new DbContextOptionsBuilder<StoreDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        Context = new StoreDbContext(options);
        await SeedStandardDataAsync(Context);
    }
    
    public Task DisposeAsync() => Context.DisposeAsync();
}

public class OrderHandlerTests : IClassFixture<OrderHandlerFixture>
{
    private readonly OrderHandlerFixture _fixture;
    
    public OrderHandlerTests(OrderHandlerFixture fixture)
    {
        _fixture = fixture;
    }
    
    [Fact]
    public async Task Handle_ValidOrder_UsesPreSeededCustomer()
    {
        // _fixture already has standard customer seeded
    }
}
```

---

### [ ] AP-708: Missing test categories/traits for CI filtering

**Why It's a Problem**:
- Can't run fast unit tests without integration tests
- CI takes too long
- Can't easily find related tests

**How to Detect**:
```csharp
// No categorization:
[Fact]
public async Task Handle_ValidOrder_Succeeds() { } // Is this integration or unit?
```

**Correct Alternative**:
```csharp
[Trait("Category", "Unit")]
[Fact]
public async Task Handle_ValidCommand_ReturnsSuccess()

[Trait("Category", "Integration")]
[Fact]
public async Task Handle_EndToEnd_WritesToDatabase()

// Or use custom traits:
[Trait("Feature", "Orders")]
[Trait("Layer", "Handler")]
[Fact]
public async Task Handle_CancelOrder_UpdatesStatus()
```

---

## Quick Reference: Anti-Pattern Detection Patterns

### Search Patterns for Code Review

```csharp
// Async issues:
"ForEachAsync\\("
"\\.Result"
"\\.GetAwaiter\\(\\)\\.GetResult\\(\\)"
"async void"

// Null issues:
"== null"
"!= null"
"Assert\\.Equal\\(null"

// EF Core:
"\\.State = EntityState\\."
"\\.AsNoTracking\\(\\)"

// Test structure:
"Assert\\.True\\(.*=="
"Assert\\.False\\(.*=="
```

### Checklist Summary

| Category | Check Count | Priority |
|----------|-------------|----------|
| Async/Await | 5 | High |
| Null Reference | 4 | High |
| EF Core Tracking | 4 | High |
| MediatR/Handler | 4 | Medium |
| Repository Pattern | 4 | Medium |
| Validation | 4 | High |
| Error Handling | 5 | High |
| Test Structure | 8 | Medium |

---

## Contributing to This Document

When you discover a new anti-pattern:

1. Add to the appropriate category
2. Include: Name, Problem, Detection, Alternative
3. Add to the detection patterns at bottom
4. Update the checklist summary table
5. Create a sample test demonstrating the fix

---

*Last Updated: 2026-03-19*
*Project: store-mgmt backend*
*Stack: .NET 8, xUnit, Moq, FluentAssertions, Clean Architecture*
