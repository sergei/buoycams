# aws/cleanup.sh
#!/bin/bash

# NOAA Buoy Camera Data Downloader - Cleanup Script

set -e

# Configuration
STACK_NAME="noaa-buoycams"
REGION="us-east-1"
PROFILE="sailvue"
TABLE_NAME="noaa-buoycams-metadata"  # Add table name

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Warning: This will delete all resources created by the stack!${NC}"
echo -e "${YELLOW}This includes the S3 bucket, DynamoDB table, and all data stored in them.${NC}"
echo

read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cleanup cancelled."
    exit 0
fi

echo -e "${GREEN}Deleting DynamoDB table: ${TABLE_NAME}...${NC}"
# Delete table if it exists (whether created by stack or manually)
aws dynamodb delete-table --table-name "${TABLE_NAME}" --region "${REGION}" --profile "${PROFILE}" 2>/dev/null || echo "Table not found or already deleted."

echo -e "${GREEN}Getting S3 bucket name (if any)...${NC}"
BUCKET_NAME=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --stack-name "${STACK_NAME}" \
    --region "${REGION}" \
    --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -n "$BUCKET_NAME" ] && [ "$BUCKET_NAME" != "None" ]; then
    echo -e "${GREEN}Emptying S3 bucket: ${BUCKET_NAME} (non-versioned cleanup only)...${NC}"
    aws s3 rm "s3://${BUCKET_NAME}" --recursive --region "${REGION}" --profile "${PROFILE}" || true
else
    echo -e "${YELLOW}No bucket output found; skipping bucket cleanup.${NC}"
fi

echo -e "${GREEN}Deleting CloudFormation stack...${NC}"
aws cloudformation delete-stack \
    --profile "${PROFILE}" \
    --stack-name "${STACK_NAME}" \
    --region "${REGION}"

echo -e "${GREEN}Waiting for stack deletion to complete...${NC}"
aws cloudformation wait stack-delete-complete \
    --profile "${PROFILE}" \
    --stack-name "${STACK_NAME}" \
    --region "${REGION}"

echo -e "${GREEN}Cleanup completed successfully!${NC}"
