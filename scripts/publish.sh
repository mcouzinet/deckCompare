#!/bin/bash
# Publishes the latest release (the highest vX.Y tag, pushed) to the stores, from this Mac. Endstep Tracker's
# publish.sh, adapted.
#   scripts/publish.sh --dry-run [store…]    checks everything and builds the packages; contacts no store
#   scripts/publish.sh [chrome] [edge] [firefox] [safari]   publishes (all four when none is named), after a confirmation
#   scripts/publish.sh --keys [store…]       asks for the missing keys of those stores and stores them in the Keychain
#   scripts/publish.sh --keys --replace [store…]   asks again for all of them, the ones already set included
# The packages are built from the tag itself, in a temporary worktree, so later commits never leak into a store.
# Keys and IDs come from the macOS Keychain, service "deckcompare-publish" (store/listing.md, "Automated publishing"),
# never from the repository; nothing here prints them or puts them on a command line. What the APIs cannot do
# (listing texts, screenshots, the first submission of a store) stays in each store's dashboard.
set -eu
cd "$(dirname "$0")/.."
ROOT=$PWD

dry=0; yes=0; keys=0; replace=0; stores=()
for a in "$@"; do
  case "$a" in
    --dry-run) dry=1 ;;
    --yes) yes=1 ;;
    --keys) keys=1 ;;
    --replace) replace=1 ;;
    chrome|edge|firefox|safari) stores+=("$a") ;;
    *) echo "unknown argument: $a"; exit 2 ;;
  esac
done
[ ${#stores[@]} -gt 0 ] || stores=(chrome edge firefox safari)

fail() { echo "✗ $*" >&2; exit 1; }
KEYCHAIN=deckcompare-publish

# Keys: security prompts for each value itself (no echo, nothing on a command line); the ones already set are skipped.
if [ $keys = 1 ]; then
  [ -t 0 ] || fail "--keys needs a terminal: the values are typed at a prompt"
  for s in "${stores[@]}"; do
    case $s in
      chrome) names="chrome-publisher-id chrome-item-id chrome-client-id chrome-client-secret chrome-refresh-token" ;;
      edge) names="edge-product-id edge-client-id edge-api-key" ;;
      firefox) names="amo-jwt-issuer amo-jwt-secret" ;;
      safari) names="asc-key-id asc-issuer-id" ;;
    esac
    for n in $names; do
      if [ $replace = 0 ] && security find-generic-password -s "$KEYCHAIN" -a "$n" >/dev/null 2>&1; then echo "✓ $n already set (--replace to change it)"; continue; fi
      echo "$n (store/listing.md, Automated publishing):"
      security add-generic-password -U -s "$KEYCHAIN" -a "$n" -w || fail "$n not stored"
      [ -n "$(security find-generic-password -s "$KEYCHAIN" -a "$n" -w 2>/dev/null)" ] ||
        { security delete-generic-password -s "$KEYCHAIN" -a "$n" >/dev/null 2>&1; fail "$n was empty: not stored"; }
    done
  done
  [[ " ${stores[*]} " == *" safari "* ]] && echo "Safari also needs the key file in ~/.appstoreconnect/private_keys/AuthKey_<asc-key-id>.p8"
  exit 0
