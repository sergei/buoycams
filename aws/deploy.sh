# aws/deploy.sh
#!/bin/bash

# NOAA Buoy Camera Data Downloader - Deployment Script

set -e

# Configuration
STACK_NAME="noaa-buoycams"
REGION="us-east-1"
BUCKET_PREFIX="noaa-buoycams-data"
STATION_IDS="41009,42036,42003"
PROFILE="sailvue"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Deploying NOAA Buoy Camera Data Downloader...${NC}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Check if SAM CLI is installed
if ! command -v sam &> /dev/null; then
    echo -e "${RED}Error: SAM CLI is not installed${NC}"
    echo "Please install SAM CLI: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    exit 1
fi

# Get AWS account ID for unique bucket naming
ACCOUNT_ID=$(aws sts get-caller-identity --profile "${PROFILE}" --query Account --output text)
UNIQUE_BUCKET_NAME="${BUCKET_PREFIX}-${ACCOUNT_ID}"

echo -e "${YELLOW}Configuration:${NC}"
echo "  Stack Name: ${STACK_NAME}"
echo "  Region: ${REGION}"
echo "  S3 Data Bucket: ${UNIQUE_BUCKET_NAME}"
echo "  Station IDs: ${STATION_IDS}"
echo "  AWS Profile: ${PROFILE}"
echo

# Build the SAM application
echo -e "${GREEN}Building SAM application...${NC}"
sam build

# Deploy the stack
echo -e "${GREEN}Deploying stack...${NC}"
sam deploy \
    --profile "${PROFILE}" \
    --stack-name "${STACK_NAME}" \
    --region "${REGION}" \
    --capabilities CAPABILITY_IAM \
    --resolve-s3 \
    --parameter-overrides \
        BucketName="${UNIQUE_BUCKET_NAME}" \
        StationIds="${STATION_IDS}" \
    --confirm-changeset

echo -e "${GREEN}Deployment completed successfully!${NC}"
echo
echo -e "${YELLOW}Stack Outputs:${NC}"
aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --stack-name "${STACK_NAME}" \
    --region "${REGION}" \
    --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
    --output table

echo
echo -e "${GREEN}You can monitor the Lambda function logs with:${NC}"
echo "aws logs tail /aws/lambda/${STACK_NAME}-downloader --follow --region ${REGION} --profile ${PROFILE}"
