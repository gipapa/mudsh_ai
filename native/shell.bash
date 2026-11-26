# The launcher loads this inside Bash so movement changes the current shell.
if [[ -z ${MUDSH_GAME_ROOT-} ]]; then
  if ! shopt -q login_shell && [[ -r ~/.bashrc ]]; then
    . ~/.bashrc
  fi
  mudsh() { command "$MUDSH_LAUNCHER" "$@"; }
  look() { builtin pwd && command ls; }
else
  unset BASH_ENV
  _mudsh_game() {
    command flock -- "$MUDSH_GAME_ROOT/.mudsh-lock" node /opt/mudsh/game.mjs "$@"
  }
  mudsh() {
    case ${1-} in
      next|resume)
        local room
        room=$(_mudsh_game "$1") || return
        builtin cd -- "$room" && _mudsh_game look
        ;;
      help|'')
        builtin printf '%s\n' \
          'Use regular Bash commands to solve the room.' \
          'mudsh look | hint | submit ANSWER | check | next | resume | progress' \
          'look, go DIRECTORY and back are navigation shortcuts. Exit returns to your host shell.'
        ;;
      *) _mudsh_game "$@" ;;
    esac
  }
  look() { mudsh look && command ls; }
  _mudsh_start=$(_mudsh_game resume) || exit 1
  builtin cd -- "$_mudsh_start" || exit 1
  unset _mudsh_start
  if [[ $- == *i* ]]; then
    PS1='mudsh [\W] \$ '
    if [[ ${1-} != --mudsh-terminal ]]; then mudsh look; fi
  fi
fi

go() { builtin cd -- "$@" && look; }
back() { builtin cd -- "$OLDPWD" && look; }
