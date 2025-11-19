# aws/lambda_function.py
import json
import boto3
import requests
import hashlib
import re
from datetime import datetime, timedelta
import logging
import os
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3_client = boto3.client('s3')
rekognition_client = boto3.client('rekognition')
dynamodb = boto3.resource('dynamodb')


def lambda_handler(event, context):
    """
    Lambda function to download NOAA buoy images and metadata every 30 minutes
    """
    
    # Get configuration from environment variables
    bucket_name = os.environ.get('S3_BUCKET_NAME')
    table_name = os.environ.get('DYNAMODB_TABLE')
    station_ids = os.environ.get('STATION_IDS', '').split(',')
    
    if not bucket_name:
        logger.error("S3_BUCKET_NAME environment variable not set")
        return error_response('S3_BUCKET_NAME environment variable not set')
        
    if not table_name:
        logger.error("DYNAMODB_TABLE environment variable not set")
        return error_response('DYNAMODB_TABLE environment variable not set')
    
    if not station_ids or station_ids == ['']:
        logger.error("STATION_IDS environment variable not set")
        return error_response('STATION_IDS environment variable not set')
    
    results = []
    table = dynamodb.Table(table_name)
    
    for station_id in station_ids:
        station_id = station_id.strip()
        if not station_id:
            continue
            
        try:
            process_station(bucket_name, table, station_id)
            results.append({'station_id': station_id, 'status': 'success'})
        except Exception as e:
            logger.error(f"Error processing station {station_id}: {str(e)}")
            results.append({'station_id': station_id, 'status': 'error', 'message': str(e)})
    
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Processing completed', 'results': results})
    }

def error_response(message):
    return {'statusCode': 500, 'body': json.dumps(message)}

def process_station(bucket_name, table, station_id):
    # 1. Download and process image
    image_data = download_and_process_image(bucket_name, station_id)
    
    # If duplicate or error, we stop here for this station
    if not image_data or image_data.get('status') == 'skipped':
        return

    # 2. Download raw metadata file to S3 (archival)
    metadata_text = download_metadata_file(bucket_name, station_id)
    
    # 3. Parse metadata and find matching row
    extracted_time = image_data.get('extracted_info', {}).get('time')
    meteo_data = {}
    
    if extracted_time and metadata_text:
        meteo_data = find_matching_meteo_data(metadata_text, extracted_time)
    
    # 4. Save combined record to DynamoDB
    save_to_dynamodb(table, station_id, image_data, meteo_data)


def get_latest_image_hash(bucket_name, station_id):
    """Retrieve the ETag (MD5) of the most recent image for the station."""
    try:
        today = datetime.utcnow()
        prefixes = [
            f"images/{station_id}/{today.strftime('%Y/%m/%d')}/",
            f"images/{station_id}/{(today - timedelta(days=1)).strftime('%Y/%m/%d')}/"
        ]
        
        for prefix in prefixes:
            response = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=prefix)
            if 'Contents' in response:
                sorted_contents = sorted(response['Contents'], key=lambda x: x['Key'])
                return sorted_contents[-1]['ETag'].strip('"')
    except Exception as e:
        logger.warning(f"Could not retrieve latest hash for station {station_id}: {e}")
    return None


def extract_image_data(image_bytes, station_id):
    """Extract Station ID and Timestamp from image using Rekognition."""
    try:
        response = rekognition_client.detect_text(Image={'Bytes': image_bytes})
        for item in response['TextDetections']:
            if item['Type'] == 'LINE':
                # Match: "Station ID: 41009 11/18/2025 1610 UTC"
                # Improved regex:
                # - r'' raw string for clarity
                # - Flexible whitespace around "Station ID"
                # - Capture groups for ID and Date/Time
                match = re.search(r'Station\s*ID:\s*(\w+)\s+(\d{2}/\d{2}/\d{4}\s+\d{4})\s+UTC', item['DetectedText'])
                if match:
                    return match.group(1), match.group(2)
    except Exception as e:
        logger.warning(f"Failed to extract text from image for station {station_id}: {str(e)}")
    return None, None


def download_and_process_image(bucket_name, station_id):
    """Download image, check deduplication, extract text, upload to S3."""
    image_url = f"https://www.ndbc.noaa.gov/buoycam.php?station={station_id}"
    response = requests.get(image_url, timeout=30)
    response.raise_for_status()
    image_content = response.content

    # Deduplication
    force_process = os.environ.get('FORCE_PROCESS', 'false').lower() == 'true'
    current_md5 = hashlib.md5(image_content).hexdigest()
    if not force_process and current_md5 == get_latest_image_hash(bucket_name, station_id):
        logger.info(f"Skipping duplicate image for station {station_id}")
        return {'status': 'skipped'}

    # Text Extraction
    extracted_id, extracted_timestamp = extract_image_data(image_content, station_id)
    
    # Upload to S3
    timestamp = datetime.utcnow()
    s3_key = f"images/{station_id}/{timestamp.strftime('%Y/%m/%d')}/{timestamp.strftime('%Y%m%d_%H%M%S')}.jpg"
    
    s3_metadata = {
        'station_id': station_id,
        'download_timestamp': timestamp.isoformat(),
        'source_url': image_url
    }
    if extracted_id: s3_metadata['extracted_id'] = extracted_id
    if extracted_timestamp: s3_metadata['extracted_time'] = extracted_timestamp

    s3_client.put_object(
        Bucket=bucket_name,
        Key=s3_key,
        Body=image_content,
        ContentType='image/jpeg',
        Metadata=s3_metadata
    )
    
    return {
        'status': 'success',
        's3_key': s3_key,
        'download_timestamp': timestamp.isoformat(),
        'extracted_info': {'station': extracted_id, 'time': extracted_timestamp}
    }


