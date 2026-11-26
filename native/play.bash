#!/bin/bash
set -e
export MUDSH_GAME_ROOT=/expedition
if [[ ${1-} == --bridge ]]; then
  exec /bin/bash /opt/mudsh/bridge.bash dungeon "$2" /opt/mudsh/shell.bash
fi
if [[ ${1-} == --terminal ]]; then
  export MUDSH_TERMINAL_TOKEN=$2 MUDSH_TERMINAL_RC=/opt/mudsh/shell.bash
  exec /bin/bash --rcfile /opt/mudsh/terminal.bash -i
fi
if (( $# )); then
  BASH_ENV=/opt/mudsh/shell.bash exec /bin/bash "$@"
fi
exec /bin/bash --rcfile /opt/mudsh/shell.bash -i
