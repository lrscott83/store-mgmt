using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Domain.Common.Utils
{
    public static class CurrentPriceServiceUtils
    {
        public static float GetCurrentPrice(float price, float percentDiscountPrice, float discountPrice)
        {
            float currentPrice = price - price * percentDiscountPrice / 100 - discountPrice;
            if (currentPrice < 0)
                currentPrice = 0;
            return currentPrice;
        }
    }
}
