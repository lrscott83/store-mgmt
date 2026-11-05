using System.Reflection;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Controllers;
using SMCA.WebApi.Controllers.v1;

namespace Application.Tests.WebApi;

/// <summary>
/// Guards the contract documentation of the Auth &amp; access block (finding X4): every action of
/// these five controllers must tell the client, through <see cref="ProducesResponseTypeAttribute"/>,
/// (a) the success payload it really returns — typed, never a bare status — and (b) at least one
/// non-success status, so an error is a documented outcome instead of a surprise.
/// </summary>
/// <remarks>
/// Plain reflection over the controller types: no web host, no DI, no database. The attributes are
/// the contract, so reading them from the compiled types is exactly the thing under test.
/// </remarks>
public sealed class ApiContractProducesResponseTypeTests
{
    private static readonly Type[] ControllersInBlock =
    [
        typeof(AuthController),
        typeof(UsersController),
        typeof(StoreUsersController),
        typeof(PingController),
        typeof(NotificationsController),
    ];

    public static TheoryData<Type> Controllers()
    {
        var data = new TheoryData<Type>();
        foreach (var controller in ControllersInBlock)
            data.Add(controller);

        return data;
    }

    [Fact]
    public void Block_covers_every_controller_it_claims_to_guard()
    {
        // A guard on the guard: if a controller is renamed or moved, the theory above stops
        // protecting it silently. Fail loudly instead.
        ControllersInBlock.Should().HaveCount(5)
            .And.OnlyContain(t => typeof(ControllerBase).IsAssignableFrom(t));
    }

    [Theory]
    [MemberData(nameof(Controllers))]
    public void Every_action_declares_at_least_one_non_success_response(Type controller)
    {
        var actions = GetActions(controller);

        actions.Should().NotBeEmpty($"reflection must find the actions of {controller.Name}");

        foreach (var action in actions)
        {
            var nonSuccess = GetDeclaredResponses(action)
                .Where(r => r.StatusCode >= 400)
                .ToList();

            nonSuccess.Should().NotBeEmpty(
                $"{controller.Name}.{action.Name} must document at least one non-success status it can return");
        }
    }

    [Theory]
    [MemberData(nameof(Controllers))]
    public void Every_action_declares_a_typed_success_response(Type controller)
    {
        var actions = GetActions(controller);

        actions.Should().NotBeEmpty($"reflection must find the actions of {controller.Name}");

        foreach (var action in actions)
        {
            var typedSuccess = GetDeclaredResponses(action)
                .Where(r => r.StatusCode is >= 200 and < 300 && r.Type is not null)
                .ToList();

            typedSuccess.Should().NotBeEmpty(
                $"{controller.Name}.{action.Name} must document its success status with a response payload type");
        }
    }

    /// <summary>
    /// Public instance actions declared on the controller itself (not inherited from
    /// <see cref="ControllerBase"/>), i.e. the methods that answer a route.
    /// </summary>
    private static IReadOnlyList<MethodInfo> GetActions(Type controller)
    {
        return controller
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => !m.IsSpecialName)
            .Where(m => ReturnsActionResult(m.ReturnType))
            .ToList();
    }

    /// <summary>The action return type is either <see cref="IActionResult"/> or <c>Task&lt;IActionResult&gt;</c>.</summary>
    private static bool ReturnsActionResult(Type returnType)
    {
        if (typeof(IActionResult).IsAssignableFrom(returnType))
            return true;

        if (!returnType.IsGenericType || returnType.GetGenericTypeDefinition() != typeof(Task<>))
            return false;

        return typeof(IActionResult).IsAssignableFrom(returnType.GetGenericArguments()[0]);
    }

    private static IReadOnlyList<ProducesResponseTypeAttribute> GetDeclaredResponses(MethodInfo action)
    {
        return action.GetCustomAttributes<ProducesResponseTypeAttribute>(inherit: true).ToList();
    }
}
