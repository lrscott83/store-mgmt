using Application.Abstractions.Authentication;
using Application.Abstractions.Features;
using Application.Abstractions.Roles;
using Application.Behaviours;
using Application.Services.Authentication;
using Application.Services.Billing;
using Application.Services.Features;
using Application.Services.Owners;
using Application.Services.Roles;
using Application.Services.Stores;
using Domain.Entities.Stores;
using Domain.Entities.Tenants;
using Domain.Interfaces.Services.Billing;
using Domain.Interfaces.Services.Owners;
using Domain.Interfaces.Services.Stores;
using Domain.Interfaces.Services.Tenants;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using System.Reflection;

namespace Application
{
    public static class DependencyInjection
    {
        public static IServiceCollection AddApplication(this IServiceCollection services)
        {
            var assembly = typeof(DependencyInjection).Assembly;
            services.AddMediatR(cfg =>
            {
                cfg.RegisterServicesFromAssembly(assembly);
                cfg.AddOpenBehavior(typeof(UnitOfWorkBehaviour<,>));
            });
            services.AddValidatorsFromAssembly(assembly);

            services.AddAutoMapper(Assembly.GetExecutingAssembly());
            services.AddValidatorsFromAssembly(Assembly.GetExecutingAssembly());
            services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));

            //services.AddScoped<IApplicationRoleGenerator, ApplicationRoleGenerator>();

            services.AddScoped<IAuthenticationService, AuthenticationService>();
            services.AddScoped<ICreateTenantService, CreateTenantService>();
            services.AddScoped<IUpdateTenantService, UpdateTenantService>();
            services.AddScoped<IStoreRoleFeatureGenerator, StoreRoleFeatureGenerator>();

            services.AddScoped<IVisibleRoleService, VisibleRoleService>();
            services.AddScoped<IRoleFilter, RoleFilter>();

            services.AddScoped<IGetStoreByIdService, GetStoreByIdService>();
            services.AddScoped<ICreateStoreService, CreateStoreService>();
            services.AddScoped<IAllowedFeaturesService, AllowedFeaturesService>();

            services.AddScoped<ICreateOwnerService, CreateOwnerService>();

            services.AddScoped<IBillingService, BillingService>();
            services.AddScoped<IStoreBillingService, StoreBillingService>();

            return services;
        }
    }
}
