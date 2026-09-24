#!/usr/bin/env node
// Packages the extension for each browser from the one source tree: dist/<target>/ plus
// dist/deckcompare-<version>-<target>.zip. No bundler — the files ship as they are; only
// the manifest differs per browser.
//
//   node scripts/build.js            → chrome + firefox
//   node scripts/build.js firefox    → one target
//
// chrome  — as-is. Also the package for Edge, Brave, Opera and Vivaldi (Chromium, same store
//           format; Edge has its own store, the others install from the Chrome Web Store).
// firefox — background.scripts instead of a service worker (Firefox MV3 has no worker
//           background; background.js guards importScripts), browser_specific_settings.gecko
//           (the add-on id is permanent once published on AMO — never change it), and the
//           data-collection declaration AMO now requires. Host permissions are optional at
//           install on Firefox: the popup asks for them in one click (site-access button).
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const GECKO_ID = "deckcompare@mcouzinet.github.io";

// Everything the extension needs at runtime and nothing else (no tests, docs, promo art).
const FILES = [
  "manifest.json", "theme.css",
  "popup.html", "compare.html", "pool.html", "privacy-policy.html",
  "background.js", "shared.js", "parsers.js", "dom-parsers.js", "content.js",
  "inject-button.js", "inject-archetype.js", "enrich.js", "pool-analyze.js",
  "popup.js", "compare.js", "pool.js",
  "icons/icon16.png", "icons/icon48.png", "icons/icon128.png",
  "_locales/en/messages.json", "_locales/fr/messages.json",
  "fonts/Beleren2016-Bold.woff2",
];

const TARGETS = {
  chrome: (m) => m,
  firefox: (m) => {
    const out = JSON.parse(JSON.stringify(m));
    const worker = out.background && out.background.service_worker;
    if (worker) out.background = { scripts: ["shared.js", "parsers.js", worker] };
    out.browser_specific_settings = {
      gecko: {
        id: GECKO_ID,
        strict_min_version: "128.0",   // optional_host_permissions + scripting.registerContentScripts
        data_collection_permissions: { required: ["none"] },
      },
    };
    return out;
  },
};

function build(target) {
  const transform = TARGETS[target];
  if (!transform) throw new Error(`unknown target "${target}" (${Object.keys(TARGETS).join(", ")})`);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

  // Every script the manifest references must be in FILES, or the package is silently broken.
  const referenced = new Set([manifest.background && manifest.background.service_worker]);
  for (const cs of manifest.content_scripts || []) for (const js of cs.js) referenced.add(js);
  for (const f of referenced) if (f && !FILES.includes(f)) throw new Error(`manifest references ${f}, missing from FILES`);

  const dir = path.join(DIST, target);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const f of FILES) {
    const src = path.join(ROOT, f);
    if (!fs.existsSync(src)) throw new Error(`missing file: ${f}`);
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    if (f !== "manifest.json") fs.copyFileSync(src, path.join(dir, f));
  }
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(transform(manifest), null, 2) + "\n");

  const zip = path.join(DIST, `deckcompare-${manifest.version}-${target}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync("zip", ["-X", "-r", "-q", zip, "."], { cwd: dir });
  const size = fs.statSync(zip).size;
  console.log(`${target.padEnd(8)} ${path.relative(ROOT, zip)}  ${(size / 1024).toFixed(0)} KB  (${FILES.length} files, manifest ${manifest.version})`);
}

fs.mkdirSync(DIST, { recursive: true });
for (const t of (process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TARGETS))) build(t);