def download_metadata_file(bucket_name, station_id):
    """Download metadata text file and save to S3."""
    try:
        url = f"https://www.ndbc.noaa.gov/data/5day2/{station_id}_5day.txt"
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        timestamp = datetime.utcnow()
        s3_key = f"metadata/{station_id}/{timestamp.strftime('%Y/%m/%d')}/{timestamp.strftime('%Y%m%d_%H%M%S')}.txt"
        
        s3_client.put_object(
            Bucket=bucket_name,
            Key=s3_key,
            Body=response.text,
            ContentType='text/plain'
        )
        return response.text
    except Exception as e:
        logger.error(f"Error downloading metadata file: {e}")
        return None


def parse_meteo_line(line):
    """Parse a single line of the NOAA 5-day format."""
    parts = line.split()
    if len(parts) < 19: return None
    
    # Header: #YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS PTDY TIDE
    try:
        # Parse timestamp: YYYY MM DD hh mm
        dt_str = f"{parts[0]} {parts[1]} {parts[2]} {parts[3]} {parts[4]}"
        dt = datetime.strptime(dt_str, "%Y %m %d %H %M")
        
        # Map rest of the fields (handling 'MM' as None/null)
        def get_val(idx):
            val = parts[idx]
            return None if val == 'MM' else val

        return {
            'timestamp': dt,
            'data': {
                'wind_dir': get_val(5),
                'wind_speed': get_val(6),
                'gust': get_val(7),
                'wave_height': get_val(8),
                'dpd': get_val(9),
                'apd': get_val(10),
                'mwd': get_val(11),
                'pressure': get_val(12),
                'air_temp': get_val(13),
                'water_temp': get_val(14),
                'dewpoint': get_val(15),
                'visibility': get_val(16),
                'ptdy': get_val(17),
                'tide': get_val(18)
            }
        }
    except (ValueError, IndexError):
        return None


def find_matching_meteo_data(metadata_text, image_timestamp_str):
    """Find meteo data row matching image timestamp within +/- 30 mins."""
    try:
        # Parse image timestamp (format: 11/18/2025 1610)
        img_time = datetime.strptime(image_timestamp_str, "%m/%d/%Y %H%M")
    
        # Use splitlines() to handle different line endings safely
        lines = metadata_text.strip().splitlines()
        # Skip first 2 lines (headers)
        data_lines = lines[2:]
    
        closest_record = None
        min_diff = float('inf')
        
        for line in data_lines:
            record = parse_meteo_line(line)
            if not record: continue
            
            # Calculate difference in minutes
            diff = abs((record['timestamp'] - img_time).total_seconds() / 60)
            
            if diff <= 30 and diff < min_diff:
                min_diff = diff
                closest_record = record['data']
                closest_record['meteo_timestamp'] = record['timestamp'].isoformat()
                
        return closest_record
        
    except Exception as e:
        logger.warning(f"Error matching meteo data: {e}")
        return {}


def save_to_dynamodb(table, station_id, image_data, meteo_data):
    """Save combined record to DynamoDB."""
    
    # Primary timestamp source: Extracted from image. 
    # Fallback: Download timestamp.
    extracted_time_str = image_data.get('extracted_info', {}).get('time')
    
    if extracted_time_str:
        try:
            # Convert "11/18/2025 1610" to ISO8601 for sorting
            dt = datetime.strptime(extracted_time_str, "%m/%d/%Y %H%M")
            timestamp_iso = dt.isoformat()
        except ValueError:
            timestamp_iso = image_data['download_timestamp']
    else:
        timestamp_iso = image_data['download_timestamp']

    item = {
        'station_id': station_id,
        'timestamp': timestamp_iso,
        's3_key': image_data['s3_key'],
        'created_at': datetime.utcnow().isoformat()
    }
    
    if meteo_data:
        # DynamoDB requires Decimal for floats, but 'MM' is handled as None
        # We'll store them as strings to avoid Float/Decimal precision headaches, 
        # or convert valid numbers to Decimal if needed. Simple strings are safe.
        item['meteo'] = meteo_data

        # Add extracted info for verification
        if image_data.get('extracted_info'):
            item['rekognition_data'] = image_data['extracted_info']

        table.put_item(Item=item)
        logger.info(f"Saved record to DynamoDB for {station_id} at {timestamp_iso} {item}")
    else:
        logger.info(f"No meteo data found for {station_id} at {timestamp_iso}, skipping DynamoDB save.")
