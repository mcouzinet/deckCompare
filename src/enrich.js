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

  // Lookup keys for a card name: the full name + the front face of a split/DFC card.
  // The front-face split mirrors Shared.normalizeName's slash tolerance — Scryfall/
  // Moxfield write "Life // Death" but mtgtop8's MTGO export writes "Life/Death", so
  // either form must key to the same enriched card.
  function nameKeys(name) {
    const lower = String(name).toLowerCase().trim();
    const front = lower.split(/\s*\/\/?\s*/)[0].trim();
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
      await slot();
      try {
        // 15 s at most: a hung request kept the page on "Enriching…" for good.
        const res = await fetch(SCRYFALL, { method: "POST", headers: HEADERS, body: JSON.stringify({ identifiers }), signal: AbortSignal.timeout(15000) });
        if (res.ok) return await res.json();
        if (res.status === 429) { nextSlot = Math.max(nextSlot, Date.now() + 30000); continue; }
        if (res.status >= 500) continue;
        return null; // other 4xx: don't retry
      } catch (e) { /* network error or timeout: the next slot retries */ }
    }
    return null;
  }

  // Per-card fallback (when /cards/collection is down or didn't resolve a name). null: Scryfall
  // has no such card; undefined: it could not answer (retry another time).
  async function getNamed(name) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await slot();
      try {
        const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
        if (res.ok) return await res.json();
        if (res.status === 429) { nextSlot = Math.max(nextSlot, Date.now() + 30000); continue; }
        if (res.status >= 500) continue;
        return null; // 404 = no exact match
      } catch (e) { /* network error or timeout: the next slot retries */ }
    }
    return undefined;
  }

  // Scryfall allows /cards/collection and /cards/named two requests a second (a 429 locks the
  // client out for about 30 s). Every request, first try, retry or per-card fallback, takes the
  // next start slot, this far after the previous one; a 429 moves every later slot past the
  // lockout.
  const SPACING = 550;
  let nextSlot = 0;
  function slot() {
    const now = Date.now();
    const at = Math.max(now, nextSlot);
    nextSlot = at + SPACING;
    return sleep(at - now);
  }
  // Names nothing resolved this session (a typo, a custom card): not asked again on every
  // re-analysis, which a filter click triggers.
  const unresolved = new Set();

  // names[] -> Map keyed by nameKeys (lowercased; full + DFC front face). onProgress(done, total)
  // counts the names looked up as each batch answers, for a wait that can last seconds.
  async function enrichCards(names, onProgress) {
    const unique = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))].filter((n) => !unresolved.has(n));
    const map = new Map();
    // The batches run side by side, each starting SPACING after the previous one: a batch
    // takes about two seconds on Scryfall's side, so one after another a 100-deck pool
    // waited some 40 s where this takes about 12.
    let done = 0;
    const batches = chunk(unique, 75);
    const results = await Promise.all(batches.map((batch) =>
      postBatch(batch.map((name) => ({ name }))).then((data) => {
        done += batch.length;
        if (onProgress) onProgress(done, unique.length);
        return data;
      })));
    const failed = [];
    results.forEach((data, i) => {
      if (!data) { failed.push(...batches[i]); return; }
      for (const c of data.data || []) {
        const enriched = toEnriched(c);
        for (const k of nameKeys(c.name)) if (!map.has(k)) map.set(k, enriched);
      }
      // A name the batch reports unknown is unknown: it resolves front faces, split halves
      // and accent-free spellings, so asking /cards/named one by one only added seconds.
      for (const nf of data.not_found || []) if (nf && nf.name) unresolved.add(nf.name);
    });

    // Fallback: the names of batches that failed (a /cards/collection outage), one by one
    // through /cards/named, each in its own slot.
    for (const name of failed.filter((n) => !enrichmentFor(map, n)).slice(0, 250)) {
      const c = await getNamed(name);
      if (c) {
        const enriched = toEnriched(c);
        for (const k of nameKeys(c.name)) if (!map.has(k)) map.set(k, enriched);
        for (const k of nameKeys(name)) if (!map.has(k)) map.set(k, enriched);
      } else if (c === null) unresolved.add(name);
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

  // Whether Scryfall's batch declared this name unknown this session (the page caches it as such).
  const isUnknown = (name) => unresolved.has(String(name).trim());

  const api = { enrichCards, enrichmentFor, nameKeys, isUnknown };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Enrich = api;
})(typeof window !== "undefined" ? window : globalThis);
