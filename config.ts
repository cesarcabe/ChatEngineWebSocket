// Runtime configuration validation
import { CONFIG } from './src/config';

console.log('🔧 ChatEngine WebSocket Configuration:');
console.log('=====================================');
console.log(`Port: ${CONFIG.server.port}`);
console.log(`Environment: ${CONFIG.server.nodeEnv}`);
console.log(`Log Level: ${CONFIG.logging.level}`);
console.log(`Supabase URL: ${CONFIG.supabase.url ? '✅ Configured' : '❌ Missing'}`);
console.log(`Evolution API: ${CONFIG.evolution.baseUrl ? '✅ Configured' : '❌ Missing'}`);
console.log(`ChatEngine JWT: ${CONFIG.chatengine.jwtSecret ? '✅ Configured' : '❌ Missing'}`);
console.log('=====================================');

// Validate configuration
try {
  require('./src/config').validateConfig();
  console.log('✅ Configuration validation passed');
} catch (error) {
  console.error('❌ Configuration validation failed:', error.message);
  process.exit(1);
}