export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    name: process.env.APP_NAME ?? 'Granada Kost API',
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    host: process.env.HOST ?? '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
    publicBaseUrl: process.env.PUBLIC_BASE_URL,
    corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:8080,http://localhost:8081')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    logLevel: process.env.LOG_LEVEL ?? 'info',
  },
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    name: process.env.DB_NAME ?? 'granada_kost',
    ssl: process.env.DB_SSL === 'true',
  },
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
    db: Number(process.env.REDIS_DB ?? 0),
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'granada:',
  },
  auth: {
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
    jwtAccessTtlSeconds: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
    refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
    loginRateLimitMaxAttempts: Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS ?? 5),
    loginRateLimitWindowSeconds: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS ?? 300),
  },
  notification: {
    brevoApiKey: process.env.BREVO_API_KEY,
    brevoDailyLimit: Number(process.env.BREVO_DAILY_LIMIT ?? 300),
    fonnteApiKey: process.env.FONNTE_API_KEY,
    fonnteEnabled: process.env.FONNTE_ENABLED === 'true',
    pushEnabled: process.env.PUSH_NOTIFICATION_ENABLED === 'true',
  },
  upload: {
    storagePath: process.env.UPLOAD_STORAGE_PATH ?? './uploads',
    maxFileSizeMb: Number(process.env.UPLOAD_MAX_FILE_SIZE_MB ?? 5),
    propertyQuotaMb:
      process.env.UPLOAD_PROPERTY_QUOTA_MB === undefined || process.env.UPLOAD_PROPERTY_QUOTA_MB === ''
        ? undefined
        : Number(process.env.UPLOAD_PROPERTY_QUOTA_MB),
  },
  smartLock: {
    provider: process.env.SMART_LOCK_PROVIDER ?? 'simulated',
    liveEnabled: process.env.SMART_LOCK_LIVE_ENABLED === 'true',
    commandTimeoutMs: Number(process.env.SMART_LOCK_COMMAND_TIMEOUT_MS ?? 15000),
    maxUnlockPerMinute:
      process.env.SMART_LOCK_MAX_UNLOCK_PER_MINUTE === undefined || process.env.SMART_LOCK_MAX_UNLOCK_PER_MINUTE === ''
        ? undefined
        : Number(process.env.SMART_LOCK_MAX_UNLOCK_PER_MINUTE),
    tuya: {
      // Env bootstrap secret source (local/site test only). Production path resolves
      // credentials via credential_ref through SmartLockSecretResolutionService.
      clientId: process.env.TUYA_CLIENT_ID,
      clientSecret: process.env.TUYA_CLIENT_SECRET,
      region: process.env.TUYA_REGION,
      baseUrl: process.env.TUYA_BASE_URL,
      projectId: process.env.TUYA_PROJECT_ID,
      // Diagnostic-only device id for local/site-test health checks; never used on production command paths.
      deviceIdTest: process.env.TUYA_DEVICE_ID_TEST,
    },
  },
});
