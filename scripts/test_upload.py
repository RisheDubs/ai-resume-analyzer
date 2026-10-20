"""
Test the upload flow end to end.
Usage: python scripts/test_upload.py <API_BASE_URL> <path-to-resume>
"""
import json
import mimetypes
import sys
import urllib.error
import urllib.request

if len(sys.argv) != 3:
    sys.exit("Usage: python scripts/test_upload.py <API_BASE_URL> <path-to-resume>")

api_base = sys.argv[1].rstrip("/")
file_path = sys.argv[2]
content_type = mimetypes.guess_type(file_path)[0]
print(f"File: {file_path}  ({content_type})")

# Step 1: ask the API for an upload URL
request = urllib.request.Request(
    f"{api_base}/upload-url",
    data=json.dumps({"contentType": content_type, "targetRole": "Cloud Engineer"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(request) as resp:
        data = json.load(resp)
except urllib.error.HTTPError as e:
    sys.exit(f"API error {e.code}: {e.read().decode()}")

print(f"resumeId: {data['resumeId']}")

# Step 2: upload the file directly to S3
with open(file_path, "rb") as f:
    upload = urllib.request.Request(
        data["uploadUrl"],
        data=f.read(),
        headers={"Content-Type": content_type},
        method="PUT",
    )
try:
    with urllib.request.urlopen(upload) as resp:
        print(f"Upload to S3: HTTP {resp.status} - success")
except urllib.error.HTTPError as e:
    sys.exit(f"S3 upload error {e.code}: {e.read().decode()}")