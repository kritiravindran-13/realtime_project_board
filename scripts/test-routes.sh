#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required."
  exit 1
fi

json_get() {
  local json="$1"
  local expression="$2"
  node -e "const v=((obj)=>$expression)(JSON.parse(process.argv[1])); if(v===undefined||v===null){process.exit(2)}; process.stdout.write(String(v));" "$json"
}

request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"

  local response
  if [ -n "$body" ]; then
    response="$(curl -sS -X "$method" "$url" -H "Content-Type: application/json" -d "$body" -w $'\n%{http_code}')"
  else
    response="$(curl -sS -X "$method" "$url" -w $'\n%{http_code}')"
  fi

  HTTP_BODY="${response%$'\n'*}"
  HTTP_CODE="${response##*$'\n'}"
}

echo "Testing routes against: $BASE_URL"

# Health check
request "GET" "$BASE_URL/api/projects"
if [ "$HTTP_CODE" -ge 500 ]; then
  echo "Server appears unavailable or failing (GET /api/projects -> $HTTP_CODE)."
  echo "Start app with: npm run dev"
  exit 1
fi

echo "1) Create project"
request "POST" "$BASE_URL/api/projects" '{"name":"Route Test Project","description":"E2E route test","metadata":{"source":"scripts/test-routes.sh"}}'
if [ "$HTTP_CODE" != "201" ]; then
  echo "Expected 201 creating project, got $HTTP_CODE"
  echo "$HTTP_BODY"
  exit 1
fi
PROJECT_ID="$(json_get "$HTTP_BODY" "obj.id")"
echo "   Project ID: $PROJECT_ID"

echo "2) Create Task A"
request "POST" "$BASE_URL/api/tasks" "{\"projectId\":\"$PROJECT_ID\",\"title\":\"Task A\",\"status\":\"todo\"}"
if [ "$HTTP_CODE" != "201" ]; then
  echo "Expected 201 creating task A, got $HTTP_CODE"
  echo "$HTTP_BODY"
  exit 1
fi
TASK_A_ID="$(json_get "$HTTP_BODY" "obj.id")"
echo "   Task A ID: $TASK_A_ID"

echo "3) Create Task B"
request "POST" "$BASE_URL/api/tasks" "{\"projectId\":\"$PROJECT_ID\",\"title\":\"Task B\",\"status\":\"todo\"}"
if [ "$HTTP_CODE" != "201" ]; then
  echo "Expected 201 creating task B, got $HTTP_CODE"
  echo "$HTTP_BODY"
  exit 1
fi
TASK_B_ID="$(json_get "$HTTP_BODY" "obj.id")"
echo "   Task B ID: $TASK_B_ID"

echo "4) Set B dependencies => [A]"
request "PUT" "$BASE_URL/api/tasks/$TASK_B_ID/dependencies" "{\"dependencyIds\":[\"$TASK_A_ID\"],\"actorName\":\"route-test\"}"
if [ "$HTTP_CODE" != "200" ]; then
  echo "Expected 200 setting dependencies, got $HTTP_CODE"
  echo "$HTTP_BODY"
  exit 1
fi

echo "5) Try set B to done before A (expect 409)"
request "PATCH" "$BASE_URL/api/tasks/$TASK_B_ID/status" '{"status":"done","actorName":"route-test"}'
if [ "$HTTP_CODE" != "409" ]; then
  echo "Expected 409 when dependencies incomplete, got $HTTP_CODE"
  echo "$HTTP_BODY"
  exit 1
fi

echo "6) Set A done"
request "PATCH" "$BASE_URL/api/tasks/$TASK_A_ID/status" '{"status":"done","actorName":"route-test"}'
if [ "$HTTP_CODE" != "200" ]; then
  echo "Expected 200 setting A done, got $HTTP_CODE"
  echo "$HTTP_BODY"
  exit 1
fi

echo "7) Set B done (now should pass)"
request "PATCH" "$BASE_URL/api/tasks/$TASK_B_ID/status" '{"status":"done","actorName":"route-test"}'
if [ "$HTTP_CODE" != "200" ]; then
  echo "Expected 200 setting B done, got $HTTP_CODE"
  echo "$HTTP_BODY"
  exit 1
fi

echo "8) Add comment on Task B"
request "POST" "$BASE_URL/api/tasks/$TASK_B_ID/comments" '{"content":"Looks good","author":"route-test"}'
if [ "$HTTP_CODE" != "201" ]; then
  echo "Expected 201 adding comment, got $HTTP_CODE"
  echo "$HTTP_BODY"
  exit 1
fi
COMMENT_ID="$(json_get "$HTTP_BODY" "obj.id")"
echo "   Comment ID: $COMMENT_ID"

echo "9) List comments for Task B"
request "GET" "$BASE_URL/api/tasks/$TASK_B_ID/comments"
if [ "$HTTP_CODE" != "200" ]; then
  echo "Expected 200 listing comments, got $HTTP_CODE"
  echo "$HTTP_BODY"
  exit 1
fi
COMMENT_COUNT="$(json_get "$HTTP_BODY" "obj.length")"
if [ "$COMMENT_COUNT" -lt 1 ]; then
  echo "Expected at least one comment, got $COMMENT_COUNT"
  echo "$HTTP_BODY"
  exit 1
fi

echo "10) Optional DB check (TaskEvent rows)"
if command -v sqlite3 >/dev/null 2>&1 && [ -f "prisma/dev.db" ]; then
  EVENT_ROWS="$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM TaskEvent WHERE taskId IN ('$TASK_A_ID','$TASK_B_ID');" 2>/dev/null || true)"
  if [ -n "$EVENT_ROWS" ]; then
    echo "   TaskEvent rows for Task A/B: $EVENT_ROWS"
  else
    echo "   Could not query TaskEvent (table may not exist yet)."
  fi
else
  echo "   Skipping sqlite check (sqlite3 or prisma/dev.db missing)."
fi

echo ""
echo "All route checks passed."
echo "Created:"
echo "  PROJECT_ID=$PROJECT_ID"
echo "  TASK_A_ID=$TASK_A_ID"
echo "  TASK_B_ID=$TASK_B_ID"
echo "  COMMENT_ID=$COMMENT_ID"

