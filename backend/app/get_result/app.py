import json
import os
import re
from decimal import Decimal

import boto3

TABLE_NAME = os.environ["TABLE_NAME"]
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
table = boto3.resource("dynamodb").Table(TABLE_NAME)

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)
FINAL_STATUSES = {"DONE", "FAILED"}


def decimal_to_number(value):
    """DynamoDB returns numbers as Decimal, which json.dumps can't handle."""
    if isinstance(value, Decimal):
        return int(value) if value == int(value) else float(value)
    raise TypeError(f"Cannot serialize {type(value).__name__}")


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Cache-Control": "no-store",   # results change while processing
        },
        "body": json.dumps(body, default=decimal_to_number),
    }


def lambda_handler(event, context):
    # 1. Validate the ID from the URL path
    resume_id = ((event.get("pathParameters") or {}).get("resumeId") or "").lower()
    if not UUID_PATTERN.match(resume_id):
        return response(400, {"error": "Invalid resumeId format"})

    # 2. Fetch only the fields the frontend needs
    #    (never return extractedText or jobDescription: less data, more privacy)
    item = table.get_item(
        Key={"resumeId": resume_id},
        ProjectionExpression="resumeId, #s, analysis, targetRole, pageCount, "
                             "errorMessage, createdAt, updatedAt",
        ExpressionAttributeNames={"#s": "status"},
    ).get("Item")

    if not item:
        return response(404, {"error": "Resume not found"})

    # 3. Shape the response
    status = item.get("status", "UNKNOWN")
    body = {
        "resumeId": item["resumeId"],
        "status": status,
        "isComplete": status in FINAL_STATUSES,
        "targetRole": item.get("targetRole", ""),
        "pageCount": item.get("pageCount"),
        "createdAt": item.get("createdAt"),
        "updatedAt": item.get("updatedAt"),
    }
    if status == "DONE":
        body["analysis"] = item.get("analysis")
    elif status == "FAILED":
        body["error"] = item.get("errorMessage", "Processing failed")

    return response(200, body)