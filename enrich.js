// Scryfall enrichment for the pool analyzer — resolves card names to
// { type_line, mana_cost, cmc, color_identity, image_uri } via /cards/collection
// (75 identifiers per POST). Runs in the extension page (api.scryfall.com is in
// host_permissions + CSP connect-src) and in Node (for tests). Dual-mode export.
(function (global) {
  const SCRYFALL = "https://api.scryfall.com/cards/collection";
  // Scryfall rejects requests with a default/blank User-Agent (400
  // generic_user_agent). Browsers ignore this forbidden header and send their
  // own UA; Node uses the one we set here. Either way Scryfall is satisfied.
  const HEADERS = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "deckCompare/0.4 (Duel Commander pool analyzer)",
  };

  const chunk = (arr, n) => {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Lookup keys for a card name: the full name + the front face of a DFC.
  function nameKeys(name) {
    const lower = String(name).toLowerCase().trim();
    const front = lower.split(" // ")[0].trim();
    return front !== lower ? [lower, front] : [lower];
  }

  function toEnriched(c) {
    const faces = c.card_faces || [];
    const image =
      (c.image_uris && c.image_uris.normal) ||
      (faces[0] && faces[0].image_uris && faces[0].image_uris.normal) ||
      null;
    const manaCost = c.mana_cost && c.mana_cost.length ? c.mana_cost : (faces[0] && faces[0].mana_cost) || null;
    return {
      name: c.name,
      type_line: c.type_line || null,
      mana_cost: manaCost || null,
      cmc: typeof c.cmc === "number" ? c.cmc : null,
      color_identity: c.color_identity ? JSON.stringify(c.color_identity) : null,
      image_uri: image,
    };
  }

  // POST one batch, retrying transient errors (429 / 5xx) a few times.
  async function postBatch(identifiers) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(SCRYFALL, { method: "POST", headers: HEADERS, body: JSON.stringify({ identifiers }) });
        if (res.ok) return await res.json();
        if (res.status === 429 || res.status >= 500) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        return null; // other 4xx — don't retry
      } catch (e) {
        await sleep(500 * (attempt + 1));
      }
    }
    return null;
  }

  // Per-card fallback (when /cards/collection is down or didn't resolve a name).
  async function getNamed(name) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`, { headers: HEADERS });
        if (res.ok) return await res.json();
        if (res.status === 429 || res.status >= 500) {
          await sleep(600 * (attempt + 1));
          continue;
        }
        return null; // 404 = no exact match
      } catch (e) {
        await sleep(400);
      }
    }
    return null;
  }

  // names[] -> Map keyed by nameKeys (lowercased; full + DFC front face).
  async function enrichCards(names) {
    const unique = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))];
    const map = new Map();
    const batches = chunk(unique, 75);
    for (let i = 0; i < batches.length; i++) {
      const data = await postBatch(batches[i].map((name) => ({ name })));
      if (data) {
        for (const c of data.data || []) {
          const enriched = toEnriched(c);
          for (const k of nameKeys(c.name)) if (!map.has(k)) map.set(k, enriched);
        }
      }
      if (i < batches.length - 1) await sleep(120);
    }

    // Fallback: resolve names the batch endpoint missed (e.g. /cards/collection
    // outage) one-by-one via /cards/named. No-op when collection succeeded.
    const missing = unique.filter((n) => !enrichmentFor(map, n)).slice(0, 250);
    for (const name of missing) {
      const c = await getNamed(name);
      if (c) {
        const enriched = toEnriched(c);
        for (const k of nameKeys(c.name)) if (!map.has(k)) map.set(k, enriched);
        for (const k of nameKeys(name)) if (!map.has(k)) map.set(k, enriched);
      }
      await sleep(90);
    }
    return map;
  }

  function enrichmentFor(map, name) {
    for (const k of nameKeys(name)) {
      const hit = map.get(k);
      if (hit) return hit;
    }
    return null;
  }

  const api = { enrichCards, enrichmentFor, nameKeys };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Enrich = api;
})(typeof window !== "undefined" ? window : globalThis);
