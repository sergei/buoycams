import os
import sys
import boto3
import time
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger()

# --- Configuration ---
PROFILE = "sailvue"
REGION = "us-east-1"
TABLE_NAME = "noaa-buoycams-metadata"
BUCKET_PREFIX = "noaa-buoycams-data"
STATION_IDS = "41009,42036,42003"  # Test with a few stations


def setup_environment():
    """Set up AWS credentials and environment variables"""
    logger.info(f"Setting up environment for profile: {PROFILE}")
    os.environ['AWS_PROFILE'] = PROFILE
    os.environ['AWS_REGION'] = REGION

    # Initialize session
    session = boto3.Session(profile_name=PROFILE, region_name=REGION)
    return session


def ensure_dynamodb_table(session):
    """Check if DynamoDB table exists, create if not (for local testing)"""
    dynamodb = session.resource('dynamodb')
    table = dynamodb.Table(TABLE_NAME)

    try:
        table.load()
        logger.info(f"DynamoDB Table '{TABLE_NAME}' exists.")
    except Exception:
        logger.info(f"Table '{TABLE_NAME}' not found. Creating it for local test...")
        table = dynamodb.create_table(
            TableName=TABLE_NAME,
            KeySchema=[
                {'AttributeName': 'station_id', 'KeyType': 'HASH'},
                {'AttributeName': 'timestamp', 'KeyType': 'RANGE'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'station_id', 'AttributeType': 'S'},
                {'AttributeName': 'timestamp', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        logger.info("Waiting for table creation...")
        table.meta.client.get_waiter('table_exists').wait(TableName=TABLE_NAME)
        logger.info("Table created successfully.")

    return TABLE_NAME


def find_s3_bucket(session):
    """Find the S3 bucket created by the stack"""
    s3 = session.client('s3')
    response = s3.list_buckets()

    for bucket in response['Buckets']:
        if bucket['Name'].startswith(BUCKET_PREFIX):
            logger.info(f"Found S3 Bucket: {bucket['Name']}")
            return bucket['Name']

    logger.error(f"Could not find bucket starting with {BUCKET_PREFIX}")
    sys.exit(1)


def main():
    session = setup_environment()

    # 1. Ensure DynamoDB table exists
    ensure_dynamodb_table(session)

    # 2. Find S3 Bucket
    bucket_name = find_s3_bucket(session)

    # 3. Set Lambda Environment Variables
    os.environ['S3_BUCKET_NAME'] = bucket_name
    os.environ['STATION_IDS'] = STATION_IDS
    os.environ['DYNAMODB_TABLE'] = TABLE_NAME
    os.environ['FORCE_PROCESS'] = 'true'  # <--- Add this line to force processing

    # 4. Import and Run Lambda
    logger.info("Starting Lambda Function locally...")

    # Import here AFTER setting env vars so boto3 clients in lambda_function.py pick up the profile
    try:
        # Ensure current directory is in path for import
        current_dir = os.path.dirname(os.path.abspath(__file__))
        if current_dir not in sys.path:
            sys.path.append(current_dir)
            
        import lambda_function
        
        # Create a dummy event/context
        event = {}
        context = type('obj', (object,), {'aws_request_id': 'local-test'})

        # Run it
        response = lambda_function.lambda_handler(event, context)

        logger.info("\n=== Execution Result ===")
        print(json.dumps(response, indent=2))

    except ImportError:
        logger.error("Could not import lambda_function. Make sure you are in the aws/ directory.")
    except Exception as e:
        logger.exception("An error occurred during execution")


if __name__ == "__main__":
    import json

    main()
