# AI Resume Analyzer

A cloud-native, serverless application that helps students and professionals improve their resumes using Generative AI.

Users upload a resume (PDF or image). The app extracts the text, analyzes it with a large language model, and returns:
- An **ATS compatibility score**
- **Missing keywords** for the target role
- **Suggested improvements** to formatting and content
- **Recommended skills and certifications**
- A generated **professional summary**

## Architecture

```
[Dashboard] → API Gateway → Lambda (presigned upload URL)
     │
     └─ uploads resume ─► S3 (private, encrypted)
                            │ ObjectCreated event
                            ▼
                     Lambda (processResume)
                       ├─ Amazon Textract → extract text
                       ├─ Amazon Bedrock  → AI analysis (JSON)
                       └─ DynamoDB        → store results
     ▲
     └─ polls results ◄─ API Gateway ◄─ Lambda (getResult)

CloudWatch: logs & alarms  ·  IAM: least-privilege roles
```

## AWS Services Used

| Service | Purpose |
|---|---|
| Amazon S3 | Stores uploaded resumes and hosts the dashboard |
| AWS Lambda | Runs the processing and API logic |
| Amazon Textract | Extracts text from PDFs and images |
| Amazon Bedrock | Analyzes resumes with Generative AI |
| Amazon DynamoDB | Stores analysis results |
| Amazon API Gateway | Exposes REST endpoints to the frontend |
| Amazon CloudWatch | Logging and monitoring |
| AWS IAM | Secure, least-privilege access between services |

## Tech Stack

- **Infrastructure as Code:** AWS SAM (CloudFormation)
- **Backend:** Python 3.11
- **Frontend:** HTML, CSS, JavaScript
- **Version control:** Git & GitHub (feature branches + pull requests)

## Project Structure

```
ai-resume-analyzer/
├── backend/
│   └── app/
│       ├── template.yaml      # all AWS infrastructure
│       ├── samconfig.toml     # deploy settings
│       ├── get_upload_url/    # Lambda: presigned upload URL API
│       └── events/            # sample test events
├── scripts/
│   └── test_upload.py         # end-to-end upload test
├── frontend/                  # dashboard (coming soon)
├── docs/                      # diagrams & screenshots
├── .gitignore
└── README.md
```

## Infrastructure Deployed So Far

### S3 resumes bucket
- **Private:** all public access blocked
- **Encrypted** at rest (SSE-S3 / AES-256)
- **CORS** enabled for direct browser uploads via presigned URLs
- **Lifecycle rule:** resumes auto-deleted after 30 days (privacy + cost)

### DynamoDB results table
- **Partition key:** `resumeId` (String)
- **On-demand** billing (pay per request)
- **TTL** on `expiresAt` so old results are removed automatically

### Upload API: `POST /upload-url`
- Lambda (`GetUploadUrlFunction`) behind API Gateway
- Request: `{"contentType": "application/pdf", "targetRole": "...", "jobDescription": "..."}`
- Response: `{"resumeId": "...", "uploadUrl": "...", "expiresIn": 300}`
- Accepts PDF, PNG and JPEG only; other types return `400`
- Creates a `PENDING` row in DynamoDB and a 5-minute presigned S3 upload URL
- Least-privilege IAM: can only `PutObject` to `uploads/` and `PutItem` to the results table

Test it:
```bash
python scripts/test_upload.py <API_BASE_URL> sample-resumes/resume.pdf
```

## Progress Log

### Day 1: Environment setup
- Secured AWS account (root MFA, $10 budget alert)
- Created IAM development user and configured AWS CLI
- Verified Amazon Bedrock and Amazon Textract access in region
- Installed tooling: Git, Python, AWS CLI, AWS SAM CLI, VS Code
- Scaffolded SAM project and deployed a hello-world API (API Gateway + Lambda)
- Set up GitHub repository with `.gitignore`

### Day 2: Storage layer
- Added private, encrypted S3 bucket with CORS and 30-day lifecycle
- Added on-demand DynamoDB table with TTL
- Validated and deployed with `sam validate`, `sam build`, `sam deploy`
- Tested S3 upload and confirmed public access is denied
- Tested DynamoDB put/get/delete from the CLI
- Merged first feature branch via Pull Request

### Day 3: Upload API
- Built `GetUploadUrl` Lambda (Python, boto3) behind API Gateway `POST /upload-url`
- Generates short-lived (5 min) S3 presigned URLs so browsers upload directly to S3
- Validates file type (PDF, PNG, JPEG) and records a `PENDING` row in DynamoDB
- Least-privilege IAM: function can only `PutObject` to `uploads/` and `PutItem` to the results table
- Added `scripts/test_upload.py` and verified a real PDF upload end to end
- Removed temporary hello-world function and its tests

## Roadmap

- [x] Project setup
- [x] Storage (S3, DynamoDB)
- [x] Upload API (presigned URLs)
- [ ] Text extraction (Textract)
- [ ] AI analysis (Bedrock)
- [ ] Results API
- [ ] Dashboard
- [ ] Security hardening & monitoring

## Setup & Deployment

### Prerequisites
- AWS account with an IAM user (not root)
- [AWS CLI v2](https://aws.amazon.com/cli/) configured (`aws configure`)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Python 3.11

### Deploy
```bash
cd backend/app
sam validate --lint
sam build
sam deploy --guided   # first time; use `sam deploy` afterwards
```

The deploy output lists the API base URL, upload endpoint, S3 bucket name and DynamoDB table name.

### Tear down
```bash
aws s3 rm s3://<your-bucket-name> --recursive
sam delete
```

## Security Notes

- Resumes contain personal data: the bucket is private, encrypted and auto-expires files.
- No AWS credentials are stored in this repository.
- IAM permissions will be tightened to least privilege per Lambda.

## Author

Rishekesh B. · [GitHub](https://github.com/RisheDubs)
