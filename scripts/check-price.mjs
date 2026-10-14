// Read-only provider observation. Run on a weekend to collect actual timestamp evidence.
const now = new Date();
const response = await fetch('https://api.gold-api.com/price/XAU/GBP', { signal: AbortSignal.timeout(10000) });
if (!response.ok) throw Error(`Provider returned HTTP ${response.status}`);
const data = await response.json();
console.log(JSON.stringify({ observedAt: now.toISOString(), providerAt: data.updatedAt, ageSeconds: (now.getTime()-Date.parse(data.updatedAt))/1000, symbol:data.symbol, currency:data.currency, price:data.price, note:'Observation only; does not change QuoteLedger freshness policy.' },null,2));
