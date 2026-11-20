#!/usr/bin/env bash
# Android TV debloat / performance tuner over network ADB.
#
# Everything here is reversible: apps are removed for user 0 only
# (`pm uninstall -k --user 0`), never wiped from the system partition, and every
# change is logged so `restore` can put it back. A factory reset also undoes it.
#
# Usage:
#   ./tv-debloat.sh scan                 find TVs with network debugging on (port 5555)
#   ./tv-debloat.sh connect <ip[:port]>  connect (accept the prompt on the TV)
#   ./tv-debloat.sh pair <ip:port>       Google TV / Android 12+ "Wireless debugging" pairing
#   ./tv-debloat.sh audit                list packages, flag bloat/ad candidates (changes nothing)
#   ./tv-debloat.sh apply [--yes]        dry run by default; --yes actually applies
#   ./tv-debloat.sh restore              reinstall/enable everything this script removed
#
# Set TV=<ip:port> to target a specific device when more than one is connected.

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
LOG="$HERE/removed-packages.log"
KEEP_FILE="$HERE/keep.txt"

die() { echo "error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found. Install Android platform-tools (macOS: brew install android-platform-tools; Debian/Ubuntu: sudo apt install adb)."; }
need adb

ADB=(adb); [[ -n "${TV:-}" ]] && ADB=(adb -s "$TV")
sh_() { { "${ADB[@]}" shell "$@" 2>&1 || true; } | tr -d '\r'; }

# --------------------------------------------------------------------------
# Package lists. Edit freely. Anything listed in keep.txt is never touched.
# --------------------------------------------------------------------------

# Ads, recommendations, telemetry, feedback, demo/retail mode: safe to remove.
REMOVE=(
  com.google.android.tvrecommendations        # sponsored "recommendations" rows
  com.google.android.leanbacklauncher.recommendations
  com.google.android.apps.tv.launcherx.ads    # (if present) Google TV promo content
  com.google.android.feedback
  com.google.android.play.games
  com.google.android.videos                   # Google TV / Play Movies storefront
  com.google.android.youtube.tvmusic
  com.google.android.tv.bugreportsender
  com.google.android.partnersetup
  com.google.android.syncadapters.calendar
  com.android.printspooler
  com.android.dreams.basic
  # common OEM ad / promo / analytics / demo packages
  com.sony.dtv.promos
  com.sony.dtv.demomode
  com.sony.dtv.recommendationservice
  com.sony.dtv.smartmediaapp
  com.tcl.tvrecommendation
  com.tcl.ad
  com.tcl.usercenter
  com.tcl.gallery
  com.tcl.demo
  com.mitv.tvhome.atv.ad
  com.xiaomi.mitv.advertise
  com.xiaomi.mitv.upgrade
  com.miui.analytics
  com.philips.ews.android.feedback
  com.android.retaildemo
)

# Removed only when you answer yes (each costs a feature some people use).
OPTIONAL=(
  "com.google.android.backdrop|Ambient mode / photo screensaver"
  "com.google.android.apps.tv.dreamx|Google TV ambient screensaver"
  "com.google.android.apps.mediashell|Chromecast built-in (casting from your phone)"
  "com.google.android.katniss|Google Assistant & voice search on the remote"
  "com.google.android.marvin.talkback|TalkBack screen reader"
  "com.google.android.youtube.tv|YouTube"
  "com.netflix.ninja|Netflix"
  "com.amazon.amazonvideo.livingroom|Prime Video"
  "com.disney.disneyplus|Disney+"
)

# Never removed by this script: removing these can leave the TV unusable.
PROTECTED_RE='^(android|com\.android\.(systemui|settings|tv\.settings|providers\.(settings|media|downloads))|com\.google\.android\.(gms|gsf|tungsten|tv\.remote|tvlauncher|leanbacklauncher|apps\.tv\.launcherx|inputmethod|packageinstaller|permissioncontroller|webview|ext\.services|tv\.frameworkpackagestubs)|com\.android\.(vending|phone|shell|inputdevices|providers\.tv|tv\.(settings|remote))|com\.(sony|tcl|mitv|xiaomi|philips|hisense)\.(dtv\.)?(settings|inputmenu|tvinput|tvplayer|systemui|framework).*)'

