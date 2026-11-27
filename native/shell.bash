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
  _mudsh_move() {
    local room
    room=$(_mudsh_game "$1") || return
    builtin cd -- "$room"
  }
  mudsh() {
    case ${1-} in
      next|resume)
        _mudsh_move "$1" && look
        ;;
      help|'')
        _mudsh_game help
        ;;
      look) look ;;
      *) _mudsh_game "$@" ;;
    esac
  }
  look() { _mudsh_game look "${OLDPWD-}"; }
  _mudsh_start=$(_mudsh_game resume) || exit 1
  builtin cd -- "$_mudsh_start" || exit 1
  unset _mudsh_start
  if [[ $- == *i* ]]; then
    PS1='mudsh [\W] \$ '
    if [[ -t 1 && ${TERM-} != dumb && -z ${NO_COLOR-} ]]; then
      PS1='\[\e[32m\]mudsh [\W] \$\[\e[0m\] '
    fi
    if [[ ${1-} != --mudsh-terminal ]]; then look; fi
  fi
fi

go() {
  local room
  if [[ $# == 1 && ${1-} == [bB][aA][cC][kK] ]]; then
    back
  elif [[ $# == 1 && -n ${MUDSH_GAME_ROOT-} && ! -d $1 ]] &&
    room=$(_mudsh_game exit "$1" 2>/dev/null); then
    builtin cd -- "$room" && look
  else
    builtin cd -- "$@" && look
  fi
}
back() { builtin cd -- "${OLDPWD:?No previous directory}" && look; }
