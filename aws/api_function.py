import json
import boto3
import os
from boto3.dynamodb.conditions import Key
from decimal import Decimal
from botocore.exceptions import ClientError

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('DYNAMODB_TABLE')
bucket_name = os.environ.get('S3_BUCKET_NAME')
table = dynamodb.Table(table_name)


# Helper to convert Decimal to float/int for JSON serialization
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)


def lambda_handler(event, context):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': headers, 'body': ''}

    params = event.get('queryStringParameters') or {}
    station_id = params.get('station_id')

    try:
        items = []
        if station_id and station_id != 'all':
            # Query specific station (last 50 records)
            response = table.query(
                KeyConditionExpression=Key('station_id').eq(station_id),
                ScanIndexForward=False,  # Newest first
                Limit=50
            )
            items = response.get('Items', [])
        else:
            # Scan all (limit to recent 200 for performance)
            response = table.scan()
            # Sort in memory since Scan doesn't sort
            all_items = response.get('Items', [])
            items = sorted(all_items, key=lambda x: x['timestamp'], reverse=True)[:200]

        # Process items: Add Presigned URL
        for item in items:
            if 's3_key' in item:
                try:
                    url = s3_client.generate_presigned_url(
                        'get_object',
                        Params={'Bucket': bucket_name, 'Key': item['s3_key']},
                        ExpiresIn=3600
                    )
                    item['image_url'] = url
                except ClientError:
                    pass

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(items, cls=DecimalEncoder)
        }
    except Exception as e:
        print(e)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e)})
        }
