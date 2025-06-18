using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Dtos.SaleManagement
{
    public sealed record CsvProductDto(string CategoryName, string ProductName, decimal Price)
    {
    }
}
