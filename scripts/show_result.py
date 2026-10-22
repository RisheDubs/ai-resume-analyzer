"""
Show the status and AI analysis for a resume.
Usage: python scripts/show_result.py <resumeId>
"""
import json
import sys

import boto3

TABLE_NAME = "ai-resume-analyzer-results"
REGION = "us-east-1"

if len(sys.argv) != 2:
    sys.exit("Usage: python scripts/show_result.py <resumeId>")

table = boto3.resource("dynamodb", region_name=REGION).Table(TABLE_NAME)
item = table.get_item(Key={"resumeId": sys.argv[1]}).get("Item")
if not item:
    sys.exit("No record found for that resumeId")

print(f"Status:      {item.get('status')}")
print(f"Target role: {item.get('targetRole') or '-'}")
print(f"Pages:       {item.get('pageCount', '-')}")
print(f"Model:       {item.get('modelId', '-')}")
if item.get("errorMessage"):
    print(f"Error:       {item['errorMessage']}")

analysis = item.get("analysis")
if analysis:
    # DynamoDB returns numbers as Decimal; convert for printing
    print(json.dumps(analysis, indent=2, default=int))