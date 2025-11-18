/**
 * In-memory cache for API responses
 * Provides fallback values when RPC calls fail
 */
export const Cache = {
  data: {
    total_supply: null,
    circulating_supply: null,
    block_reward: null,
    reward_breakdown: null,
    mining_info: null,
    height: null,
    miner_reward: null,
    foundation_reward: null,
  },
  updated: 0
};

/**
 * Check if cache is still valid based on TTL
 * @param {number} ttlMs - Time to live in milliseconds
 * @returns {boolean} True if cache is still valid
 */
export function isCacheValid(ttlMs) {
  if (Cache.updated === 0) return false;
  return (Date.now() - Cache.updated) < ttlMs;
}

/**
 * Clear the cache
 */
export function clearCache() {
  Cache.data = {
    total_supply: null,
    circulating_supply: null,
    block_reward: null,
    reward_breakdown: null,
    mining_info: null,
    height: null,
    miner_reward: null,
    foundation_reward: null,
  };
  Cache.updated = 0;
}

