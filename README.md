# **Meowcoin Public API**

A lightweight REST API providing real-time Meowcoin blockchain metrics, including supply, block rewards, and network health.

**Base URL:**

```
https://api.mewccrypto.com
```

**API Documentation:**

- Interactive Swagger UI: `https://api.mewccrypto.com/docs`
- OpenAPI JSON Spec: `https://api.mewccrypto.com/docs.json`

This API is maintained by the **Meowcoin Foundation** and serves as the official source for supply data and reward calculations.

---

## 🚀 **Endpoints**

---

### **GET `/total-supply`**

Returns the total supply of Meowcoin based on the current UTXO set.

**Example Response**

```json
{
  "total_supply": 8361822924.945867
}
```

---

### **GET `/circulating-supply`**

Returns the circulating supply of Meowcoin.
Meowcoin has no premine or locked team allocation, so circulating supply equals mined supply minus burns.

**Example Response**

```json
{
  "circulating_supply": 8361822924.945867
}
```

---

### **GET `/block-reward`**

Returns the current block subsidy and reward split.

**Example Response**

```json
{
  "height": 1672942,
  "subsidy_total": 5000,
  "miner_reward": 3000,
  "foundation_reward": 2000,
  "miner_percentage": 60,
  "foundation_percentage": 40
}
```

---

### **GET `/reward-breakdown`**

Static reward percentages used for all blocks.

**Example Response**

```json
{
  "miner_percentage": 60,
  "foundation_percentage": 40
}
```

---

### **GET `/mining-info`**

Returns mining information including block height, difficulty, network hash rate, average block time, and block counts for both MeowPow and Scrypt algorithms. Analyzes blocks from the last 60 minutes.

**Example Response**

```json
{
  "block_height": 1672942,
  "window_minutes": 60,
  "meowpow": {
    "difficulty": 1234.567,
    "hashrate": 1234567890.123,
    "blocks_found": 22,
    "avg_block_time": 125
  },
  "scrypt": {
    "difficulty": 5678.901,
    "hashrate": 9876543210.987,
    "blocks_found": 19,
    "avg_block_time": 181
  }
}
```

---

### **GET `/health`**

Returns API health status.

**Example Response**

```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

## 📘 **Usage Examples**

### JavaScript

```js
const res = await fetch("https://api.mewccrypto.com/total-supply");
const data = await res.json();
console.log("Total Supply:", data.total_supply);
```

### Python

```python
import requests
print(requests.get("https://api.mewccrypto.com/circulating-supply").json())
```

### cURL

```bash
curl https://api.mewccrypto.com/block-reward
```

---

## 📊 **Data Sources**

* **Total supply & circulating supply**
  Derived from `gettxoutsetinfo.total_amount`.

* **Block subsidy**
  Determined by Meowcoin consensus rules:

  * Initial reward: **5000 MEWC**
  * Halving every **2,100,000 blocks**
  * Current stage: **pre-halving**

* **Reward distribution**

  * 60% → Miner
  * 40% → Meowcoin Foundation
    (`MPyNGZSSZ4rbjkVJRLn3v64pMcktpEYJnU`)

---

## 🐾 **About**

This API provides an authoritative and stable reference for:

* Exchanges
* Wallets
* Explorers
* Analytics platforms
* CoinMarketCap / CoinGecko
* Developer integrations