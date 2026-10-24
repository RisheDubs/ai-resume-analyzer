"""
End-to-end test: get an upload URL, upload a resume, wait for the AI analysis.
Usage: python scripts/test_upload.py <API_BASE_URL> <path-to-resume> [target-role]
"""
import json
import mimetypes
import sys
import time
import urllib.error
import urllib.request

POLL_SECONDS = 3
TIMEOUT_SECONDS = 180


def http_json(url, method="GET", payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method=method
    )
    try:
        with urllib.request.urlopen(request) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        sys.exit(f"API error {e.code} from {method} {url}: {e.read().decode()}")


if len(sys.argv) not in (3, 4):
    sys.exit("Usage: python scripts/test_upload.py <API_BASE_URL> <path-to-resume> [target-role]")

api_base = sys.argv[1].rstrip("/")
file_path = sys.argv[2]
target_role = sys.argv[3] if len(sys.argv) == 4 else "Cloud Engineer"
content_type = mimetypes.guess_type(file_path)[0]
if content_type not in ("application/pdf", "image/png", "image/jpeg"):
    sys.exit(f"Unsupported file type: {content_type}. Use PDF, PNG or JPEG.")

print(f"File:        {file_path} ({content_type})")
print(f"Target role: {target_role}")

# Step 1: get an upload URL
upload = http_json(f"{api_base}/upload-url", "POST",
                   {"contentType": content_type, "targetRole": target_role})
resume_id = upload["resumeId"]
print(f"resumeId:    {resume_id}")

# Step 2: upload the file directly to S3
with open(file_path, "rb") as f:
    put = urllib.request.Request(upload["uploadUrl"], data=f.read(),
                                 headers={"Content-Type": content_type}, method="PUT")
try:
    with urllib.request.urlopen(put):
        print("Upload:      success")
except urllib.error.HTTPError as e:
    sys.exit(f"S3 upload error {e.code}: {e.read().decode()}")

# Step 3: poll the results API
print("Progress:", end="", flush=True)
started = time.time()
last_status = None
while True:
    result = http_json(f"{api_base}/results/{resume_id}")
    status = result["status"]
    if status != last_status:
        print(f" {status}", end="", flush=True)
        last_status = status
    else:
        print(".", end="", flush=True)
    if result.get("isComplete"):
        break
    if time.time() - started > TIMEOUT_SECONDS:
        sys.exit("\nTimed out waiting for the analysis")
    time.sleep(POLL_SECONDS)

print(f"\nFinished in {time.time() - started:.0f}s\n")

if status == "FAILED":
    sys.exit(f"Analysis failed: {result.get('error')}")

# Step 4: print a readable report
a = result["analysis"]
print(f"ATS SCORE: {a['ats_score']}/100")
for name, score in a["section_scores"].items():
    print(f"  {name:<15}{score}")


def section(title, items):
    print(f"\n{title}")
    for item in items:
        print(f"  - {item}")


section("STRENGTHS", a["strengths"])
section("MISSING KEYWORDS", a["missing_keywords"])
section("IMPROVEMENTS", a["improvements"])
section("RECOMMENDED SKILLS", a["recommended_skills"])
print(f"\nPROFESSIONAL SUMMARY\n  {a['professional_summary']}")