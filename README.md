# NOAA Buoy Camera Timelapse

## Description

This project generates timelapsed videos using images downloaded from NOAA buoys. 
The images are downloaded from the [NOAA Buoy Camera](https://www.ndbc.noaa.gov/buoycam.php) service.
Each image contains captures from 6 cameras positioned around the buoy and covering 360 degrees of view.

Along with the image, we also download metadata (wind speed, wave height, temperature, etc.) from the NOAA data service.

## Architecture

The project consists of two main components:

### 1. Backend (AWS)
The infrastructure is defined in the `aws/` directory using AWS SAM.
*   **AWS Lambda**: Triggered by **EventBridge** every 30 minutes to download data.
*   **Amazon S3**: Stores the downloaded images and raw metadata files.
*   **Amazon DynamoDB**: Indexes the metadata for fast retrieval.
*   **Amazon API Gateway**: Exposes a REST API for the frontend to fetch data.

### 2. Frontend (Web)
A React application located in the `web/` directory.
*   **Visualization**: Displays buoy images and wind data charts.
*   **Hosting**: Hosted on **GitHub Pages**.
*   **CI/CD**: Automatically built and deployed via **GitHub Actions**.

## Deployment

### Backend
Navigate to the `aws/` directory and run the deploy script to provision the AWS resources:

```bash 
cd aws
 ./deploy.sh
```

### Frontend
The frontend is automatically deployed to GitHub Pages whenever you push changes to the `main` branch. 
The workflow is defined in `.github/workflows/deploy.yml`.

The link is https://sergei.github.io/buoycams/

To run locally:
```bash
cd web
npm install
npm run dev
```



