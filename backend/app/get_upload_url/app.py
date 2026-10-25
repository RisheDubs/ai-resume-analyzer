import json
import os
import time
import uuid

import boto3
from botocore.config import Config

REGION = os.environ["AWS_REGION"]
BUCKET_NAME = os.environ["BUCKET_NAME"]
TABLE_NAME = os.environ["TABLE_NAME"]
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

URL_EXPIRY_SECONDS = 300                   # upload link valid for 5 minutes
RETENTION_DAYS = 30                        # matches the S3 lifecycle rule
MAX_FILE_BYTES = 5 * 1024 * 1024           # 5 MB
MAX_JOB_DESCRIPTION_CHARS = 5000

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
}

s3 = boto3.client(
    "s3",
    region_name=REGION,
    config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
)
table = boto3.resource("dynamodb").Table(TABLE_NAME)


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        },
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    # 1. Parse and validate input
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "Request body must be valid JSON"})

    content_type = body.get("contentType")
    if content_type not in ALLOWED_TYPES:
        return response(400, {
            "error": "contentType must be one of: " + ", ".join(ALLOWED_TYPES)
        })

    file_size = body.get("fileSize")
    if file_size is not None:
        if not isinstance(file_size, int) or file_size <= 0:
            return response(400, {"error": "fileSize must be a positive integer"})
        if file_size > MAX_FILE_BYTES:
            return response(400, {"error": "File is too large. Maximum size is 5 MB."})

    target_role = str(body.get("targetRole", ""))[:100]
    job_description = str(body.get("jobDescription", ""))[:MAX_JOB_DESCRIPTION_CHARS]

    try:
        # 2. Create an ID and the S3 location
        resume_id = str(uuid.uuid4())
        s3_key = f"uploads/{resume_id}.{ALLOWED_TYPES[content_type]}"
        now = int(time.time())

        # 3. Record the request in DynamoDB
        table.put_item(Item={
            "resumeId": resume_id,
            "status": "PENDING",
            "s3Key": s3_key,
            "contentType": content_type,
            "targetRole": target_role,
            "jobDescription": job_description,
            "createdAt": now,
            "expiresAt": now + RETENTION_DAYS * 24 * 60 * 60,
        })

        # 4. Generate a temporary upload link
        upload_url = s3.generate_presigned_url(
            "put_object",
            Params={"Bucket": BUCKET_NAME, "Key": s3_key, "ContentType": content_type},
            ExpiresIn=URL_EXPIRY_SECONDS,
        )
    except Exception as error:
        print(json.dumps({"msg": "upload_url_failed", "error": str(error)}))
        return response(500, {"error": "Could not create upload link. Please try again."})

    print(json.dumps({"msg": "upload_url_created", "resumeId": resume_id, "key": s3_key}))
    return response(200, {
        "resumeId": resume_id,
        "uploadUrl": upload_url,
        "expiresIn": URL_EXPIRY_SECONDS,
    })