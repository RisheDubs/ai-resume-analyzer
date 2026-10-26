"""
Developer-only interview prep API.

Every route sits behind an API Gateway Cognito authorizer, so a request only
reaches this function with a valid login token. Data is partitioned by the
caller's Cognito user ID ("sub"), so each user only ever sees their own items.

Routes:
  GET    /prep/questions                 list all questions with progress
  PUT    /prep/questions/{questionId}    create a question or replace its content
  PATCH  /prep/questions/{questionId}    update progress: practiced, notes
  DELETE /prep/questions/{questionId}    delete a question
"""
import json
import os
import re
import time
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

TABLE = boto3.resource("dynamodb").Table(os.environ["PREP_TABLE"])
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,59}$")
ROLES = {"cloud", "dev"}
DIFFICULTIES = {"Easy", "Medium", "Hard"}
MAX_NOTES_CHARS = 5000


class BadRequest(Exception):
    pass


def to_json(value):
    if isinstance(value, Decimal):
        return int(value) if value == int(value) else float(value)
    raise TypeError(f"Cannot serialize {type(value).__name__}")


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Cache-Control": "no-store",
        },
        "body": json.dumps(body, default=to_json),
    }


def text(body, field, max_len, required=False):
    value = body.get(field, "")
    if not isinstance(value, str):
        raise BadRequest(f"{field} must be text")
    value = value.strip()
    if required and not value:
        raise BadRequest(f"{field} is required")
    if len(value) > max_len:
        raise BadRequest(f"{field} must be at most {max_len} characters")
    return value


def clean_question(body):
    """Validate everything the browser sends; never trust the client."""
    role = body.get("role")
    if role not in ROLES:
        raise BadRequest("role must be 'cloud' or 'dev'")
    difficulty = body.get("difficulty")
    if difficulty not in DIFFICULTIES:
        raise BadRequest("difficulty must be Easy, Medium or Hard")

    points = body.get("points")
    if not isinstance(points, list) or not points:
        raise BadRequest("points must be a non-empty list")
    if len(points) > 12:
        raise BadRequest("at most 12 points")
    cleaned_points = []
    for point in points:
        if not isinstance(point, str) or not point.strip() or len(point) > 500:
            raise BadRequest("each point must be 1-500 characters of text")
        cleaned_points.append(point.strip())

    similar = text(body, "similar", 60)
    if similar and not ID_PATTERN.match(similar):
        raise BadRequest("similar must be a question ID")

    order = body.get("order", 0)
    if not isinstance(order, int) or not 0 <= order <= 10000:
        raise BadRequest("order must be a whole number")

    return {
        "role": role,
        "difficulty": difficulty,
        "category": text(body, "category", 40, required=True),
        "question": text(body, "question", 300, required=True),
        "points": cleaned_points,
        "project": text(body, "project", 600),
        "tip": text(body, "tip", 400),
        "similar": similar,
        "order": order,
        "custom": bool(body.get("custom", False)),
    }


def list_questions(user_id):
    items, kwargs = [], {"KeyConditionExpression": Key("userId").eq(user_id)}
    while True:
        page = TABLE.query(**kwargs)
        items += page["Items"]
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    for item in items:
        item.pop("userId", None)
    return response(200, {"questions": items})


def put_question(user_id, question_id, body):
    fields = clean_question(body)
    fields["updatedAt"] = int(time.time())
    names, values, sets = {}, {}, []
    for i, (field, value) in enumerate(fields.items()):
        names[f"#f{i}"] = field
        values[f":v{i}"] = value
        sets.append(f"#f{i} = :v{i}")
    # Keep existing progress when editing; start fresh for new questions
    sets += ["practiced = if_not_exists(practiced, :no)", "notes = if_not_exists(notes, :empty)"]
    values.update({":no": False, ":empty": ""})
    result = TABLE.update_item(
        Key={"userId": user_id, "questionId": question_id},
        UpdateExpression="SET " + ", ".join(sets),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ReturnValues="ALL_NEW",
    )
    item = result["Attributes"]
    item.pop("userId", None)
    return response(200, {"question": item})


def patch_progress(user_id, question_id, body):
    names, values, sets = {}, {":u": int(time.time())}, ["updatedAt = :u"]
    if "practiced" in body:
        if not isinstance(body["practiced"], bool):
            raise BadRequest("practiced must be true or false")
        names["#p"] = "practiced"
        values[":p"] = body["practiced"]
        sets.append("#p = :p")
    if "notes" in body:
        notes = body["notes"]
        if not isinstance(notes, str) or len(notes) > MAX_NOTES_CHARS:
            raise BadRequest(f"notes must be text up to {MAX_NOTES_CHARS} characters")
        names["#n"] = "notes"
        values[":n"] = notes
        sets.append("#n = :n")
    if len(sets) == 1:
        raise BadRequest("Send practiced and/or notes")
    try:
        TABLE.update_item(
            Key={"userId": user_id, "questionId": question_id},
            UpdateExpression="SET " + ", ".join(sets),
            ConditionExpression="attribute_exists(questionId)",
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
        )
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return response(404, {"error": "Question not found"})
        raise
    return response(200, {"ok": True})


def delete_question(user_id, question_id):
    try:
        TABLE.delete_item(
            Key={"userId": user_id, "questionId": question_id},
            ConditionExpression="attribute_exists(questionId)",
        )
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return response(404, {"error": "Question not found"})
        raise
    return response(200, {"ok": True})


def lambda_handler(event, context):
    try:
        # Set by the Cognito authorizer; requests without a valid token never get here
        user_id = event["requestContext"]["authorizer"]["claims"]["sub"]
    except (KeyError, TypeError):
        return response(401, {"error": "Not signed in"})

    method = event.get("httpMethod")
    question_id = (event.get("pathParameters") or {}).get("questionId")

    try:
        if method == "GET" and not question_id:
            return list_questions(user_id)

        if not question_id or not ID_PATTERN.match(question_id):
            return response(400, {"error": "Invalid question ID"})

        if method == "DELETE":
            return delete_question(user_id, question_id)

        try:
            body = json.loads(event.get("body") or "{}")
        except json.JSONDecodeError:
            return response(400, {"error": "Request body must be valid JSON"})
        if not isinstance(body, dict):
            return response(400, {"error": "Request body must be a JSON object"})

        if method == "PUT":
            return put_question(user_id, question_id, body)
        if method == "PATCH":
            return patch_progress(user_id, question_id, body)
        return response(405, {"error": "Method not allowed"})

    except BadRequest as error:
        return response(400, {"error": str(error)})
    except Exception as error:
        print(json.dumps({"msg": "prep_api_failed", "method": method, "error": str(error)}))
        return response(500, {"error": "Something went wrong. Please try again."})
