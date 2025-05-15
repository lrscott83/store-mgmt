
export class RegExExtensions {
    public static numeric: any = /^[0-9]\d*$/;
    public static url: string = '@^(https?|ftp)://[^\s/$.?#].[^\s]*$@iS';
    // public static currency: string = '/^(?![0.]+$)(?:0|[1-9]\d{0,2}|[1-9]\d*)(?:\.\d{1,2})?$/';
    // public static currency_OK: string = '/^(?![0,.]+$)(?:0|[1-9]\d{0,2}(?:,\d{3})*|[1-9]\d*)(?:\.\d{1,2})?$/';
    public static currency: any = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?|\.?[0-9]+$/;
}
