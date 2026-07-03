import * as Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'staging', 'production').default('development'),
  APP_NAME: Joi.string().default('Granada Kost API'),
  API_PREFIX: Joi.string().default('api/v1'),
  HOST: Joi.string().default('0.0.0.0'),
  PORT: Joi.number().port().default(3000),
  PUBLIC_BASE_URL: Joi.string().uri().optional(),
  CORS_ALLOWED_ORIGINS: Joi.string().default('http://localhost:8080,http://localhost:8081'),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent').default('info'),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).default(30),
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: Joi.number().integer().min(1).default(5),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: Joi.number().integer().min(60).default(300),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).optional(),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(5432),
  DB_USER: Joi.string().default('postgres'),
  DB_PASSWORD: Joi.string().allow('').default('postgres'),
  DB_NAME: Joi.string().default('granada_kost'),
  DB_SSL: Joi.boolean().truthy('true').falsy('false').default(false),

  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).optional(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().integer().min(0).default(0),
  REDIS_KEY_PREFIX: Joi.string().default('granada:'),

  BREVO_API_KEY: Joi.string().allow('').optional(),
  BREVO_DAILY_LIMIT: Joi.number().integer().min(1).default(300),
  FONNTE_API_KEY: Joi.string().allow('').optional(),
  FONNTE_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  PUSH_NOTIFICATION_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),

  UPLOAD_STORAGE_PATH: Joi.string().default('./uploads'),
  UPLOAD_MAX_FILE_SIZE_MB: Joi.number().integer().min(1).max(5).default(5),
  UPLOAD_PROPERTY_QUOTA_MB: Joi.number().integer().min(1).optional(),

  SMART_LOCK_PROVIDER: Joi.string().valid('simulated', 'tuya').default('simulated'),
  SMART_LOCK_LIVE_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  SMART_LOCK_COMMAND_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(15000),
  SMART_LOCK_MAX_UNLOCK_PER_MINUTE: Joi.number().integer().min(1).optional(),
  TUYA_CLIENT_ID: Joi.when('SMART_LOCK_PROVIDER', {
    is: 'tuya',
    then: Joi.string().trim().min(1).required().messages({
      'any.required': 'CONFIG_MISSING: TUYA_CLIENT_ID is required when SMART_LOCK_PROVIDER=tuya',
      'string.empty': 'CONFIG_MISSING: TUYA_CLIENT_ID must not be empty when SMART_LOCK_PROVIDER=tuya',
    }),
    otherwise: Joi.string().allow('').optional(),
  }),
  TUYA_CLIENT_SECRET: Joi.when('SMART_LOCK_PROVIDER', {
    is: 'tuya',
    then: Joi.string().trim().min(1).required().messages({
      'any.required': 'CONFIG_MISSING: TUYA_CLIENT_SECRET is required when SMART_LOCK_PROVIDER=tuya',
      'string.empty': 'CONFIG_MISSING: TUYA_CLIENT_SECRET must not be empty when SMART_LOCK_PROVIDER=tuya',
    }),
    otherwise: Joi.string().allow('').optional(),
  }),
  TUYA_REGION: Joi.string().valid('sg', 'us', 'ueaz', 'eu', 'weaz', 'cn').allow('').optional(),
  TUYA_BASE_URL: Joi.string().uri().allow('').optional(),
  TUYA_PROJECT_ID: Joi.string().allow('').optional(),
  TUYA_DEVICE_ID_TEST: Joi.string().allow('').optional(),
});