fi
tag=$(git tag -l 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+$' | head -1)
[ -n "$tag" ] || fail "no release tag vX.Y"
v=${tag#v}
git ls-remote --exit-code --tags origin "$tag" >/dev/null || fail "tag $tag is not on origin"
[ -d node_modules ] || fail "run npm install first: the tests need jsdom"

# The release, as tagged: its own tests, its own build, its own Xcode project.
REL=$(mktemp -d)/deckcompare-$v
git worktree add -q --detach "$REL" "$tag"
trap 'git worktree remove --force "$REL" >/dev/null 2>&1 || true' EXIT
(cd "$REL" && NODE_PATH="$ROOT/node_modules" npm test >/dev/null 2>&1) || fail "unit tests fail at $tag"
(cd "$REL" && node scripts/build.js) >/dev/null || fail "scripts/build.js failed at $tag"
ZIP="$REL/dist/deckcompare-$v-chrome.zip"
FFZIP="$REL/dist/deckcompare-$v-firefox.zip"
[ -f "$ZIP" ] && [ -f "$FFZIP" ] || fail "no $v packages: the manifest at $tag does not read $v"
echo "✓ release $v ($tag, pushed): unit tests pass, packages built from the tag"

secret() { security find-generic-password -s "$KEYCHAIN" -a "$1" -w 2>/dev/null || fail "missing Keychain item $KEYCHAIN / $1 (store/listing.md, Automated publishing)"; }
need() { for k in "$@"; do [ -n "$(secret "$k")" ] || fail "Keychain item $KEYCHAIN / $k is missing or empty (scripts/publish.sh --keys)"; done; }
json() { jq -r "$1" 2>/dev/null; }
wait_for() { # wait_for <label> <command printing a state> <state that means "still running">
  local s
  for _ in $(seq 1 60); do s=$($2); [ "$s" != "$3" ] && { echo "$s"; return; }; sleep 5; done
  echo "timeout"
}

# --- Chrome Web Store: API v2 (v1.1 stops on 2026-10-15), OAuth refresh token ---
chrome_token() {
  printf 'client_id=%s&client_secret=%s&refresh_token=%s&grant_type=refresh_token' \
    "$(secret chrome-client-id)" "$(secret chrome-client-secret)" "$(secret chrome-refresh-token)" |
    curl -sS https://oauth2.googleapis.com/token --data @- | json .access_token
}
chrome() {
  need chrome-client-id chrome-client-secret chrome-refresh-token chrome-publisher-id chrome-item-id
  local token; token=$(chrome_token); [ -n "$token" ] && [ "$token" != null ] || fail "Chrome: the refresh token was refused"
  [ $dry = 1 ] && { echo "✓ Chrome: credentials accepted (dry run: nothing uploaded)"; return; }
  local base="https://chromewebstore.googleapis.com" item; item="publishers/$(secret chrome-publisher-id)/items/$(secret chrome-item-id)"
  local auth="header = \"Authorization: Bearer $token\""
  local up; up=$(echo "$auth" | curl -sS -K - -X POST -T "$ZIP" "$base/upload/v2/$item:upload")
  local state; state=$(echo "$up" | json .uploadState)
  if [[ "$state" == *IN_PROGRESS ]]; then
    status() { echo "$auth" | curl -sS -K - "$base/v2/$item:fetchStatus" | json .lastAsyncUploadState; }
    state=$(wait_for "Chrome upload" status IN_PROGRESS)
  fi
  [ "$state" = SUCCEEDED ] || fail "Chrome upload: $state $(echo "$up" | json '.error.message // empty')"
  local pub; pub=$(echo "$auth" | curl -sS -K - -H 'Content-Type: application/json' -X POST -d '{"publishType":"DEFAULT_PUBLISH"}' "$base/v2/$item:publish")
  echo "$pub" | json '.error.message // empty' | grep -q . && fail "Chrome publish: $(echo "$pub" | json .error.message)"
  echo "✓ Chrome: $v uploaded and submitted ($(echo "$pub" | json '.state // "sent"')); it goes live after Google's review"
}

# --- Edge Add-ons: Update REST API v1.1 (API key + client ID) ---
edge() {
  need edge-client-id edge-api-key edge-product-id
  [ $dry = 1 ] && { echo "✓ Edge: keys present (dry run: nothing uploaded)"; return; }
  local base; base="https://api.addons.microsoftedge.microsoft.com/v1/products/$(secret edge-product-id)"
  local auth; auth=$(printf 'header = "Authorization: ApiKey %s"\nheader = "X-ClientID: %s"\n' "$(secret edge-api-key)" "$(secret edge-client-id)")
  # Why an operation failed: its code, message and errors (strings, or objects with a message).
  why() { echo "$auth" | curl -sS -K - "$1" | json '[.errorCode, .message, ((.errors // [])[] | .message? // .)] | map(select(. != null and . != "")) | join(" · ")'; }
  local op; op=$(echo "$auth" | curl -sS -K - -D - -o /dev/null -H 'Content-Type: application/zip' -X POST -T "$ZIP" "$base/submissions/draft/package" |
    awk 'tolower($1)=="location:" {print $2}' | tr -d '\r' | sed 's#.*/##')
  [ -n "$op" ] || fail "Edge upload: no operation returned (key expired? Partner Center > Publish API)"
  upload_status() { echo "$auth" | curl -sS -K - "$base/submissions/draft/package/operations/$op" | json .status; }
  local st; st=$(wait_for "Edge upload" upload_status InProgress)
  [ "$st" = Succeeded ] || fail "Edge upload: $st $(why "$base/submissions/draft/package/operations/$op")"
  local notes="Deck Compare $v. Changes: https://github.com/mcouzinet/deckCompare/blob/v$v/CHANGELOG.md"
  local op2; op2=$(echo "$auth" | curl -sS -K - -D - -o /dev/null -H 'Content-Type: application/json' -X POST -d "$(jq -n --arg n "$notes" '{notes: $n}')" "$base/submissions" |
    awk 'tolower($1)=="location:" {print $2}' | tr -d '\r' | sed 's#.*/##')
  [ -n "$op2" ] || fail "Edge publish: no operation returned"
  publish_status() { echo "$auth" | curl -sS -K - "$base/submissions/operations/$op2" | json .status; }
  st=$(wait_for "Edge publish" publish_status InProgress)
  [ "$st" = Succeeded ] || fail "Edge publish: $st $(why "$base/submissions/operations/$op2")"
  echo "✓ Edge: $v submitted for certification"
}

# --- Firefox (AMO): web-ext sign, listed channel; AMO reviews then publishes ---
firefox() {
  need amo-jwt-issuer amo-jwt-secret
  [ $dry = 1 ] && { echo "✓ Firefox: keys present (dry run: nothing uploaded)"; return; }
  local src; src=$(mktemp -d); unzip -q "$FFZIP" -d "$src"
  WEB_EXT_API_KEY="$(secret amo-jwt-issuer)" WEB_EXT_API_SECRET="$(secret amo-jwt-secret)" \
    npx --yes web-ext@8 sign --source-dir "$src" --artifacts-dir "$REL/dist/amo" --channel=listed --approval-timeout=0 >/dev/null ||
    fail "Firefox: web-ext sign failed (run it again without >/dev/null to see why)"
  rm -rf "$src"
  echo "✓ Firefox: $v submitted to addons.mozilla.org; it goes live after Mozilla's review"
}

# --- Mac App Store: archive and upload the build with an App Store Connect API key ---
safari() {
  local project="$REL/safari/Deck Compare/Deck Compare.xcodeproj"
  # Raised by hand at each release, in both targets (AGENTS.md); the build number too, never back to 1.
  grep 'MARKETING_VERSION = ' "$project/project.pbxproj" | grep -qv "MARKETING_VERSION = $v;" &&
    fail "Safari: MARKETING_VERSION is not $v in every target at $tag"
  need asc-key-id asc-issuer-id
  local id; id=$(secret asc-key-id)
  local p8="$HOME/.appstoreconnect/private_keys/AuthKey_$id.p8"
  [ -f "$p8" ] || fail "missing $p8 (the key file downloaded from App Store Connect)"
  [ $dry = 1 ] && { echo "✓ Safari: key present (dry run: no archive uploaded)"; return; }
  local out="$REL/dist/xcode"; mkdir -p "$out"
  cat > "$out/ExportOptions.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>6DTUA72PA3</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST
  local auth=(-allowProvisioningUpdates -authenticationKeyPath "$p8" -authenticationKeyID "$id" -authenticationKeyIssuerID "$(secret asc-issuer-id)")
  xcodebuild archive -project "$project" -scheme "Deck Compare" -configuration Release \
    -destination 'generic/platform=macOS' -archivePath "$out/Deck Compare.xcarchive" "${auth[@]}" >"$out/archive.log" 2>&1 ||
    fail "Safari archive failed: $(tail -5 "$out/archive.log")"
  xcodebuild -exportArchive -archivePath "$out/Deck Compare.xcarchive" -exportOptionsPlist "$out/ExportOptions.plist" \
    -exportPath "$out/export" "${auth[@]}" >"$out/upload.log" 2>&1 || fail "Safari upload failed: $(tail -5 "$out/upload.log")"
  echo "✓ Safari: build $v uploaded to App Store Connect; once processed, select it on the $v version and submit it for review there"
}

if [ $dry = 0 ] && [ $yes = 0 ]; then
  read -r -p "Publish Deck Compare $v to: ${stores[*]}? [y/N] " ok || ok=
  [ "$ok" = y ] || [ "$ok" = Y ] || { echo "nothing published"; exit 0; }
fi
for s in "${stores[@]}"; do "$s"; done
