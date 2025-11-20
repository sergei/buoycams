# NOAA Buoy Camera Data Downloader - AWS Infrastructure

This directory contains the AWS infrastructure for downloading, storing, and serving NOAA buoy camera images and metadata.

## Architecture

- **AWS Lambda**: Downloads images and metadata every 30 minutes.
- **AWS EventBridge**: Triggers the Lambda function on a schedule.
- **Amazon S3**: Stores the downloaded images and raw metadata files with lifecycle policies.
- **Amazon DynamoDB**: Stores structured metadata to support efficient API queries.
- **Amazon API Gateway**: Provides a public HTTP API for the frontend to retrieve buoy data.
- **AWS CloudWatch**: Monitors and logs function execution.

## Deployment

1. Ensure you have the AWS CLI and SAM CLI installed.
2. Run the deployment script:
   ```bash
   ./deploy.sh
   ```
3. The script will output the **API Endpoint URL**. You will need this for the frontend configuration.
