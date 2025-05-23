import Redis from 'ioredis';
import { config } from 'dotenv';

config(); // Load environment variables

const REDIS_URL = process.env.REDIS_URL || '';

if (!REDIS_URL) {
    console.error('Redis URL is not provided in environment variables');
    process.exit(1);
}

// Create Redis instance
const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    reconnectOnError(err) {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
            // Only reconnect when the error contains "READONLY"
            return true;
        }
        return false;
    },
});

// Redis event handlers
redis.on('connect', () => {
    console.log('✅ Redis client connected');
});

redis.on('error', (error) => {
    console.error('❌ Redis client error:', error);
});

redis.on('ready', () => {
    console.log('✅ Redis client ready');
});

redis.on('reconnecting', () => {
    console.log('🔄 Redis client reconnecting');
});

export default redis; 