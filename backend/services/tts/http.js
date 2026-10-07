const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function networkCode(err) {
  return err?.cause?.code || err?.code || (err?.name === "TimeoutError" ? "ETIMEDOUT" : undefined);
}

/**
 * fetch() with a per-attempt timeout and a couple of retries for the kinds
 * of failures a tunnelled Colab connection produces (dropped connection,
 * gateway errors). Does NOT retry ECONNREFUSED - nothing is listening, so
 * waiting won't change that - or ordinary 4xx errors.
 */
export async function fetchWithRetry(url, options = {}, { retries = 2, timeoutMs = 120000, retryStatuses = [429, 502, 503, 504, 524] } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      if (retryStatuses.includes(res.status) && attempt < retries) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (networkCode(err) === "ECONNREFUSED" || attempt === retries) throw err;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}
