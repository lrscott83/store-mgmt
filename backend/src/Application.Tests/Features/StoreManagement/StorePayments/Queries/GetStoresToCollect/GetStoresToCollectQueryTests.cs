using Application.Abstractions.HttpContext;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.Features.StoreManagement.StorePayments.Queries.GetStoresToCollect;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StorePayments;
using Domain.Entities.Stores;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.StoreManagement.StorePayments.Queries.GetStoresToCollect;

public class GetStoresToCollectQueryHandlerTests
{
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IStorePaymentRepository> _mockStorePaymentRepository;
    private readonly Mock<ISystemConfigurationRepository> _mockConfigRepository;
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly GetStoresToCollectQueryHandler _handler;

    private readonly Guid _reSellerUserId = Guid.NewGuid();
    private static readonly Guid TenantId = Guid.NewGuid();

    // Dynamic dates relative to today
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);
    private static readonly DateOnly PaymentStartPorVencer = Today.AddMonths(-2).AddDays(3); // nextDue ≈ Today + 3d → PorVencer
    private const int TrialMonths = 1;
    private const int GraceDays = 5;

    public GetStoresToCollectQueryHandlerTests()
    {
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockStorePaymentRepository = new Mock<IStorePaymentRepository>();
        _mockConfigRepository = new Mock<ISystemConfigurationRepository>();
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();

        _mockLocalizer.Setup(x => x["UserNotFound"]).Returns(new LocalizedString("UserNotFound", "User not found"));
        _mockLocalizer.Setup(x => x["StoreNotFound"]).Returns(new LocalizedString("StoreNotFound", "Store not found"));

        _mockConfigRepository
            .Setup(x => x.GetTestingPeriodInMonthsAsync())
            .ReturnsAsync(TrialMonths);
        _mockConfigRepository
            .Setup(x => x.GetPaymentGraceDaysAsync())
            .ReturnsAsync(GraceDays);

        _handler = new GetStoresToCollectQueryHandler(
            _mockStoreRepository.Object,
            _mockStorePaymentRepository.Object,
            _mockConfigRepository.Object,
            _mockHttpContextService.Object,
            _mockLocalizer.Object);
    }

    /// <summary>
    /// Create a Store with a fixed ID using the private 7-param factory via reflection.
    /// </summary>
    private static Store CreateStoreWithId(Guid id, string name, Owner owner, DateOnly? paymentStartDate = null)
    {
        var method = typeof(Store).GetMethods(System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic)
            .FirstOrDefault(m => m.Name == "Create" && m.GetParameters().Length == 8);
        if (method is null)
            throw new InvalidOperationException("Cannot find private Store.Create factory with 8 params");

        var store = (Store)method.Invoke(null, new object?[] {
            id, owner.Id, name, true, Guid.NewGuid(), paymentStartDate ?? PaymentStartPorVencer, null, null
        })!;

        store.Owner = owner;
        store.StoreModules.Clear();
        return store;
    }

    private static Owner CreateOwnerWithUser(string fullName)
    {
        var userId = Guid.NewGuid();
        var owner = Owner.Create(userId, false, TenantId, "Test Owner");
        var user = User.Create("test@test.com", "hash", fullName, null, "test@test.com", TenantId);
        // Store the user's actual ID for the navigation
        owner.User = user;
        // Ensure the Owner's UserId matches
        var userIdField = typeof(Owner).GetField("<UserId>k__BackingField",
            System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic);
        userIdField?.SetValue(owner, user.Id);
        return owner;
    }

    private static StoreModule CreatePaidStoreModule(int moduleId, float price)
        => StoreModule.Create(Guid.Empty, moduleId, price, false, price, 0, 0, Guid.Empty);

    #region Authorization

    [Fact]
    public async Task Handle_nonSuperAdmin_nonReSeller_throwsApiException()
    {
        // Arrange
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(false);

        // Act
        var act = () => _handler.Handle(new GetStoresToCollectQuery(), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
    }

    #endregion

    #region SuperAdmin: filtering

    [Fact]
    public async Task Handle_superAdmin_filtersToPorVencerAndEnGracia()
    {
        // Arrange
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(false);

        var owner = CreateOwnerWithUser("Test Owner");

        // Store 1: PorVencer — no payments → nextDue = PaymentStartPorVencer + trial(1) + 1 = Today + 3d
        var store1Id = Guid.NewGuid();
        var store1 = CreateStoreWithId(store1Id, "Store PorVencer", owner);
        store1.StoreModules.Add(CreatePaidStoreModule(1, 2000f));

        // Store 2: AlDia — has a payment far in the future
        var store2Id = Guid.NewGuid();
        var store2 = CreateStoreWithId(store2Id, "Store AlDia", owner);
        store2.StoreModules.Add(CreatePaidStoreModule(2, 1000f));

        _mockStoreRepository
            .Setup(x => x.GetPaidStoresAsync())
            .ReturnsAsync(new[] { store1, store2 });

        // Store1: no payments → nextDue ≈ Today + 3d → PorVencer
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(store1Id))
            .ReturnsAsync((StorePayment?)null);

        // Store2: has payment with PaymentBeforeDate far in future → AlDia
        var payment = StorePayment.Create(
            storeId: store2Id,
            storePaymentStatusId: 5,
            price: 1000f,
            paymentBeforeDate: new DateTimeOffset(Today.AddMonths(3).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            year: Today.AddMonths(3).Year, month: Today.AddMonths(3).Month, tenantId: TenantId,
            reSellerId: null, reSellerPercentDiscountPrice: 0, reSellerDiscountPrice: 0,
            reSellerAmount: 0, byReSeller: false);
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(store2Id))
            .ReturnsAsync(payment);

        // Act
        var result = await _handler.Handle(new GetStoresToCollectQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        var data = result.Data.ToList();

        // Store2 (AlDia with far-ahead due) should be filtered out
        data.Should().ContainSingle();
        data[0].StoreId.Should().Be(store1Id);
        data[0].StoreName.Should().Be("Store PorVencer");
        data[0].OwnerName.Should().Be("Test Owner");
        data[0].Amount.Should().Be(2000f);
    }

    [Fact]
    public async Task Handle_superAdmin_returnsNoResults_whenAllStoresAreAlDia()
    {
        // Arrange
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(false);

        var owner = CreateOwnerWithUser("Owner");
        var storeId = Guid.NewGuid();
        var store = CreateStoreWithId(storeId, "AlDia Store", owner);
        store.StoreModules.Add(CreatePaidStoreModule(1, 2000f));

        _mockStoreRepository
            .Setup(x => x.GetPaidStoresAsync())
            .ReturnsAsync(new[] { store });

        // Payment with far-ahead date → AlDia
        var payment = StorePayment.Create(
            storeId: storeId,
            storePaymentStatusId: 5,
            price: 2000f,
            paymentBeforeDate: new DateTimeOffset(Today.AddYears(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            year: Today.AddYears(1).Year, month: Today.AddYears(1).Month, tenantId: TenantId,
            reSellerId: null, reSellerPercentDiscountPrice: 0, reSellerDiscountPrice: 0,
            reSellerAmount: 0, byReSeller: false);
        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(storeId))
            .ReturnsAsync(payment);

        // Act
        var result = await _handler.Handle(new GetStoresToCollectQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeEmpty();
    }

    #endregion

    #region ReSeller: scope

    [Fact]
    public async Task Handle_reSeller_callsScopedRepoOnly()
    {
        // Arrange
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(true);
        _mockHttpContextService.Setup(x => x.UserExternalId).Returns(_reSellerUserId.ToString());

        var owner = CreateOwnerWithUser("ReSeller Owner");
        var storeId = Guid.NewGuid();
        var store = CreateStoreWithId(storeId, "ReSeller Store", owner);
        store.StoreModules.Add(CreatePaidStoreModule(1, 1500f));

        _mockStoreRepository
            .Setup(x => x.GetPaidStoresByReSellerUserAsync(_reSellerUserId))
            .ReturnsAsync(new[] { store });

        _mockStorePaymentRepository
            .Setup(x => x.GetLastByStoreIdAsync(storeId))
            .ReturnsAsync((StorePayment?)null);

        // Act
        var result = await _handler.Handle(new GetStoresToCollectQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();

        _mockStoreRepository.Verify(
            x => x.GetPaidStoresByReSellerUserAsync(_reSellerUserId),
            Times.Once);
        _mockStoreRepository.Verify(
            x => x.GetPaidStoresAsync(),
            Times.Never);
    }

    #endregion
}