# Pattern hints for `audit` only (never auto-removed).
HINT_RE='(^|[._])(ad|ads|adservice|adsdk|advert|promo|promos|recommend|recommendation|analytics|feedback|survey|demo|retail|usercenter|marketing|tracker|stats)([._]|$)'

# Alternative clean launchers (install one from the Play Store first).
LAUNCHERS=(com.spocky.projengmenu me.efesser.flauncher ca.dstudio.atvlauncher.free ca.dstudio.atvlauncher.pro)
STOCK_LAUNCHERS=(com.google.android.apps.tv.launcherx com.google.android.tvlauncher com.google.android.leanbacklauncher com.mitv.tvhome.atv com.tcl.launcher)

# --------------------------------------------------------------------------

is_kept() { [[ -f "$KEEP_FILE" ]] && grep -qxF "$1" "$KEEP_FILE"; }
installed() { sh_ pm list packages --user 0 | sed 's/^package://' | sort; }

ensure_device() {
  local n; n=$(adb devices | awk 'NR>1 && $2=="device"' | wc -l | tr -d ' ')
  [[ "$n" -ge 1 ]] || die "no device connected. Run: $0 scan  then  $0 connect <ip>"
  [[ "$n" -eq 1 || -n "${TV:-}" ]] || die "several devices connected; set TV=<ip:port>"
  echo "Device: $(sh_ getprop ro.product.manufacturer) $(sh_ getprop ro.product.model), Android $(sh_ getprop ro.build.version.release)"
}

cmd_scan() {
  local subnets
  if command -v ip >/dev/null; then
    subnets=$(ip -4 -o addr show scope global | awk '{print $4}')
  else  # macOS
    subnets=$(ifconfig | awk '/inet / && $2!="127.0.0.1"{print $2"/24"}')
  fi
  [[ -n "$subnets" ]] || die "could not work out your local network"
  echo "Scanning for port 5555 on: $subnets"
  if command -v nmap >/dev/null; then
    for s in $subnets; do nmap -Pn -p5555 --open -oG - "$s" | awk '/5555\/open/{print "  found:", $2}'; done
  else
    for s in $subnets; do
      local base="${s%.*}"
      for i in $(seq 1 254); do
        ( nc -z -w 1 "$base.$i" 5555 2>/dev/null && echo "  found: $base.$i" ) &
        (( i % 64 == 0 )) && wait
      done; wait
    done
  fi
  cat <<'EOF'

Nothing found? On the TV:
  Settings > System > About > tap "Android TV OS build" 7 times (enables Developer options)
  Settings > System > Developer options > turn on "USB debugging" and "Network debugging"
  (Google TV / Android 12+: turn on "Wireless debugging" instead, open it, choose
   "Pair device with pairing code", then run:  ./tv-debloat.sh pair <ip:pairport>
   followed by ./tv-debloat.sh connect <ip:port shown on that screen>)
  The TV's IP is under Settings > Network & Internet > your network.
EOF
}

cmd_connect() {
  local t="${1:?usage: connect <ip[:port]>}"; [[ "$t" == *:* ]] || t="$t:5555"
  echo "Connecting to $t. If the TV shows 'Allow USB debugging?', tick 'Always allow' and press OK."
  adb connect "$t"; sleep 2; adb devices -l
}

cmd_pair() { adb pair "${1:?usage: pair <ip:pairing-port>}"; }

