# Description

This project generates timelapsed videos using images downloaded from NOAA buoys. 
The images are downloaded from the following URL: https://www.ndbc.noaa.gov/buoycam.php?station=xxxxx
where xxxxx is the desired station ID.  
Each image contains captures from 6 cameras positioned around the buoy and covering 360 degrees of view.

Along with the image we also download the metadata file which contains information about the buoy such as wind speed, wave height, temperature, etc.
The URL is https://www.ndbc.noaa.gov/data/5day2/xxxxx_5day.txt where xxxxx is the desired station ID.
Forma of the file is as follow:
```aiignore
#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE
#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft
2025 11 13 22 40 330  4.0  5.0    MM    MM    MM  MM 1021.7  21.4  26.5  13.3   MM   MM    MM
```
Both the images and metadata are downloaded every 30 minutes and stored to AWS S3 bucket.

The download script runs as AWS Lambda function triggered by AWS EventBridge every 30 minutes.

This script is located in aws/ directory.

To visualize the data we have react app that fetches the images and metadata from S3 and displays them in a timelapsed video format.
This app is located in web/ directory.

