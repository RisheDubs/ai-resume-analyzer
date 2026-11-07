# AI Resume Analyzer

**Live demo:** https://d13hnc4jdk2cj2.cloudfront.net/

A cloud-native, serverless web app that helps students and professionals improve their resumes with Generative AI. Upload a PDF or image, name the role you want, and in about 30 seconds you get an ATS score, the keywords you're missing and specific fixes. Your file is deleted automatically after 30 days.

<img width="1915" height="932" alt="homepage" src="https://github.com/user-attachments/assets/0e4f96bd-addf-4e79-a4c8-af9045f5c511" />

## Contents
- [Features](#features)
- [Screenshots](#screenshots)
- [Design](#design)
- [Architecture](#architecture)
- [AWS services used](#aws-services-used)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [API reference](#api-reference)
- [Security & privacy](#security--privacy)
- [Monitoring](#monitoring)
- [Setup & deployment](#setup--deployment)
- [Progress log](#progress-log)
- [Roadmap](#roadmap)
- [Credits](#credits)

## Features

- **ATS compatibility score** with section scores for formatting, skills, certifications and relevance
- **Missing keywords** for the target role, sharper when you paste the job description
- **Suggested improvements**, **recommended skills and certifications**, and a ready-to-copy **professional summary**
- **PDF, PNG or JPG** up to 5 MB, uploaded straight to private storage
- **Live progress:** uploading → reading → AI analysis → done, shown as an animated particle sphere
- **No account needed.** Files and results are deleted automatically after 30 days
- **Light and dark themes**, a choice of cursor (default, or a meteor in orange, blue or pink), and a layout that works from small phones to large monitors
- **Private admin area** (Amazon Cognito sign-in) with interview-prep notes stored in DynamoDB

## Screenshots

**How it works**: the three cards animate on hover.
<img width="1896" height="907" alt="3-how-tos" src="https://github.com/user-attachments/assets/7156ccb9-7863-48c4-a881-6301603ef8b6" />

**Upload**: drag and drop, target role and optional job description.
<img width="1872" height="852" alt="upload" src="https://github.com/user-attachments/assets/c899a439-f79a-4676-90d9-1fa23ff1727b" />

**Results** (sample data shown)
<img width="1840" height="712" alt="results" src="https://github.com/user-attachments/assets/fe8e36e8-e744-4129-80dc-b9f10cc4d953" />

## Design

The visual design is built on elements from **[Getlayers](https://www.getlayers.ai/)** (mesh-gradient hero, particle sphere, card layouts and typography direction), adapted and extended for this app:

- **3D hero stone:** the stone image is turned into a real 3D mesh using a generated depth map, then lit by the cursor in a custom three.js shader. It falls back to a flat image if WebGL isn't available.
- **WebGL shaders** for the hero mesh gradient, the aurora behind the analysis section and the analysis particle sphere.
- **Navigation** with a sliding highlight that folds down to just the logo as you scroll.
- **"How it works" cards** that only animate while you hover them.
- **Meteor cursor** drawn on a canvas, with a fire trail and sparks, in three colour themes.
- **Light/dark theme** that is remembered and loads without a flash.
- **Fully responsive**, checked at 12 viewport sizes from 320 px phones to 1920 px desktops, with reduced-motion support.
- Typeface: **Zen Kaku Gothic New**. The font and three.js are **self-hosted**, so the site makes no third-party requests.

## Architecture

```
                 Browser
                    │  HTTPS
                    ▼
     CloudFront ──► S3 (website bucket, private, Origin Access Control)
                    │
                    │  fetch
                    ▼
            API Gateway  (CORS locked to the site, throttled)
             ├─ POST /upload-url ──► Lambda GetUploadUrl ──► DynamoDB (PENDING)
             │                           └─ 5-min presigned PUT URL
             │
             │   browser uploads resume ──► S3 (resumes bucket, private, encrypted, 30-day expiry)
             │                                   │ ObjectCreated
             │                                   ▼
             │                          Lambda ProcessResume
             │                            ├─ Amazon Textract → extract text
             │                            ├─ Amazon Bedrock (Nova Lite) → AI analysis (JSON)
             │                            └─ DynamoDB → status + results (30-day TTL)
             │
             ├─ GET /results/{id} ──► Lambda GetResult ──► DynamoDB   (browser polls)
             │
             └─ /prep/questions ──► Cognito authorizer ──► Lambda PrepApi ──► DynamoDB (admin only)

CloudWatch: logs, metric filters, alarms → SNS email  ·  IAM: least-privilege role per Lambda
```

## AWS services used

| Service | Purpose |
|---|---|
| Amazon S3 | Private, encrypted storage for uploaded resumes (30-day expiry) and the website files |
| Amazon CloudFront | HTTPS delivery of the website from a private bucket (Origin Access Control) |
| Amazon API Gateway | REST API with CORS locked to the site, throttling and a Cognito authorizer |
| AWS Lambda | Upload URLs, resume processing, results and the admin API (Python 3.11) |
| Amazon Textract | Extracts text from PDFs and images |
| Amazon Bedrock | Analyzes resumes with Amazon Nova Lite through the Converse API |
| Amazon DynamoDB | Results (on-demand, TTL) and admin notes (point-in-time recovery) |
| Amazon Cognito | Sign-in for the admin area (no public sign-up) |
| Amazon CloudWatch | Structured logs, metric filters, alarms and a dashboard |
| Amazon SNS | Email alerts from alarms |
| AWS IAM | Least-privilege role for every function |

## Tech stack

- **Infrastructure as code:** AWS SAM (CloudFormation)
- **Backend:** Python 3.11, boto3
- **Frontend:** HTML, CSS and vanilla JavaScript (no framework), three.js 0.170 with custom GLSL shaders
- **Version control:** Git and GitHub (feature branches and pull requests)

## Project structure

```
ai-resume-analyzer/
├── backend/app/
│   ├── template.yaml          # all AWS infrastructure (SAM)
│   ├── samconfig.toml         # deploy settings
│   ├── get_upload_url/        # Lambda: POST /upload-url
│   ├── process_resume/        # Lambda: Textract + Bedrock (app.py, analyzer.py)
│   ├── get_result/            # Lambda: GET /results/{resumeId}
│   └── prep_api/              # Lambda: admin interview-prep API
├── frontend/
│   ├── index.html             # the app (styles and logic inline)
│   ├── privacy.html           # Privacy Policy
│   ├── terms.html             # Terms of Use
│   ├── config.js              # API URL + Cognito client ID (public values)
│   ├── dev/index.html         # admin sign-in + interview prep
│   └── assets/                # images, 3D depth map, cursor + theme scripts,
│       └── vendor/            #   self-hosted font and three.js (with licences)
├── scripts/
│   ├── deploy_frontend.py     # upload site + invalidate CloudFront
│   ├── test_upload.py         # end-to-end upload test
│   ├── show_result.py         # inspect a result
│   ├── test_rate_limit.py     # throttling test
│   └── seed_prep.py           # load admin starter questions
├── docs/images/               # screenshots used in this README
├── DEVELOPER.md               # admin area setup guide
└── README.md
```

## API reference

| Method | Path | Description |
|---|---|---|
| POST | `/upload-url` | Body `{contentType, fileSize, targetRole?, jobDescription?}` → `{resumeId, uploadUrl, expiresIn}` |
| GET | `/results/{resumeId}` | → `{status, isComplete, analysis?, error?}` |
| GET/PUT/PATCH/DELETE | `/prep/questions` | Admin only: requires a Cognito ID token |

Status lifecycle: `PENDING → PROCESSING → TEXT_EXTRACTED → ANALYZING → DONE` (or `FAILED` with a message).

## Security & privacy

- **Private data:** both buckets block all public access and are encrypted at rest. The site is served only through CloudFront with Origin Access Control.
- **Short-lived upload links:** presigned URLs expire after 5 minutes and can only upload, not read.
- **CORS locked down:** API Gateway, the Lambda responses and the S3 bucket accept browser requests only from the site's domain.
- **Rate limiting:** API Gateway throttling (5 requests/s, burst 10) protects against abuse and runaway AI costs.
- **Defence in depth:** the 5 MB limit and file-type checks are enforced in the browser, the API and the processor (using the real S3 object size).
- **Least-privilege IAM:** each Lambda has only the exact permissions it needs.
- **Data retention:** resumes and results are deleted automatically after 30 days, and logs after 14 days.
- **AI data use:** Amazon Bedrock doesn't store or train on prompts. The account is opted out of AWS AI services using content for service improvement.
- **Prompt-injection mitigation:** resume text is treated as untrusted data inside delimiters, and AI output is validated.
- **XSS-safe frontend:** AI output is rendered with `textContent`, never `innerHTML`.
- **No third-party requests:** the font and three.js are self-hosted, with no analytics, trackers or cookies.
- **Admin area:** Cognito sign-in with no public sign-up. The API rejects requests without a valid token.
- **Legal:** a [Privacy Policy](frontend/privacy.html) and [Terms of Use](frontend/terms.html) written around the app's real data flows, with a notice before upload.
- No AWS credentials are stored in this repository.

## Monitoring

- **CloudWatch dashboard:** API traffic, 4XX/5XX errors, latency, processing volume, failures and AI analysis time
- **Metric filters** turn structured JSON logs into custom metrics (`ProcessingFailures`, `AnalysisSeconds`)
- **Alarms with SNS email alerts:** processing failures, Lambda errors or timeouts, and API 5XX errors

## Setup & deployment

### Prerequisites
- An AWS account with an IAM user (not root)
- [AWS CLI v2](https://aws.amazon.com/cli/) configured (`aws configure`)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Python 3.11 and access to Amazon Bedrock (Nova Lite) in `us-east-1`

### Deploy the backend
```bash
cd backend/app
sam validate --lint
sam build
sam deploy --guided   # first time; use `sam deploy` afterwards
```
The output lists the API base URL, the website URL, and the bucket and table names.

### Deploy the website
Put the API base URL (and the Cognito client ID, if you use the admin area) in `frontend/config.js`, then:
```bash
python scripts/deploy_frontend.py
```

### Run the website locally
```bash
cd frontend
python -m http.server 8000
# open http://localhost:8000
```
Without a `config.js`, the site runs in preview mode with sample results.

### Admin area
Setup steps for the Cognito-protected interview-prep area are in [DEVELOPER.md](DEVELOPER.md).

### Tear down
```bash
aws s3 rm s3://ai-resume-analyzer-resumes-<account-id>-us-east-1 --recursive
aws s3 rm s3://ai-resume-analyzer-web-<account-id>-us-east-1 --recursive
sam delete
```

## Progress log

### Day 1: Environment setup
- Secured the AWS account (root MFA, $10 budget alert)
- Created an IAM development user and configured the AWS CLI
- Verified Amazon Bedrock and Amazon Textract access in the region
- Installed tooling: Git, Python, AWS CLI, AWS SAM CLI, VS Code
- Scaffolded a SAM project and deployed a hello-world API (API Gateway + Lambda)
- Set up the GitHub repository with `.gitignore`

### Day 2: Storage layer
- Added a private, encrypted S3 bucket with CORS and a 30-day lifecycle rule
- Added an on-demand DynamoDB table with TTL
- Validated and deployed with `sam validate`, `sam build` and `sam deploy`
- Tested an S3 upload and confirmed public access is denied
- Tested DynamoDB put/get/delete from the CLI
- Merged the first feature branch via a pull request

### Day 3: Upload API
- Built the `GetUploadUrl` Lambda (Python, boto3) behind API Gateway `POST /upload-url`
- Generates short-lived (5-minute) S3 presigned URLs so browsers upload directly to S3
- Validates the file type (PDF, PNG, JPEG) and records a `PENDING` row in DynamoDB
- Least-privilege IAM: the function can only `PutObject` to `uploads/` and `PutItem` to the results table
- Added `scripts/test_upload.py` and verified a real PDF upload end to end
- Removed the temporary hello-world function and its tests

### Day 4: Text extraction (event-driven)
- Added the `ProcessResume` Lambda, triggered automatically by S3 `ObjectCreated` events on `uploads/`
- Images use synchronous Textract `DetectDocumentText`; multi-page PDFs use the async `StartDocumentTextDetection` job API with polling and result pagination
- Status lifecycle in DynamoDB: `PENDING → PROCESSING → TEXT_EXTRACTED` or `FAILED` (with an error message)
- Errors are caught and recorded so S3 retries don't cause duplicate Textract charges
- Solved a CloudFormation circular dependency between the S3 bucket notification and the Lambda's IAM policy
- Least-privilege IAM: `GetObject` on `uploads/*`, Textract text detection, and `UpdateItem` on the results table

### Day 5: AI analysis with Amazon Bedrock
- Extended `ProcessResume` to send the extracted text to an LLM through the Bedrock **Converse API** (model-agnostic; the model ID is a SAM parameter)
- Prompt engineered for structured JSON: ATS score, section scores, strengths, missing keywords, improvements, recommended skills and a professional summary
- Role-aware analysis using the target role and optional job description
- Output validation: clamps scores to 0–100, enforces types and list sizes, and retries once on invalid JSON
- Prompt-injection mitigation: resume text is treated as untrusted data inside delimiters
- Logs latency and token usage per analysis for cost visibility
- Status lifecycle: `PENDING → PROCESSING → TEXT_EXTRACTED → ANALYZING → DONE / FAILED`
- Added `scripts/show_result.py` to inspect results

### Day 6: Results API (backend complete)
- Added the `GetResult` Lambda behind `GET /results/{resumeId}`
- Validates the UUID format (400) and handles unknown IDs (404)
- Returns the status, an `isComplete` flag and the analysis, and never exposes the extracted resume text
- DynamoDB projection expression with reserved-word aliasing, and Decimal-safe JSON serialization
- `Cache-Control: no-store` for correct polling behaviour
- Least-privilege IAM: `GetItem` only
- Upgraded `scripts/test_upload.py` to a full end-to-end test with polling and a formatted report

### Day 7: Dashboard (functional)
- Built a framework-free dashboard (HTML, CSS, vanilla JavaScript)
- Upload form with the target role and an optional job description
- Client-side validation (file type and 5 MB size limit)
- Direct-to-S3 upload via the presigned URL, then live progress by polling `GET /results/{id}`
- Results view: ATS score, section score bars, strengths, missing keywords, improvements, recommended skills and a copyable professional summary
- XSS-safe rendering of AI output (`textContent`, never `innerHTML`)
- Responsive layout for mobile

### Day 8: Dashboard polish & hosting
- Animated SVG ATS score gauge with a count-up, and colour-coded section score bars
- Drag-and-drop upload zone with a file preview and a job-description character counter
- Progress steps with spinners and an elapsed timer
- Dark mode (follows the system preference, with a manual toggle saved locally)
- "Download report" via a print stylesheet (Save as PDF)
- Accessibility: reduced-motion support, labelled controls and a keyboard-friendly upload
- Hosted on a **private S3 bucket behind CloudFront** using Origin Access Control: HTTPS only, HTTP→HTTPS redirect, edge caching and compression
- `scripts/deploy_frontend.py`: one-command deploy with correct content types and CloudFront cache invalidation

### Day 9: Hardening & monitoring
- Locked CORS to the CloudFront domain (API Gateway, Lambda responses and the S3 bucket)
- Added API throttling with CORS-enabled gateway error responses
- Server-side file size validation in the API and the processor
- CloudWatch metric filters, alarms with SNS email alerts, and a monitoring dashboard
- 14-day log retention
- Tested cross-origin blocking, throttling (429s), oversized and corrupt files, expired upload links and prompt injection

### Admin portal: Cognito + DynamoDB
- Added an Amazon Cognito user pool with admin-only account creation (no public sign-up)
- Added a Cognito authorizer on API Gateway for the new `/prep/questions` routes
- `PrepApi` Lambda with full CRUD, and a DynamoDB table with point-in-time recovery
- Private interview-prep page: progress ring, role filter, practice mode, notes that autosave to AWS, and editing
- `scripts/seed_prep.py` loads the starter questions or restores a backup; setup is documented in [DEVELOPER.md](DEVELOPER.md)
- Hidden footer link, shown only in browsers the developer enables (`?dev=1`)

### Redesign
- Rebuilt the whole frontend from a Getlayers design: WebGL mesh-gradient hero, aurora background, particle-sphere analysis stage and a finale section
- **3D hero:** the stone image is given real depth through a generated depth map and lit by the cursor in a custom shader
- Navigation with a gliding highlight that folds to the logo on scroll, plus smooth in-page scrolling
- "How it works" cards with file icons, a mini analysis loop and a mini results card, animated only on hover
- Redesigned the admin sign-in and interview-prep pages; invalid credentials are always rejected
- Top-right controls for **light/dark theme** and **cursor style** (default, or a meteor with a fire trail in orange, blue or pink), both remembered per browser
- Responsive at 12 viewport sizes from 320 px to 1920 px, with reduced-motion fallbacks
- Self-hosted the font and three.js, so the site makes no third-party requests

### Privacy & legal
- Wrote a [Privacy Policy](frontend/privacy.html) and [Terms of Use](frontend/terms.html) around the app's real data flows (S3, Textract, Bedrock, DynamoDB, the 30-day deletion and the US region)
- Added a notice before upload that links to both
- New footer: owner (LazyOrangeCat), design credit, the AWS services used, open-source credits and the AWS trademark notice
- Opted the AWS account out of AI services content use (AWS Organizations policy)

## Roadmap

- [x] Project setup
- [x] Storage (S3, DynamoDB)
- [x] Upload API (presigned URLs)
- [x] Text extraction (Textract)
- [x] AI analysis (Bedrock)
- [x] Results API
- [x] Dashboard and hosting (CloudFront)
- [x] Security hardening and monitoring
- [x] Admin portal (Cognito)
- [x] Redesign (3D hero, themes, cursor)
- [x] Privacy Policy and Terms


## Credits

- **Design:** elements adapted from [Getlayers](https://www.getlayers.ai/)
- **Typeface:** [Zen Kaku Gothic New](https://fonts.google.com/specimen/Zen+Kaku+Gothic+New), SIL Open Font License 1.1
- **3D:** [three.js](https://threejs.org/), MIT License
- **Infrastructure:** Amazon Web Services

Amazon Web Services, AWS and the names of AWS services are trademarks of Amazon.com, Inc. or its affiliates. This project is independent and not affiliated with or endorsed by AWS or Getlayers.

## Author

Built by **Rishekesh B** · [GitHub](https://github.com/RisheDubs)
© 2026 LazyOrangeCat. All rights reserved.
