import boto3
import re
import argparse
import logging
import os

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger()


def debug_rekognition(image_path, profile='sailvue', region='us-east-1'):
    """
    Debug Rekognition text detection on a local image file.
    """
    if not os.path.exists(image_path):
        logger.error(f"Error: File not found at {image_path}")
        return

    logger.info(f"--- Debugging Rekognition for: {image_path} ---")

    # Setup session
    session = boto3.Session(profile_name=profile, region_name=region)
    rekognition = session.client('rekognition')

    # Read image bytes
    with open(image_path, 'rb') as image_file:
        image_bytes = image_file.read()

    try:
        # Call Rekognition
        response = rekognition.detect_text(Image={'Bytes': image_bytes})

        print("\n=== 1. Full Rekognition Response (TextDetections) ===")
        detections = response['TextDetections']

        if not detections:
            print("No text detected in the image.")
            return

        # Print all detected lines
        print(f"Found {len(detections)} text items.")
        for i, item in enumerate(detections):
            if item['Type'] == 'LINE':
                print(f"  Line {i}: '{item['DetectedText']}' (Confidence: {item['Confidence']:.2f}%)")

        print("\n=== 2. Regex Testing ===")
        # Your current regex from lambda_function.py
        # Note: Using raw string r'' to match python syntax
        regex_pattern = r'Station ID:\s*(\w+)\s+(\d{2}/\d{2}/\d{4}\s+\d{4})\s+UTC'
        print(f"Regex Pattern: {regex_pattern}")

        match_found = False
        for item in detections:
            if item['Type'] == 'LINE':
                text = item['DetectedText']
                match = re.search(regex_pattern, text)
                if match:
                    print(f"\n✅ MATCH FOUND in line: '{text}'")
                    print(f"   Group 1 (Station ID): '{match.group(1)}'")
                    print(f"   Group 2 (Timestamp):  '{match.group(2)}'")
                    match_found = True
                    break

        if not match_found:
            print("\n❌ NO MATCH found with current regex.")
            print("Suggestion: Check if the text format in the image matches the regex.")
            print("Common issues:")
            print(" - Extra spaces?")
            print(" - 'Station ID' vs 'StationID'?")
            print(" - Date format differences?")
            print(" - OCR errors (e.g., 'l' instead of '1')?")

    except Exception as e:
        logger.error(f"Error calling Rekognition: {str(e)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Debug AWS Rekognition Text Detection')
    parser.add_argument('image_path', help='Path to the local image file')
    parser.add_argument('--profile', default='sailvue', help='AWS CLI profile to use')

    args = parser.parse_args()
    debug_rekognition(args.image_path, args.profile)
