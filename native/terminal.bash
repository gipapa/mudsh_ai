# Startup file for the Bash instance attached to mudsh's terminal.
_mudsh_token=$MUDSH_TERMINAL_TOKEN
unset MUDSH_TERMINAL_TOKEN

if shopt -q login_shell; then
  # The login launcher bootstraps through PROMPT_COMMAND so Bash can use this
  # terminal adapter and still load user profiles in the live login shell.
  unset MUDSH_TERMINAL_INIT
  if [[ -r /etc/profile ]]; then . /etc/profile; fi
  for _mudsh_profile in ~/.bash_profile ~/.bash_login ~/.profile; do
    if [[ -r $_mudsh_profile ]]; then . "$_mudsh_profile"; break; fi
  done
  unset _mudsh_profile
fi

. "$MUDSH_TERMINAL_RC" --mudsh-terminal
unset MUDSH_TERMINAL_RC

_mudsh_saved_prompt=(${PROMPT_COMMAND[@]+"${PROMPT_COMMAND[@]}"})
_mudsh_status=0
_mudsh_prompt() {
  _mudsh_status=$1
  local _mudsh_hook _mudsh_hook_status=$1
  for _mudsh_hook in ${_mudsh_saved_prompt[@]+"${_mudsh_saved_prompt[@]}"}; do
    (builtin exit "$_mudsh_hook_status")
    builtin eval -- "$_mudsh_hook"
    _mudsh_hook_status=$?
  done
  PS1='! \['$'\036'"$_mudsh_token"$'\037display\034''\]'
  builtin printf '\036%s\037prompt\034%s\0%s\0' \
    "$_mudsh_token" "$_mudsh_status" "$(builtin printf '%s' "$PWD" | /usr/bin/base64)"
  return "$_mudsh_status"
}
unset PROMPT_COMMAND
PROMPT_COMMAND='_mudsh_prompt "$?"'
HISTIGNORE=${HISTIGNORE:+$HISTIGNORE:}' _mudsh_terminal_start *'

_mudsh_terminal_start() {
  if [[ $1 != manual ]]; then
    _mudsh_capture=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/mudsh.XXXXXXXX") || return
  fi
  builtin printf '\036%s\037start\034' "$_mudsh_token"
}

_mudsh_terminal_output() {
  /usr/bin/head -c 262144 "$1"
  if [[ $(/usr/bin/wc -c <"$1") -gt 262144 ]]; then
    builtin printf '\n[Shell output truncated]\n'
  fi
}

_mudsh_terminal_finish() {
  builtin printf '\036%s\037result\034%s\0%s\0%s\0' "$_mudsh_token" "$2" \
    "$(_mudsh_terminal_output "$_mudsh_capture/out" | /usr/bin/base64)" \
    "$(_mudsh_terminal_output "$_mudsh_capture/err" | /usr/bin/base64)"
  /bin/rm -rf -- "$_mudsh_capture"
  unset _mudsh_capture
  if [[ $1 == inspect ]]; then return "$_mudsh_status"; fi
  return "$2"
}
