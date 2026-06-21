# v0.5 — Todo

## Phase 1 — Créer les fichiers locales (parallèle)

- [x] **T1** `_locales/en/messages.json` — 67 clés EN
- [x] **T2** `_locales/fr/messages.json` — 67 clés FR
- [x] **T3** `manifest.json` — `default_locale: "en"`, `__MSG_*__`

## Phase 2 — Migrer les JS (parallèle, après Phase 1)

- [x] **T4** `popup.js` — 44 `t()` → `chrome.i18n.getMessage()`
- [x] **T5** `compare.js` — 23 `t()` → `chrome.i18n.getMessage()` (dont 2 dynamiques `t(s.key)`)

## Phase 3 — Nettoyer les HTML (parallèle, après Phase 2)

- [x] **T6** `popup.html` — `<script src="i18n.js">` retiré
- [x] **T7** `compare.html` — `<script src="i18n.js">` retiré

## Phase 4 — Supprimer l'ancien système

- [x] **T8** `i18n.js` supprimé

## Checkpoint final

- [ ] Extension chargée sans erreur dans `chrome://extensions`
- [ ] Popup en FR quand Chrome est en français
- [ ] Popup en EN quand Chrome est en anglais
- [ ] Page compare : sections Créatures / Non-créatures / Terrains visibles
- [ ] Nom et description corrects dans `chrome://extensions`
