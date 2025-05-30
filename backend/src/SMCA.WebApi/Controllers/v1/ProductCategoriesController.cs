using Application.Dtos.SaleManagement;
using Application.Features.SaleManagement.ProductCategories.Queries.GetAllProductCategories;
using Application.Features.SaleManagement.ProductCategories.Queries.GetProductCategoriesView;
using Application.ResponseModels;
using Asp.Versioning;
using Domain.Common.Enums;
using Microsoft.AspNetCore.Mvc;
using SMCA.WebApi.Filters;

namespace SMCA.WebApi.Controllers.v1
{
    [ApiVersion("1.0")]
    [HasPermission(StoreRoleFeatures.ProductsAdmin)]
    public class ProductCategoriesController : BaseApiController
    {
        /// <summary>
        /// Get all categories
        /// </summary>
        /// <returns></returns>
        [HttpGet("all/{includeInactive}")]
        [ProducesResponseType(typeof(ResponseResult<List<ProductCategoryDto>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetAllProductCategoriesAsync(bool includeInactive)
        {
            return Ok(await Sender.Send(new GetAllProductCategoriesQuery(includeInactive)));
        }


        /// <summary>
        /// Get ProductCategoriesView
        /// </summary>
        /// <returns></returns>
        [HttpGet("catalog")]
        [ProducesResponseType(typeof(ResponseResult<List<ProductCategoryView>>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetProductCategoriesViewAsync()
        {
            return Ok(await Sender.Send(new GetProductCategoriesViewQuery()));
        }

        ///// <summary>
        ///// Get user by id
        ///// </summary>
        ///// <param name="id">ProductCategory Id</param>
        ///// <returns></returns>
        //[HttpGet("{id}")]
        //[ProducesResponseType(typeof(ResponseResult<ProductCategoryDto>), StatusCodes.Status200OK)]
        //public async Task<IActionResult> GetProductCategoryAsync(Guid id)
        //{
        //    return Ok(await Sender.Send(new GetProductCategoryByIdQuery(id)));
        //}

        ///// <summary>
        ///// Add user
        ///// </summary>
        ///// <returns></returns>
        //[HttpPost()]
        //[ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        //public async Task<IActionResult> CreateProductCategoryAsync(CreateProductCategoryCommand command)
        //{
        //    return Ok(await Sender.Send(command));
        //}

        ///// <summary>
        ///// Updated user by id
        ///// </summary>
        //[HttpPut("{id}")]
        //[ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        //public async Task<IActionResult> UpdatedAsync(Guid id, [FromBody] UpdateProductCategoryCommand command)
        //{
        //    command.Id = id;
        //    return Ok(await Sender.Send(command));
        //}

        ///// <summary>
        ///// Delete user by id
        ///// </summary>
        //[HttpDelete("{id}")]
        //[ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
        //public async Task<IActionResult> DeleteProductCategoryAsync(Guid id)
        //{
        //    return Ok(await Sender.Send(new DeleteProductCategoryCommand(id)));
        //}
    }
}
