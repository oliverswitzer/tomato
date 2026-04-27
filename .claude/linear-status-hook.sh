#!/usr/bin/env bash
# Linear Status Hook
#
# PostToolUse hook that updates Linear issue status when:
# - ao spawn IDE-XXX: sets issue to "In Progress"
# - gh pr merge: sets issue to "Done"
#
# Requires LINEAR_API_KEY in environment.
# State IDs are for the IDE team (personal-team).

set -euo pipefail

input=$(cat)

# Only process Bash tool calls
tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null) || true
if [[ "$tool_name" != "Bash" ]]; then
  echo '{}'
  exit 0
fi

command=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || true

# Skip if LINEAR_API_KEY not set
if [[ -z "${LINEAR_API_KEY:-}" ]]; then
  echo '{}'
  exit 0
fi

# State IDs for IDE team (personal-team)
STATE_IN_PROGRESS="27e73e27-92d4-4650-b06d-9d19bc359758"
STATE_DONE="c093ca08-7b41-4b6d-a3b8-0bf6d9118716"

# Update Linear issue status by identifier (e.g., IDE-96)
# Runs in background to avoid blocking the hook
update_linear() {
  local identifier="$1"
  local state_id="$2"

  python3 -c "
import json, os, urllib.request

# Get issue UUID from identifier (e.g., IDE-96 -> team=IDE, number=96)
parts = '$identifier'.split('-')
team_key = parts[0]
number = int(parts[1])

query = '''query {
  issues(filter: { team: { key: { eq: \"%s\" } }, number: { eq: %d } }) {
    nodes { id }
  }
}''' % (team_key, number)
payload = json.dumps({'query': query}).encode()
req = urllib.request.Request('https://api.linear.app/graphql', data=payload,
    headers={'Authorization': os.environ['LINEAR_API_KEY'], 'Content-Type': 'application/json'})
result = json.loads(urllib.request.urlopen(req).read().decode())
nodes = result.get('data', {}).get('issues', {}).get('nodes', [])
if not nodes:
    exit(0)
uuid = nodes[0]['id']

# Update status
mutation = 'mutation { issueUpdate(id: \"%s\", input: { stateId: \"$state_id\" }) { success } }' % uuid
payload = json.dumps({'query': mutation}).encode()
req = urllib.request.Request('https://api.linear.app/graphql', data=payload,
    headers={'Authorization': os.environ['LINEAR_API_KEY'], 'Content-Type': 'application/json'})
urllib.request.urlopen(req)
" 2>/dev/null || true
}

# Strip cd prefixes (agents often cd into worktrees first)
cd_prefix_pattern='^[[:space:]]*cd[[:space:]]+.*[[:space:]]+(&&|;)[[:space:]]+(.*)'
clean_command="$command"
while [[ "$clean_command" =~ ^[[:space:]]*cd[[:space:]] ]]; do
  if [[ "$clean_command" =~ $cd_prefix_pattern ]]; then
    clean_command="${BASH_REMATCH[2]}"
  else
    break
  fi
done

# Detect: ao spawn IDE-XXX
if [[ "$clean_command" =~ ao[[:space:]]+spawn[[:space:]]+(IDE-[0-9]+) ]]; then
  issue="${BASH_REMATCH[1]}"
  update_linear "$issue" "$STATE_IN_PROGRESS" &
  echo '{"systemMessage": "Linear: '"$issue"' -> In Progress"}'
  exit 0
fi

# Detect: gh pr merge
if [[ "$clean_command" =~ gh[[:space:]]+pr[[:space:]]+merge ]]; then
  # Extract issue ID from current branch name (e.g., oliverswitzer/ide-96-build-...)
  issue=$(git branch --show-current 2>/dev/null | grep -oEi 'IDE-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]') || true

  # If not in branch name, try extracting PR number and querying PR title
  if [[ -z "$issue" ]]; then
    pr_num=$(echo "$clean_command" | grep -oE '[0-9]+' | head -1) || true
    if [[ -n "$pr_num" ]]; then
      issue=$(gh pr view "$pr_num" --json title --jq '.title' 2>/dev/null | grep -oEi 'IDE-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]') || true
    fi
  fi

  if [[ -n "$issue" ]]; then
    update_linear "$issue" "$STATE_DONE" &
    echo '{"systemMessage": "Linear: '"$issue"' -> Done"}'
    exit 0
  fi
fi

echo '{}'
exit 0
