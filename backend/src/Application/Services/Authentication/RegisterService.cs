using Application.Exceptions;
using Domain.Entities.Owners;
using Domain.Entities.ReSellerOwners;
using Domain.Entities.ReSellers;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Authentication;
using Domain.Interfaces.Services.Owners;
using Domain.Interfaces.Services.Stores;
using Microsoft.Extensions.Logging;
using System.Net;

namespace Application.Services.Authentication
{
    /// <inheritdoc cref="IRegisterService"/>
    /// <remarks>
    /// Body moved verbatim from RegisterCommandHandler so the public registration keeps its exact
    /// observable behavior. What changed is WHO calls it: the Gestor owner-create path now runs
    /// the same steps instead of creating a bare owner.
    /// </remarks>
    public class RegisterService : IRegisterService
    {
        private readonly ICreateOwnerService _createOwnerService;
        private readonly ICreateStoreService _createStoreService;
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IReSellerOwnerRepository _reSellerOwnerRepository;
        private readonly ILogger<RegisterService> _logger;

        public RegisterService(
            ICreateOwnerService createOwnerService,
            ICreateStoreService createStoreService,
            IReSellerRepository reSellerRepository,
            IReSellerOwnerRepository reSellerOwnerRepository,
            ILogger<RegisterService> logger)
        {
            _createOwnerService = createOwnerService;
            _createStoreService = createStoreService;
            _reSellerRepository = reSellerRepository;
            _reSellerOwnerRepository = reSellerOwnerRepository;
            _logger = logger;
        }

        public async Task<Owner> RegisterAsync(
            string login,
            string password,
            string fullName,
            string cellPhone,
            string? email,
            string storeName,
            string? ownerDescription,
            string? reSellerLogin,
            CancellationToken cancellationToken)
        {
            // Create Owner
            Owner owner = await _createOwnerService.CreateOwnerAsync(login, password, fullName,
                cellPhone, email, ownerDescription ?? string.Empty);

            // Create Store
            // store-birth-superior (2026-10-11, replaces store-birth-pago-only): the birth plan
            // AND its module set are CreateStoreService's decision, not this service's. Registration
            // passes no modules — the service grants exactly the Superior (3) catalog filtered by
            // Module.IsActive && Module.AvailableToStore, which keeps plan/module coherence (the
            // store pays for what it gets) and keeps the VIP-only 16 (Múltiples pagos) out of it.
            // All creation paths force approved=true (product decision 2026-09-10) so the store
            // is usable without a separate admin act.
            var store = await _createStoreService.CreateStoreAsync(owner.Id, owner.TenantId, storeName, null,
                "Tienda de prueba", true);

            // FIX: Add null check to prevent NullReferenceException
            if (owner.User == null)
                throw new ApiException("Registration failed: user was not created properly.",
                    HttpStatusCode.InternalServerError)
                {
                    AcctionCode = "Register.OwnerUserNotCreated"
                };

            owner.User.SelectedStoreId = store.Id;

            if (!string.IsNullOrEmpty(reSellerLogin))
            {
                ReSeller? reSeller = null;
                try
                {
                    reSeller = await _reSellerRepository.GetByUserNameAsync(reSellerLogin);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "ReSeller lookup failed for code {Code}, continuing registration without ReSeller association", reSellerLogin);
                    reSeller = null;
                }

                if (reSeller != null)
                {
                    try
                    {
                        ReSellerOwner reSellerOwner = ReSellerOwner.Create(reSeller.Id, owner.Id, reSeller.DiscountPrice, reSeller.PercentDiscountPrice, owner.TenantId);
                        await _reSellerOwnerRepository.AddAsync(reSellerOwner);
                    }
                    catch (Exception)
                    {
                        throw new ApiException("Failed to associate with reseller.",
                            HttpStatusCode.InternalServerError)
                        {
                            AcctionCode = "Register.ReSellerAssociationFailed"
                        };
                    }
                }
            }

            // NOTE: no SaveChanges here by contract — the caller commits once, at the end.
            return owner;
        }
    }
}