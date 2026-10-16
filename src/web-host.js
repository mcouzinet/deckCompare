// Deck Compare outside the extension: the results page a shared link opens. GitHub Pages serves
// this repository and share/ sends the link on to compare.html, where no chrome.* exists; this
// file stands in for the calls the page makes. Its strings come from _locales as the
// extension's do (the browser's language, English for what French lacks); storage keeps nothing
// past the page, so a shared link writes nothing on the reader's machine; the card lookup asks
// Scryfall directly (enrich.js), where the extension asks its background. Inside the extension
// it does nothing.
(function () {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) return;

  const lang = /^fr\b/i.test(navigator.language || "") ? "fr" : "en";
  const messages = {};
  const load = (l) => fetch(`_locales/${l}/messages.json`).then((r) => r.json()).catch(() => ({}));
  const ready = Promise.all([load("en"), lang === "en" ? {} : load(lang)])
    .then(([en, own]) => { Object.assign(messages, en, own); });

  // chrome.i18n.getMessage: named placeholders to their content, then $1…$9 to the arguments.
  function getMessage(key, subs) {
    const m = messages[key];
    if (!m) return "";
    const args = [].concat(subs ?? []).map(String);
    return m.message
      .replace(/\$(\w+)\$/g, (all, ph) => ((m.placeholders && m.placeholders[ph.toLowerCase()]) || {}).content ?? all)
      .replace(/\$(\$|\d)/g, (all, n) => (n === "$" ? "$" : args[n - 1] ?? ""));
  }

  // The background's FETCH_CARD_TYPES, answered in its shape; a card is judged on its front face
  // as there (a modal land on its back is not a land).
  let enrich = null;
  async function cardTypes(names) {
    enrich = enrich || new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "enrich.js";
      s.onload = () => resolve(window.Enrich);
      s.onerror = reject;
      document.head.append(s);
    });
    const E = await enrich;
    const found = await E.enrichCards(names);
    const out = { lands: [], creatures: [], images: {} };
    for (const name of names) {
      const card = E.enrichmentFor(found, name);
      if (!card) continue;
      const front = String(card.type_line || "").split(" // ")[0];
      if (front.includes("Land")) out.lands.push(name);
      if (front.includes("Creature")) out.creatures.push(name);
      if (card.image_uri) out.images[name] = card.image_uri;
    }
    return out;
  }

  const kept = {};
  window.chrome = {
    i18n: { getMessage, getUILanguage: () => navigator.language || "en" },
    storage: { local: {
      get: async (keys) => Object.fromEntries([].concat(keys ?? []).filter((k) => k in kept).map((k) => [k, kept[k]])),
      set: async (items) => { Object.assign(kept, items); },
    } },
    runtime: {
      lastError: null,
      sendMessage(msg, reply) {
        const answer = msg && msg.type === "FETCH_CARD_TYPES" ? cardTypes(msg.names || []) : Promise.resolve(null);
        answer.then(reply, () => reply(null));
      },
    },
  };
  // compare.js waits on this before its first string.
  window.webHost = { ready };
})();
