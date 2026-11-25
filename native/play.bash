#!/bin/bash
set -e
export MUDSH_GAME_ROOT=/expedition
if [[ ${1-} == --bridge ]]; then
  exec /bin/bash /opt/mudsh/bridge.bash dungeon "$2" /opt/mudsh/shell.bash
fi
if (( $# )); then
  BASH_ENV=/opt/mudsh/shell.bash exec /bin/bash "$@"
fi
exec /bin/bash --rcfile /opt/mudsh/shell.bash -i
