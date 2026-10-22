import json
import os
import time
import urllib.parse

import boto3

from analyzer import MODEL_ID, analyze_resume

TABLE_NAME = os.environ["TABLE_NAME"]

POLL_INTERVAL_SECONDS = 2      # how often to check an async Textract job
MAX_WAIT_SECONDS = 90          # give up on Textract after this
MAX_TEXT_CHARS = 50000         # keep well under DynamoDB's 400 KB item limit

textract = boto3.client("textract")
table = boto3.resource("dynamodb").Table(TABLE_NAME)


def log(msg, **fields):
    """Structured JSON log line for CloudWatch."""
    print(json.dumps({"msg": msg, **fields}))


def set_status(resume_id, status, **fields):
    """Update status (plus any extra fields) on the resume's DynamoDB row."""
    names = {"#s": "status"}
    values = {":s": status, ":u": int(time.time())}
    expression = "SET #s = :s, updatedAt = :u"
    for i, (field, value) in enumerate(fields.items()):
        names[f"#f{i}"] = field
        values[f":v{i}"] = value
        expression += f", #f{i} = :v{i}"
    table.update_item(
        Key={"resumeId": resume_id},
        UpdateExpression=expression,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


# ---------- Textract ----------

def lines_from_blocks(blocks):
    return [b["Text"] for b in blocks if b["BlockType"] == "LINE"]


def extract_from_image(bucket, key):
    response = textract.detect_document_text(
        Document={"S3Object": {"Bucket": bucket, "Name": key}}
    )
    return lines_from_blocks(response["Blocks"]), 1


def extract_from_pdf(bucket, key):
    job = textract.start_document_text_detection(
        DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}}
    )
    job_id = job["JobId"]
    log("textract_job_started", jobId=job_id)

    deadline = time.time() + MAX_WAIT_SECONDS
    while True:
        response = textract.get_document_text_detection(JobId=job_id)
        job_status = response["JobStatus"]
        if job_status in ("SUCCEEDED", "PARTIAL_SUCCESS"):
            break
        if job_status == "FAILED":
            raise RuntimeError(response.get("StatusMessage", "Textract job failed"))
        if time.time() > deadline:
            raise TimeoutError("Textract took too long to process the document")
        time.sleep(POLL_INTERVAL_SECONDS)

    pages = response["DocumentMetadata"]["Pages"]
    lines = lines_from_blocks(response["Blocks"])
    next_token = response.get("NextToken")
    while next_token:
        response = textract.get_document_text_detection(JobId=job_id, NextToken=next_token)
        lines += lines_from_blocks(response["Blocks"])
        next_token = response.get("NextToken")
    return lines, pages


def extract_text(bucket, key, extension):
    if extension == "pdf":
        lines, pages = extract_from_pdf(bucket, key)
    else:
        lines, pages = extract_from_image(bucket, key)
    text = "\n".join(lines).strip()
    if not text:
        raise ValueError("No readable text found in the document")
    return text[:MAX_TEXT_CHARS], pages


# ---------- Handler ----------

def lambda_handler(event, context):
    for record in event["Records"]:
        bucket = record["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])
        filename = key.split("/")[-1]
        resume_id, _, extension = filename.rpartition(".")

        log("processing_started", resumeId=resume_id, key=key)
        set_status(resume_id, "PROCESSING")

        try:
            # 1. Extract text
            text, pages = extract_text(bucket, key, extension)
            set_status(resume_id, "TEXT_EXTRACTED",
                       extractedText=text, pageCount=pages, charCount=len(text))
            log("text_extracted", resumeId=resume_id, pages=pages, chars=len(text))

            # 2. Load the user's target role / job description
            item = table.get_item(Key={"resumeId": resume_id}).get("Item", {})

            # 3. Analyze with Bedrock
            set_status(resume_id, "ANALYZING")
            started = time.time()
            analysis, usage = analyze_resume(
                text, item.get("targetRole", ""), item.get("jobDescription", "")
            )
            set_status(resume_id, "DONE", analysis=analysis, modelId=MODEL_ID)
            log("analysis_complete", resumeId=resume_id,
                atsScore=analysis["ats_score"],
                seconds=round(time.time() - started, 1),
                inputTokens=usage.get("inputTokens"),
                outputTokens=usage.get("outputTokens"))

        except Exception as error:
            # Record the failure instead of crashing, so S3 doesn't retry
            # and charge for duplicate Textract/Bedrock calls.
            log("processing_failed", resumeId=resume_id, error=str(error))
            set_status(resume_id, "FAILED", errorMessage=str(error)[:500])