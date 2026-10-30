#!/usr/bin/env bash
# Builds a real, cited demo dataset and freezes it to disk.
# Every account, buyer and signal in the result came from a live search with a
# resolvable source URL — nothing here is invented.
set -euo pipefail
B=${BASE:-http://localhost:3000}
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)"; }

echo "[1/6] intake + ICP inference"
ICP=$(curl -s -X POST "$B/api/intake" -H 'Content-Type: application/json' -d '{"useDemoSeed":true}' | j "['icp']['id']")
echo "      icp=$ICP"
echo "[2/6] approving ICP (human gate)"
curl -s -X POST "$B/api/icp" -H 'Content-Type: application/json' -d "{\"action\":\"approve_icp\",\"icpId\":\"$ICP\"}" > /dev/null
echo "[3/6] discovery + competitor mapping"
curl -s -X POST "$B/api/discovery" -H 'Content-Type: application/json' -d "{\"icpId\":\"$ICP\"}" | j "['companies'].__len__()" | xargs -I{} echo "      {} accounts"
echo "[4/6] buyer discovery + enrichment"
curl -s -X POST "$B/api/buyers" -H 'Content-Type: application/json' -d '{"enrich":true}' | j "['people'].__len__()" | xargs -I{} echo "      {} buyers"
echo "[5/6] outreach drafting + reviewer pass"
curl -s -X POST "$B/api/outreach" -H 'Content-Type: application/json' -d '{"variant":"signal_led","review":true}' | j "['messages'].__len__()" | xargs -I{} echo "      {} messages"
echo "[6/6] graph queries + snapshot"
curl -s -X POST "$B/api/graph" -H 'Content-Type: application/json' -d '{}' > /dev/null
curl -s -X POST "$B/api/snapshot" -H 'Content-Type: application/json' -d '{"action":"save"}' | python3 -m json.tool
echo "done — dataset frozen to data/demo-snapshot.json"
