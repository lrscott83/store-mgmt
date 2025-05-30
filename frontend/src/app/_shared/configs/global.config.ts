import { EFeatures, SignatureProvider } from '../const/enums';


export const GlobalConfig = {
    ONLY_DATE_FORMAT: 'dd/MM/yyyy',
    DATE_TIME_FORMAT: 'dd/MM/yyyy, h:mm a',
    TIME_FORMAT: 'h:mm a',
    SUPER_ADMIN_EXPECTED_FEATURES: [EFeatures.Owners, EFeatures.Owners, EFeatures.Owners, EFeatures.Owners],
    RESELLER_EXPECTED_FEATURES: [EFeatures.Owners, EFeatures.Profile],
    USE_ONLINE_SERVICE: false,
}