cmd_audit() {
  ensure_device
  local pkgs; pkgs=$(installed)
  echo; echo "== Will be removed by 'apply' (installed now) =="
  for p in "${REMOVE[@]}"; do grep -qxF "$p" <<<"$pkgs" && ! is_kept "$p" && echo "  $p"; done || true
  echo; echo "== Optional (you'll be asked) =="
  for e in "${OPTIONAL[@]}"; do p="${e%%|*}"; grep -qxF "$p" <<<"$pkgs" && echo "  $p  - ${e#*|}"; done || true
  echo; echo "== Other packages that look like ads/telemetry (review; add to REMOVE if you agree) =="
  { grep -E "$HINT_RE" <<<"$pkgs" || true; } | { grep -vE "$PROTECTED_RE" || true; } | while read -r p; do
    printf '%s\n' "${REMOVE[@]}" | grep -qxF "$p" || echo "  $p"; done
  echo; echo "== Third-party apps you installed =="
  sh_ pm list packages -3 --user 0 | sed 's/^package:/  /' | sort
  echo; echo "== Launchers =="
  for p in "${LAUNCHERS[@]}" "${STOCK_LAUNCHERS[@]}"; do grep -qxF "$p" <<<"$pkgs" && echo "  $p"; done || true
  sh_ cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME | tail -1 | sed 's/^/  current home: /'
  echo; echo "Full list saved to $HERE/packages-$(date +%Y%m%d).txt"
  echo "$pkgs" > "$HERE/packages-$(date +%Y%m%d).txt"
}

remove_pkg() {  # $1 pkg, $2 dry(1/0)
  local p="$1"
  if [[ "$p" =~ $PROTECTED_RE ]]; then echo "  skip (protected) $p"; return; fi
  if is_kept "$p"; then echo "  skip (keep.txt) $p"; return; fi
  if [[ "$2" == 1 ]]; then echo "  would remove $p"; return; fi
  local out; out=$(sh_ pm uninstall -k --user 0 "$p")
  if [[ "$out" == *Success* ]]; then echo "  removed $p"; echo "uninstall $p" >> "$LOG"
  else
    out=$(sh_ pm disable-user --user 0 "$p")
    if [[ "$out" == *disabled* ]]; then echo "  disabled $p"; echo "disable $p" >> "$LOG"
    else echo "  FAILED $p: $out"; fi
  fi
}

ask() { local r; read -r -p "$1 [y/N] " r </dev/tty; [[ "$r" =~ ^[Yy] ]]; }

