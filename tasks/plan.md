# v0.5 — Migration Chrome i18n

## Objectif

Remplacer le système custom (`i18n.js` / `TRANSLATIONS` / `t()`) par l'API native
Chrome i18n (`_locales/*/messages.json` + `chrome.i18n.getMessage()`).

**Référence :** https://developer.chrome.com/docs/extensions/reference/api/i18n

---

## État actuel

| Fichier | Rôle actuel |
|---|---|
| `i18n.js` | Détecte la locale via `navigator.language`, expose `t(key)` |
| `popup.js` | 46 appels `t('key')` |
| `compare.js` | 25 appels `t("key")` dont 2 dynamiques `t(s.key)` |
| `popup.html` | `<script src="i18n.js">` ligne 366 |
| `compare.html` | `<script src="i18n.js">` ligne 503 |
| `manifest.json` | `name`/`description` en dur, pas de `default_locale` |

**40 clés** de traduction à migrer (EN + FR).

---

## Contraintes

- Les noms de clés Chrome i18n n'acceptent que `[a-zA-Z0-9_]` — nos clés camelCase sont valides.
- `chrome.i18n.getMessage(key)` retourne `""` si la clé est absente du fichier JSON → les fichiers
  locales doivent être complets avant de retirer `i18n.js`.
- `t(s.key)` est un appel **dynamique** (key = variable `"creatures"` / `"spells"` / `"lands"`) —
  `chrome.i18n.getMessage(variable)` fonctionne, pas de cas spécial nécessaire.
- Le `manifest.json` doit avoir `"default_locale"` pour que Chrome charge les locales.
- `background.js` n'utilise aucun `t()` → pas de modification nécessaire.

---

## Graphe de dépendances

```
[T1] _locales/en/messages.json ──┐
[T2] _locales/fr/messages.json ──┤──→ [T4] popup.js ──────┐
[T3] manifest.json default_locale┘──→ [T5] compare.js ─────┤──→ [T6] popup.html ──→ [T8] delete i18n.js
                                                             └──→ [T7] compare.html ─┘
```

T1, T2, T3 en parallèle → T4, T5 en parallèle → T6, T7 en parallèle → T8

---

## Tâches

### T1 — Créer `_locales/en/messages.json`

Créer le dossier `_locales/en/` et le fichier avec les 43 entrées :
- 40 clés de traduction (celles de `TRANSLATIONS.en` dans `i18n.js`)
- 3 clés manifest : `appName`, `appShortName`, `appDescription`

Format :
```json
{
  "keyName": {
    "message": "The text"
  }
}
```

**Critère :** `JSON.parse()` sans erreur, 43 entrées, valeurs anglaises.

---

### T2 — Créer `_locales/fr/messages.json`

Même structure, valeurs françaises issues de `TRANSLATIONS.fr`.

**Critère :** mêmes 43 clés que EN, valeurs françaises, JSON valide.

---

### T3 — Mettre à jour `manifest.json`

- Ajouter `"default_locale": "en"` (obligatoire pour que Chrome charge les locales)
- `"name"` → `"__MSG_appName__"`
- `"short_name"` → `"__MSG_appShortName__"`
- `"description"` → `"__MSG_appDescription__"`

**Critère :** extension chargée → `chrome://extensions` affiche le bon nom.

---

### T4 — Migrer `popup.js`

Remplacer les 46 `t('key')` par `chrome.i18n.getMessage('key')`.
Supprimer toute référence à `t` et `LANG`.

**Critère :** `grep -c "t('" popup.js` → 0.

---

### T5 — Migrer `compare.js`

Remplacer les 25 `t("key")` par `chrome.i18n.getMessage("key")`.
Les 2 appels dynamiques `t(s.key)` → `chrome.i18n.getMessage(s.key)` (identique).

**Critère :** `grep -c 't("' compare.js` → 0 (hors faux positifs dans les strings).

---

### T6 — Mettre à jour `popup.html`

Retirer `<script src="i18n.js"></script>` (ligne 366).

**Critère :** aucune référence à `i18n.js` dans `popup.html`.

---

### T7 — Mettre à jour `compare.html`

Retirer `<script src="i18n.js"></script>` (ligne 503).

**Critère :** aucune référence à `i18n.js` dans `compare.html`.

---

### T8 — Supprimer `i18n.js`

Supprimer le fichier. C'est la dernière étape — T4/T5/T6/T7 doivent être validées avant.

**Critère :** `ls i18n.js` → "No such file".

---

## Vérification finale

1. Charger l'extension en mode non empaqueté (`chrome://extensions` → Load unpacked)
2. **Langue FR :** régler Chrome en français → ouvrir le popup → labels en français
3. **Langue EN :** régler Chrome en anglais → ouvrir le popup → labels en anglais
4. **Page compare :** lancer une comparaison → sections "Créatures / Non-créatures / Terrains" en FR
5. **Manifest :** `chrome://extensions` → nom "Deck Compare – MTG" et description correcte
6. **Fallback :** `chrome.i18n.getMessage("cléInexistante")` → `""` (pas de crash)

---

## Ce qui ne change pas

- `background.js` — aucun `t()`, pas touché
- `content.js` — aucun `t()`, pas touché
- `privacy-policy.html` — pas de traductions dynamiques
- Toute la logique de comparaison, fetch, UI — inchangée
