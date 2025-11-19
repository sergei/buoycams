# aws/README.md
# NOAA Buoy Camera Data Downloader - AWS Infrastructure

This directory contains the AWS infrastructure for downloading and storing NOAA buoy camera images and metadata.

## Architecture

- **AWS Lambda**: Downloads images and metadata every 30 minutes
- **AWS EventBridge**: Triggers the Lambda function on a schedule
- **AWS S3**: Stores the downloaded data with lifecycle policies
- **AWS CloudWatch**: Monitors and logs function execution

## File Structure
