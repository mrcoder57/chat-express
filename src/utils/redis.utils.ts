import redis from '../config/redis';

export class RedisUtils {
    /**
     * Set a key-value pair with optional expiration
     * @param key Redis key
     * @param value Value to store
     * @param expiryInSeconds Expiration time in seconds (optional)
     */
    static async set(key: string, value: any, expiryInSeconds?: number): Promise<'OK'> {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        if (expiryInSeconds) {
            return redis.set(key, stringValue, 'EX', expiryInSeconds);
        }
        return redis.set(key, stringValue);
    }

    /**
     * Get value by key
     * @param key Redis key
     * @returns Stored value or null if not found
     */
    static async get(key: string): Promise<any> {
        const value = await redis.get(key);
        if (!value) return null;
        
        try {
            return JSON.parse(value);
        } catch {
            return value; // Return as is if not JSON
        }
    }

    /**
     * Delete a key
     * @param key Redis key
     * @returns Number of keys removed
     */
    static async delete(key: string): Promise<number> {
        return redis.del(key);
    }

    /**
     * Check if a key exists
     * @param key Redis key
     * @returns Boolean indicating if key exists
     */
    static async exists(key: string): Promise<boolean> {
        const result = await redis.exists(key);
        return result === 1;
    }

    /**
     * Set key expiration
     * @param key Redis key
     * @param expiryInSeconds Expiration time in seconds
     */
    static async setExpiry(key: string, expiryInSeconds: number): Promise<number> {
        return redis.expire(key, expiryInSeconds);
    }

    /**
     * Add to a sorted set
     * @param key Redis key
     * @param score Score for sorting
     * @param member Member to add
     */
    static async addToSortedSet(key: string, score: number, member: string): Promise<number> {
        return redis.zadd(key, score, member);
    }

    /**
     * Get range from sorted set
     * @param key Redis key
     * @param start Start index
     * @param stop Stop index
     * @returns Array of members
     */
    static async getRangeFromSortedSet(key: string, start: number, stop: number): Promise<string[]> {
        return redis.zrange(key, start, stop);
    }
} 