# AI Resume Analyzer

A cloud-native, serverless application that helps students and professionals improve their resumes using Generative AI.

Users upload a resume (PDF or image). The app extracts the text, analyzes it with a large language model, and returns:
- An **ATS compatibility score**
- **Missing keywords** for the target role
- **Suggested improvements** to formatting and content
- **Recommended skills and certifications**
- A generated **professional summary**

## Architecture

Resume upload → Amazon S3 → AWS Lambda → Amazon Textract (text extraction)
→ Amazon Bedrock (AI analysis) → Amazon DynamoDB (results) → API Gateway → Dashboard

_Architecture diagram coming soon._

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

- **Backend:** Python 3.12, AWS SAM
- **Frontend:** HTML, CSS, JavaScript
- **Version control:** Git & GitHub

## Project Status

🚧 In progress

- [x] Project setup
- [ ] Storage (S3, DynamoDB)
- [ ] Upload API
- [ ] Text extraction (Textract)
- [ ] AI analysis (Bedrock)
- [ ] Results API
- [ ] Dashboard
- [ ] Security hardening & monitoring

## Setup

_Deployment instructions coming soon._

## Author

Rishekesh B. 