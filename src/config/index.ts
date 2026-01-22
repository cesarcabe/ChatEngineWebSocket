import { config } from 'dotenv';

// Load environment variables
config();

export const CONFIG = {
  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    jwtSecret: process.env.SUPABASE_JWT_SECRET!,
  },

  // ChatEngine
  chatengine: {
    jwtSecret: process.env.CHATENGINE_JWT_SECRET!,
  },

  // Evolution API
  evolution: {
    baseUrl: process.env.EVOLUTION_API_BASE_URL!,
    apiKey: process.env.EVOLUTION_API_KEY!,
  },

  // Server
  server: {
    port: parseInt(process.env.PORT || '3001'),
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
} as const;

// Validate required configuration
export function validateConfig(): void {
  const required = [
    'supabase.url',
    'supabase.anonKey',
    'supabase.serviceRoleKey',
    'supabase.jwtSecret',
    'evolution.baseUrl',
    'evolution.apiKey',
  ];

  const missing = required.filter(key => {
    const keys = key.split('.');
    let value: any = CONFIG;
    for (const k of keys) {
      value = value[k];
    }
    return !value;
  });

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
}