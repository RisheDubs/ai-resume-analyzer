"""
Load interview prep questions into your private DynamoDB table.

First-time setup (adds the 40 starter questions; existing ones are skipped):
    python scripts/seed_prep.py you@example.com

Restore from a backup downloaded from the developer page (overwrites, including notes):
    python scripts/seed_prep.py you@example.com --file dev-data/backup.json --overwrite
"""
import argparse
import json
import pathlib
import time

import boto3
from botocore.exceptions import ClientError

STACK_NAME = "ai-resume-analyzer"
REGION = "us-east-1"
DEFAULT_FILE = pathlib.Path(__file__).resolve().parent.parent / "dev-data" / "questions.json"
CONTENT_FIELDS = ("role", "order", "category", "difficulty", "question", "points",
                  "project", "tip", "similar", "custom")

parser = argparse.ArgumentParser(description="Seed or restore developer interview prep data")
parser.add_argument("email", help="the email you sign in to the developer page with")
parser.add_argument("--file", default=str(DEFAULT_FILE), help="questions JSON (default: dev-data/questions.json)")
parser.add_argument("--overwrite", action="store_true",
                    help="replace existing questions (use when restoring a backup)")
args = parser.parse_args()

outputs = {
    o["OutputKey"]: o["OutputValue"]
    for o in boto3.client("cloudformation", region_name=REGION)
    .describe_stacks(StackName=STACK_NAME)["Stacks"][0]["Outputs"]
}

# Find your Cognito user ID ("sub"): your data is stored under it
user = boto3.client("cognito-idp", region_name=REGION).admin_get_user(
    UserPoolId=outputs["DevUserPoolId"], Username=args.email
)
user_id = next(a["Value"] for a in user["UserAttributes"] if a["Name"] == "sub")

data = json.loads(pathlib.Path(args.file).read_text(encoding="utf-8"))
questions = data["questions"] if isinstance(data, dict) else data

table = boto3.resource("dynamodb", region_name=REGION).Table(outputs["PrepTableName"])
added = skipped = 0
for q in questions:
    item = {field: q[field] for field in CONTENT_FIELDS if field in q}
    item.update({
        "userId": user_id,
        "questionId": q.get("questionId") or q["id"],
        "practiced": bool(q.get("practiced", False)),
        "notes": q.get("notes", ""),
        "custom": bool(q.get("custom", False)),
        "updatedAt": int(time.time()),
    })
    try:
        if args.overwrite:
            table.put_item(Item=item)
        else:
            table.put_item(Item=item, ConditionExpression="attribute_not_exists(questionId)")
        added += 1
    except ClientError as error:
        if error.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        skipped += 1

print(f"Written: {added}   Skipped (already existed): {skipped}")
print(f"Open the developer page: {outputs['DevPortalUrl']}")
