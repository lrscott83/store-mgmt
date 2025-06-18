using Application.Dtos.SaleManagement;
using Application.Features.SaleManagement.Products.Commands.CreateProduct;
using Application.Features.SaleManagement.Products.Commands.CreateProducts;
using Application.Features.SaleManagement.Products.Commands.DeleteProduct;
using Application.Features.SaleManagement.Products.Commands.ImportCsvProducts;
using Application.Features.SaleManagement.Products.Commands.UpdateProduct;
using Application.Features.SaleManagement.Products.Queries.GetAvailableProductsByCategoryId;
using Application.Features.SaleManagement.Products.Queries.GetAvailableToSaleProductsByCategoryId;
using Application.Features.SaleManagement.Products.Queries.GetMaxProductOrderByCategoryId;
using Application.Features.SaleManagement.Products.Queries.GetProductById;
using Application.Features.SaleManagement.Products.Queries.GetToEntryProducts;
using Application.Features.SaleManagement.Products.Queries.HasAnyAvailableToSaleProduct;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.ProductsAdmin)]
    public class ProductsController : BaseApiController
    {
        /// <summary>
        /// Get product by ID
        /// </summary>
        /// <returns></returns>
        [HttpGet("{id}")]
        [ProducesResponseType(typeof(ResponseResult<List<ProductDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetProductByIdQueryAsync(Guid id)
        {
            return Ok(await Sender.Send(new GetProductByIdQuery(id)));
        }

        /// <summary>
        /// Has any available product to sale
        /// </summary>
        /// <returns></returns>
        [HttpGet("hasAnyAvailableToSaleProduct")]
        [ProducesResponseType(typeof(ResponseResult<List<ProductDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> HasAnyAvailableToSaleProductAsync()
        {
            return Ok(await Sender.Send(new HasAnyAvailableToSaleProductQuery()));
        }

        /// <summary>
        /// Get all available products to sale
        /// </summary>
        /// <returns></returns>
        [HttpGet("toSaleByCategoryId/{categoryId}")]
        [ProducesResponseType(typeof(ResponseResult<List<ProductDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetAvailableToSaleProductsAsync(Guid categoryId)
        {
            return Ok(await Sender.Send(new GetAvailableToSaleProductsByCategoryIdQuery(categoryId)));
        }

        /// <summary>
        /// Get all available products
        /// </summary>
        /// <returns></returns>
        [HttpGet("availableByCategoryId/{categoryId}")]
        [ProducesResponseType(typeof(ResponseResult<List<ProductDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetAvailableProductsAsync(Guid categoryId)
        {
            return Ok(await Sender.Send(new GetAvailableProductsByCategoryIdQuery(categoryId)));
        }

        /// <summary>
        /// Get all products to entry
        /// </summary>
        /// <returns></returns>
        [HttpGet("toEntry")]
        [ProducesResponseType(typeof(ResponseResult<List<ProductDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetToEntryProductsAsync()
        {
            return Ok(await Sender.Send(new GetToEntryProductsQuery()));
        }

        /// <summary>
        /// Get all products to entry
        /// </summary>
        /// <returns></returns>
        [HttpDelete("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> DeleteProductAsync(Guid id)
        {
            return Ok(await Sender.Send(new DeleteProductCommant(id)));
        }


        /// <summary>
        /// Add Product
        /// </summary>
        /// <returns></returns>
        [HttpPost()]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> CreateProductAsync(CreateProductCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Updated user by id
        /// </summary>
        [HttpPut("{id}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> UpdatedAsync(Guid id, [FromBody] UpdateProductCommand command)
        {
            command.Id = id;
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Add Products
        /// </summary>
        /// <returns></returns>
        [HttpPost("createProducts")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> CreateProductsAsync(CreateProductsCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Import Products
        /// </summary>
        /// <returns></returns>
        [HttpPost("import")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> ImportProductsAsync(ImportCsvProductsCommand command)
        {
            return Ok(await Sender.Send(command));
        }

        /// <summary>
        /// Get max product order
        /// </summary>
        [HttpGet("maxOrderByCategoryId/{categoryId}")]
        [ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetMaxProductOrderByCategoryIdAsync(Guid categoryId)
        {
            return Ok(await Sender.Send(new GetMaxProductOrderByCategoryIdQuery(categoryId)));
        }

    }
}
