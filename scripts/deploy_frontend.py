"""
Upload frontend/ to the website bucket and refresh the CloudFront cache.
Usage: python scripts/deploy_frontend.py
"""
import pathlib
import time

import boto3

STACK_NAME = "ai-resume-analyzer"
REGION = "us-east-1"
FRONTEND_DIR = pathlib.Path(__file__).resolve().parent.parent / "frontend"

# Set content types explicitly (Windows can report .js as text/plain)
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
}

outputs = {
    o["OutputKey"]: o["OutputValue"]
    for o in boto3.client("cloudformation", region_name=REGION)
    .describe_stacks(StackName=STACK_NAME)["Stacks"][0]["Outputs"]
}
bucket = outputs["WebsiteBucketName"]
distribution_id = outputs["DistributionId"]

s3 = boto3.client("s3", region_name=REGION)
for path in sorted(FRONTEND_DIR.rglob("*")):
    if not path.is_file():
        continue
    key = path.relative_to(FRONTEND_DIR).as_posix()
    content_type = CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")
    s3.upload_file(str(path), bucket, key, ExtraArgs={"ContentType": content_type})
    print(f"Uploaded {key} ({content_type})")

boto3.client("cloudfront").create_invalidation(
    DistributionId=distribution_id,
    InvalidationBatch={
        "Paths": {"Quantity": 1, "Items": ["/*"]},
        "CallerReference": str(time.time()),
    },
)
print("\nCloudFront cache refresh started (takes about 1 minute).")
print(f"Live site: {outputs['WebsiteUrl']}")