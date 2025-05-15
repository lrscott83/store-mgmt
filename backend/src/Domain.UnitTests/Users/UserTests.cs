using Domain.Entities.Users;
using FluentAssertions;

namespace Domain.UnitTests.Users
{
    public class UserTests
    {
        [Fact]
        public void Create_Should_ReturnUser_WhenNameIsValid()
        {
            //// Arrange
            //var name = new Name("Full Name");

            //// Act
            //var user = User.Create(name);

            //// Assert
            //user.Should().NotBeNull();
        }

        [Fact]
        public void Create_Should_RaiseDomainEvent_WhenNameIsValid()
        {
            //// Arrange
            //var name = new Name("Full Name");

            //// Act
            //var user = User.Create(name);

            //// Assert
            //user.GetDomainEvents().Should().ContainSingle()
            //    .Which.Should().BeOfType<UserCreatedDomainEvent>();
        }
    }
}