cmd_apply() {
  local dry=1; [[ "${1:-}" == "--yes" ]] && dry=0
  ensure_device
  [[ $dry == 1 ]] && echo ">>> DRY RUN. Nothing will change. Re-run with --yes to apply. <<<"
  local pkgs; pkgs=$(installed)
  [[ $dry == 0 ]] && echo "$pkgs" > "$HERE/packages-before-$(date +%Y%m%d-%H%M%S).txt"

  echo; echo "[1/5] Removing ads, recommendations, telemetry and demo apps"
  for p in "${REMOVE[@]}"; do grep -qxF "$p" <<<"$pkgs" && remove_pkg "$p" "$dry"; done || true

  echo; echo "[2/5] Optional removals"
  for e in "${OPTIONAL[@]}"; do
    p="${e%%|*}"; grep -qxF "$p" <<<"$pkgs" || continue
    if [[ $dry == 1 ]]; then echo "  would ask: $p (${e#*|})"
    elif ask "  Remove ${e#*|} ($p)?"; then remove_pkg "$p" 0; fi
  done

  echo; echo "[3/5] Performance tuning"
  local tweaks=(
    "global window_animation_scale 0.5"
    "global transition_animation_scale 0.5"
    "global animator_duration_scale 0.5"
  )
  for t in "${tweaks[@]}"; do
    if [[ $dry == 1 ]]; then echo "  would set $t"
    else read -r ns k v <<<"$t"; echo "setting $ns $k $(sh_ settings get "$ns" "$k")" >> "$LOG"
         sh_ settings put "$ns" "$k" "$v" >/dev/null; echo "  set $k=$v"; fi
  done
  if [[ $dry == 1 ]]; then echo "  would recompile apps for speed (bg-dexopt, takes a few minutes)"
  else echo "  recompiling apps for speed (a few minutes)..."; sh_ cmd package bg-dexopt-job >/dev/null || true; fi

  echo; echo "[4/5] Network-wide ad blocking via Private DNS (AdGuard DNS)"
  if [[ $dry == 1 ]]; then echo "  would offer to set Private DNS to dns.adguard-dns.com"
  elif ask "  Block ad/tracker domains system-wide with AdGuard Private DNS?"; then
    echo "setting global private_dns_mode $(sh_ settings get global private_dns_mode)" >> "$LOG"
    echo "setting global private_dns_specifier $(sh_ settings get global private_dns_specifier)" >> "$LOG"
    sh_ settings put global private_dns_mode hostname >/dev/null
    sh_ settings put global private_dns_specifier dns.adguard-dns.com >/dev/null
    echo "  Private DNS on"
  fi

  echo; echo "[5/5] Clean launcher"
  local alt=""
  for p in "${LAUNCHERS[@]}"; do grep -qxF "$p" <<<"$pkgs" && { alt="$p"; break; }; done
  if [[ -z "$alt" ]]; then
    echo "  No alternative launcher installed, so the stock home screen (and its ad rows) stays."
    echo "  For a clean, app-only home: install 'Projectivy Launcher' or 'FLauncher' from the"
    echo "  Play Store on the TV, then run apply --yes again."
  else
    local comp; comp=$(sh_ cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME "$alt" | tail -1)
    if [[ $dry == 1 ]]; then echo "  would make $comp the home screen and disable the stock launcher"
    elif ask "  Make $alt your home screen and disable the stock launcher?"; then
      sh_ cmd package set-home-activity "$comp"
      sh_ input keyevent KEYCODE_HOME >/dev/null
      if ask "  Did the new launcher open when HOME was pressed?"; then
        for s in "${STOCK_LAUNCHERS[@]}"; do
          grep -qxF "$s" <<<"$pkgs" || continue
          out=$(sh_ pm disable-user --user 0 "$s"); echo "  $out"; echo "disable $s" >> "$LOG"
        done
      else echo "  Left the stock launcher enabled."; fi
    fi
  fi

  echo
  if [[ $dry == 0 ]]; then
    echo "Done. Changes logged in $LOG. Reboot recommended:  adb reboot"
    echo "Undo everything with:  $0 restore"
  fi
}

cmd_restore() {
  ensure_device
  [[ -f "$LOG" ]] || die "no $LOG, nothing to restore"
  tac "$LOG" 2>/dev/null >"$LOG.rev" || tail -r "$LOG" >"$LOG.rev"
  while read -r action a b c; do
    case "$action" in
      uninstall) echo "  reinstall $a: $(sh_ cmd package install-existing --user 0 "$a")";;
      disable)   echo "  enable $a: $(sh_ pm enable --user 0 "$a")";;
      setting)   if [[ "$c" == null || -z "$c" ]]; then sh_ settings delete "$a" "$b" >/dev/null
                 else sh_ settings put "$a" "$b" "$c" >/dev/null; fi; echo "  restored $b";;
    esac
  done < "$LOG.rev"
  rm -f "$LOG.rev"; mv "$LOG" "$LOG.restored-$(date +%Y%m%d-%H%M%S)"
  echo "Restored. Reboot recommended:  adb reboot"
}

case "${1:-}" in
  scan) cmd_scan;;
  connect) cmd_connect "${2:-}";;
  pair) cmd_pair "${2:-}";;
  audit) cmd_audit;;
  apply) cmd_apply "${2:-}";;
  restore) cmd_restore;;
  *) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 1;;
esac
