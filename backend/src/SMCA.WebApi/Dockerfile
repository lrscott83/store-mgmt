#See https://aka.ms/customizecontainer to learn how to customize your debug container and how Visual Studio uses this Dockerfile to build your images for faster debugging.

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
USER app
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["SMCA.WebApi/SMCA.WebApi.csproj", "SMCA.WebApi/"]
RUN dotnet restore "./SMCA.WebApi/./SMCA.WebApi.csproj"
COPY . .
WORKDIR "/src/SMCA.WebApi"
RUN dotnet build "./SMCA.WebApi.csproj" -c $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./SMCA.WebApi.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
# Storage de imágenes del catálogo (Storage:CatalogImageRoot = storage/catalog → /app/storage en el
# contenedor). El contenedor corre como `app` (no-root) y /app es propiedad de root: sin este
# directorio precreado, el primer Directory.CreateDirectory("/app/storage") del backend revienta
# con UnauthorizedAccessException ("Access to the path '/app/storage' is denied") y subir una
# imagen al catálogo devuelve "No se pudo actualizar el producto". `chown -R` cubre también
# restores de volúmenes que llegan con dueño root.
RUN mkdir -p /app/storage && chown -R app:app /app/storage
ENTRYPOINT ["dotnet", "SMCA.WebApi.dll"]