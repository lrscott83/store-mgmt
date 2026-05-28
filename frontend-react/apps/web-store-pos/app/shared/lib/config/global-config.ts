export const GlobalConfig = {
  USE_ONLINE_SERVICE: false,
  APP_VERSION: (import.meta.env['APP_VERSION'] as string | undefined) ?? '1.0.0',
  DATE_FORMAT: 'dd/MM/yyyy',
  DATE_TIME_FORMAT: 'dd/MM/yyyy HH:mm',
} as const;
