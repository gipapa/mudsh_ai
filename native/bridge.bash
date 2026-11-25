# Requests and replies have NUL-separated fields. User Bash state stays in this process.
_mudsh_backend=$1
_mudsh_marker=$2
_mudsh_rc=$3
if [[ $_mudsh_backend == dungeon ]]; then
  exec 7<&0 8>&1 </dev/null
else
  exec 7<&3 8>&4 3<&- 4>&-
fi

. "$_mudsh_rc"
_mudsh_capture=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/mudsh.XXXXXXXX") || exit 1
trap '/bin/rm -rf -- "$_mudsh_capture"' EXIT
trap ':' INT
_mudsh_last_status=0

while IFS= read -r -d '' _mudsh_kind <&7 && IFS= read -r -d '' _mudsh_script <&7; do
  case $_mudsh_kind in
    manual)
      (builtin exit "$_mudsh_last_status")
      builtin eval -- "$_mudsh_script"
      _mudsh_status=$?
      ;;
    capture|inspect)
      (builtin exit "$_mudsh_last_status")
      builtin eval -- "$_mudsh_script" </dev/null >"$_mudsh_capture/out" 2>"$_mudsh_capture/err"
      _mudsh_status=$?
      ;;
    *) exit 2 ;;
  esac
  if [[ $_mudsh_kind != inspect ]]; then _mudsh_last_status=$_mudsh_status; fi
  builtin printf '\0%s\0%s\0%s\0' "$_mudsh_marker" "$_mudsh_status" "$PWD" >&8
  if [[ $_mudsh_kind != manual ]]; then
    for _mudsh_stream in out err; do
      if [[ -s $_mudsh_capture/$_mudsh_stream ]]; then
        {
          /usr/bin/head -c 262144 "$_mudsh_capture/$_mudsh_stream"
          if [[ $(/usr/bin/wc -c <"$_mudsh_capture/$_mudsh_stream") -gt 262144 ]]; then
            builtin printf '\n[Shell output truncated]\n'
          fi
        } | /usr/bin/base64 >&8
      fi
      builtin printf '\0' >&8
    done
  else
    builtin printf '\0\0' >&8
  fi
done
