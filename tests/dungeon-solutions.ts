// Solve with the player-facing tools so the fixtures and verifier are exercised together.
export const solutions = [
  'cat "$(find records -name night-orders.txt)" | tail -n 1',
  'cat "$(grep -rl "SILVER MOTH" manuscripts)" | tail -n 1',
  'ls -A1 offerings | wc -l',
  'cat "$(find shelves -name ledger-seal.txt)"',
  'cat "$(find shelves -name .dusk-seal)"',
  "grep -o 'MUD{[A-F0-9]*}' long-scroll.txt",
  'sort alarms.log | uniq -u',
  'file portrait.png && tail -n 1 portrait.png',
  'tar -tzf dispatch.tar.gz && tar -xzf dispatch.tar.gz',
  'digest=$(cat receipt.txt); match=$(md5sum copies/* | grep "${digest#MD5: }"); printf "%s\n" "${match##*/}"',
  'strings golem.wasm | grep "^MUD{"',
  'base64 -d signal.b64 | tail -n 1',
  'gps=$(exiftool -n -GPSLatitude -GPSLongitude scout.jpg); ' +
    'lat=$(printf "%s\n" "$gps" | grep Latitude); lon=$(printf "%s\n" "$gps" | grep Longitude); ' +
    'match=$(grep -F -- "${lat##* }" outposts.txt | grep -F -- "${lon##* }"); ' +
    'printf "%s\n" "${match%%$\'\\t\'*}"',
];
