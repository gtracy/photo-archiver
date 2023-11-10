# Photo Archiver
This project contains the building blocks to migrate photos stored in Google Drive to an S3 bucket. 

## photo_migrate
This directory contains the migration script that reads a row out of a sheet and streams an image to an S3 bucket. 

Migrate a specific row in a sheet:
```node migrate.js 2000```

Migrate several rows (you should edit the script to specify the rows)
```node migrate.js```

## photo_resize
This directory contains a Lambda function that is triggered when a new S3 object is created and resizes the image storing it back in the same bucket

## bucket_validator
This directory contains a Lambda function that performs a validation of the S3 bucket. It makes sure there are two copies of every image (big + small) and flags errors when it finds them. It is designed to run on a monthly schedule.