#!/usr/bin/env bash
# Locks three AGENTS.md conventions that are not already Rust unit tests:
# English and Russian READMEs and no Python, range inputs only inside Slider,
# and LF blobs in the git index. Each failure names the rule and the fix.
set -euo pipefail

cd "$(dirname "$0")/.."

fail=0

rule_error() {
  # GitHub turns ::error:: into an annotation. The text is also the log line.
  echo "$1"
  fail=1
}

for file in README.md README.ru.md; do
  if [[ ! -f $file ]]; then
    rule_error "::error file=${file}::AGENTS.md conventions: docs exist in English and Russian (README.md / README.ru.md). ${file} is missing. Fix: restore ${file}. Do not drop either language."
  fi
done

while IFS= read -r -d '' file; do
  case "$file" in
    *.py | requirements.txt | */requirements.txt | pyproject.toml | */pyproject.toml)
      rule_error "::error file=${file}::AGENTS.md conventions: no Python. The git index contains ${file}. Fix: remove it. This repository does not use Python (no *.py, requirements.txt, or pyproject.toml)."
      ;;
  esac
done < <(git ls-files -z)

while IFS= read -r -d '' record; do
  file="${record#*$'\t'}"
  meta="${record%%$'\t'*}"
  index_eol="${meta%% *}"
  kind="${index_eol#i/}"
  if [[ $kind == crlf || $kind == mixed ]]; then
    rule_error "::error file=${file}::AGENTS.md conventions: line endings are LF via .gitattributes (\`* text=auto eol=lf\`). ${file} is stored as ${kind} in the index. Fix: \`git add --renormalize -- ${file}\` and commit the LF blob. Do not fight .gitattributes and do not commit CRLF."
  fi
done < <(git ls-files --eol -z)

# A raw range input commits on every pixel unless it goes through Slider.
# Match the JSX forms, not the CSS selector in styles.css.
range_re='type[[:space:]]*=[[:space:]]*(\{[[:space:]]*)?["'"'"'\`]range["'"'"'\`]'

slider_body_span() {
  awk '
    BEGIN { RS = "\0" }
    {
      s = $0
      n = length(s)
      line = 1
      mode = "code"
      interp = 0
      phase = 0
      paren = 0
      depth = 0
      body_start = 0
      seek = "function Slider"
      seek_i = 1
      seek_len = length(seek)
      for (i = 1; i <= n; i++) {
        c = substr(s, i, 1)
        nxt = substr(s, i + 1, 1)
        if (c == "\n") line++

        if (mode == "line") {
          if (c == "\n") mode = "code"
          continue
        }
        if (mode == "block") {
          if (c == "*" && nxt == "/") { mode = "code"; i++ }
          continue
        }
        if (mode == "sq") {
          if (c == "\\") { i++; continue }
          if (c == "'\''") mode = "code"
          continue
        }
        if (mode == "dq") {
          if (c == "\\") { i++; continue }
          if (c == "\"") mode = "code"
          continue
        }
        if (mode == "tmpl") {
          if (c == "\\") { i++; continue }
          if (c == "`") { mode = "code"; continue }
          if (c == "$" && nxt == "{") {
            interp++
            interp_depth[interp] = 0
            mode = "code"
            i++
          }
          continue
        }

        if (c == "/" && nxt == "/") { mode = "line"; i++; continue }
        if (c == "/" && nxt == "*") { mode = "block"; i++; continue }
        if (c == "'\''") { mode = "sq"; continue }
        if (c == "\"") { mode = "dq"; continue }
        if (c == "`") { mode = "tmpl"; continue }

        if (interp > 0) {
          if (c == "{") interp_depth[interp]++
          else if (c == "}") {
            if (interp_depth[interp] == 0) {
              mode = "tmpl"
              interp--
            } else interp_depth[interp]--
          }
          continue
        }

        if (phase == 0) {
          want = substr(seek, seek_i, 1)
          if (c == want) {
            seek_i++
            if (seek_i > seek_len) phase = 1
          } else {
            seek_i = 1
            if (c == substr(seek, 1, 1)) seek_i = 2
          }
          continue
        }

        if (phase == 1) {
          if (c == "(") paren++
          else if (c == ")" && paren > 0) {
            paren--
            if (paren == 0) phase = 2
          }
          continue
        }

        if (body_start == 0) {
          if (c == "{") {
            body_start = line
            depth = 1
          }
          continue
        }

        if (c == "{") depth++
        else if (c == "}") {
          depth--
          if (depth == 0) {
            print body_start, line
            exit
          }
        }
      }
    }
  ' "$1"
}

range_hits() {
  local file="$1"
  local line
  local hits_text
  hits_text="$(grep -n -E "$range_re" "$file" || true)"
  if [[ -z $hits_text ]]; then
    return 0
  fi
  while IFS= read -r line; do
    printf '%s\n' "${line%%:*}"
  done <<<"$hits_text"
}

while IFS= read -r -d '' file; do
  [[ -f $file ]] || continue
  mapfile -t hits < <(range_hits "$file")
  if [[ ${#hits[@]} -eq 0 ]]; then
    continue
  fi
  if [[ $file != src/components/ui.tsx ]]; then
    for line in "${hits[@]}"; do
      [[ -n $line ]] || continue
      rule_error "::error file=${file},line=${line}::AGENTS.md conventions: sliders commit on release, not per pixel (one drag = one HID write). ${file}:${line} is a raw range input outside Slider. Fix: use the Slider component in src/components/ui.tsx. Do not add <input type=\"range\"> (or type={'range'} / type={\"range\"}) anywhere else."
    done
    continue
  fi

  span="$(slider_body_span "$file")"
  if [[ -z $span ]]; then
    rule_error "::error file=${file}::AGENTS.md conventions: sliders commit on release, not per pixel (one drag = one HID write). ${file} has a range input but no \`function Slider\` body, so the input is not the Slider component. Fix: keep the only range input inside \`function Slider\` in src/components/ui.tsx."
    continue
  fi
  start="${span%% *}"
  end="${span##* }"
  for line in "${hits[@]}"; do
    [[ -n $line ]] || continue
    if (( line < start || line > end )); then
      rule_error "::error file=${file},line=${line}::AGENTS.md conventions: sliders commit on release, not per pixel (one drag = one HID write). ${file}:${line} is a range input outside \`function Slider\` (body is lines ${start}-${end}). Fix: move it into Slider, or delete it and use the Slider component. onInput updates the draft; onChange is the one HID write."
    fi
  done
done < <(git ls-files -z -- '*.tsx' '*.ts' '*.jsx' '*.js' '*.html')

if [[ $fail -ne 0 ]]; then
  echo "AGENTS.md repository rules failed. Each error above names the rule and the fix."
  exit 1
fi

echo "AGENTS.md repository rules ok: README.md, README.ru.md, no Python, Slider-only range inputs, LF index."
