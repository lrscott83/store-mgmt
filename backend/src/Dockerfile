FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8000
ENV ASPNETCORE_URLS=http://+:8000
RUN groupadd -g 2000 dotnet \
    && useradd -m -u 2000 -g 2000 dotnet
USER dotnet

# This stage is used to build the service project
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
ARG BUILD_CONFIGURATION=Release
ARG DOTNET_SKIP_POLICY_LOADING=true
WORKDIR /src
COPY ["SMCA.WebApi/SMCA.WebApi.csproj", "SMCA.WebApi/"]
# COPY ["Contact.Application/Contact.Application.csproj", "Contact.Application/"]
# COPY ["Contact.Domain/Contact.Domain.csproj", "Contact.Domain/"]
# COPY ["Contact.Infrastructure/Contact.Infrastructure.csproj", "Contact.Infrastructure/"]
# COPY ["Contact.Common/Contact.Common.csproj", "Contact.Common/"]

RUN dotnet restore "./SMCA.WebApi/SMCA.WebApi.csproj"
COPY . .
WORKDIR "/src/SMCA.WebApi"
RUN dotnet build "./SMCA.WebApi.csproj" -c $BUILD_CONFIGURATION -o /app/build

RUN ls /app/build

# This stage is used to publish the service project to be copied to the final stage
FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./SMCA.WebApi.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

# This stage is used in production or when running from VS in regular mode (Default when not using the Debug configuration)
FROM base AS final
WORKDIR /app
# COPY --from=publish /app/publish/SMCA.WebApi.dll .
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "SMCA.WebApi.dll"]
