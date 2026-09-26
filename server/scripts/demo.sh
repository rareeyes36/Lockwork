#!/usr/bin/env bash
# Curl-based demo loop (alternative to `npm run demo`).
set -euo pipefail
BASE="${STUB_BASE:-http://127.0.0.1:3847}"
TS=$(date +%s)

json() { python3 -c 'import json,sys; print(json.load(sys.stdin)'"$1"')'; }

echo "health"
curl -sf "$BASE/api/health" | head -c 200; echo

EMP=$(curl -sf -X POST "$BASE/api/users" -H 'Content-Type: application/json' \
  -d "{\"handle\":\"curl_emp_$TS\",\"display_name\":\"Curl Emp\",\"email\":\"curl_emp_$TS@ex.com\"}")
WRK=$(curl -sf -X POST "$BASE/api/users" -H 'Content-Type: application/json' \
  -d "{\"handle\":\"curl_wrk_$TS\",\"display_name\":\"Curl Wrk\",\"email\":\"curl_wrk_$TS@ex.com\"}")
EMP_ID=$(echo "$EMP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
WRK_ID=$(echo "$WRK" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

WS=$(curl -sf -X POST "$BASE/api/workspaces" -H 'Content-Type: application/json' \
  -d "{\"employer_user_id\":\"$EMP_ID\",\"name\":\"Curl WS $TS\",\"slug\":\"curl-ws-$TS\"}")
WS_ID=$(echo "$WS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

DEADLINE=$(python3 -c 'from datetime import datetime,timedelta,timezone; print((datetime.now(timezone.utc)+timedelta(days=7)).isoformat())')
JOB=$(curl -sf -X POST "$BASE/api/jobs" -H 'Content-Type: application/json' \
  -d "{\"workspace_id\":\"$WS_ID\",\"employer_user_id\":\"$EMP_ID\",\"title\":\"Curl job\",\"requirements\":\"demo\",\"deadline_at\":\"$DEADLINE\",\"amount\":1000,\"currency\":\"USD\",\"rail\":\"custodial\"}")
JOB_ID=$(echo "$JOB" | python3 -c 'import json,sys; print(json.load(sys.stdin)["job"]["id"])')

curl -sf -X POST "$BASE/api/jobs/$JOB_ID/fund" >/dev/null
SUB=$(curl -sf -X POST "$BASE/api/jobs/$JOB_ID/submissions" -H 'Content-Type: application/json' \
  -d "{\"submitter_user_id\":\"$WRK_ID\",\"demo_url\":\"https://example.com/c/$TS\"}")
SUB_ID=$(echo "$SUB" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
curl -sf -X POST "$BASE/api/jobs/$JOB_ID/review" >/dev/null
PAID=$(curl -sf -X POST "$BASE/api/jobs/$JOB_ID/pay" -H 'Content-Type: application/json' \
  -d "{\"submission_id\":\"$SUB_ID\"}")
echo "$PAID" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["job"]["status"]=="paid"; assert float(d["fee"]["fee_amount"])==25; assert d["employment"]["seat_status"]=="pending"; print("DEMO PASSED", d["fee"])'

echo "on-chain (sim) rail + refund"
JOB2=$(curl -sf -X POST "$BASE/api/jobs" -H 'Content-Type: application/json' \
  -d "{\"company_id\":\"$WS_ID\",\"title\":\"Curl USDC job\",\"requirements\":\"demo\",\"amount\":500,\"rail\":\"onchain\"}")
JOB2_ID=$(echo "$JOB2" | python3 -c 'import json,sys; print(json.load(sys.stdin)["job"]["id"])')
curl -sf -X POST "$BASE/api/jobs/$JOB2_ID/fund" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["tx_ref"].startswith("0x"); print("locked on Base (sim)", d["tx_ref"][:18])'
BOT=$(curl -sf -X POST "$BASE/api/companies/$WS_ID/bots" -H 'Content-Type: application/json' \
  -d "{\"name\":\"curl-bot\",\"kind\":\"job_scoped\",\"job_id\":\"$JOB2_ID\",\"operator_user_id\":\"$WRK_ID\"}")
BOT_ID=$(echo "$BOT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
curl -sf -X POST "$BASE/api/jobs/$JOB2_ID/submissions" -H 'Content-Type: application/json' \
  -d "{\"submitter_bot_id\":\"$BOT_ID\",\"demo_url\":\"https://example.com/bot/$TS\"}" >/dev/null
curl -sf -X POST "$BASE/api/jobs/$JOB2_ID/cancel" -H 'Content-Type: application/json' -d '{"reason":"cancelled"}' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["refund"]["fee"]=="0" and d["job"]["status"]=="cancelled_refunded"; print("REFUND PASSED", d["refund"])'
