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

---

## Deployment and Configurations

This project is configured with a GitHub Actions workflow that automatically builds and deploys the Lambdas to AWS when code is pushed to the `main` branch. Only the Lambdas corresponding to modified directories are updated.

### Local Development vs. Production Configurations

#### Local Setup:
You can use file-based configurations locally. Since these files are ignored in Git, they will not be committed:
1. **photo_migrate**: Create a `photo_migrate/.env.json` and a `photo_migrate/creds-prod.json` (or `creds-dev.json`) for local sheets/drive authentication.
   Example `photo_migrate/.env.json`:
   ```json
   {
       "GOOGLE_APPLICATION_CREDENTIALS" : "./creds-prod.json",
       "GOOGLE_SHEET_ID" : "your-sheet-id",
       "GOOGLE_SHEET_NAME" : "Form Responses 1",
       "GOOGLE_SHEET_RANGE" : "Form Responses 1!A1:C",
       "S3_BUCKET" : "your-s3-bucket"
   }
   ```

#### Production (AWS Lambda):
In production, environment variables are managed directly in the Lambda functions via GitHub Actions deployment config.

1. **GitHub Secrets** (Go to repository Settings -> Secrets and variables -> Actions -> Secrets):
   - `AWS_ROLE_TO_ASSUME`: The ARN of the IAM role that GitHub Actions assumes to deploy code (e.g. `arn:aws:iam::<AWS_ACCOUNT_ID>:role/github-actions-lambda-deployer`).
   - `GOOGLE_CREDENTIALS_JSON`: The complete, raw text content of your Google Service Account key file (`creds-prod.json`).

2. **GitHub Variables** (Go to repository Settings -> Secrets and variables -> Actions -> Variables):
   - `GOOGLE_SHEET_ID`: Google Sheet ID (e.g. `1LCCFBJMSYZXhFPndbYpsFWtF1zswGU7nUseVEF8ER3Y`).
   - `GOOGLE_SHEET_NAME`: Google Sheet Name (e.g. `Form Responses 1`).
   - `GOOGLE_SHEET_RANGE`: Google Sheet Range (e.g. `Form Responses 1!A1:C`).
   - `S3_BUCKET`: AWS S3 Bucket Name (e.g. `memories-photo-archive`).

### AWS OIDC Role Setup

To allow GitHub Actions to securely deploy to Lambda without persistent credentials, set up AWS OpenID Connect (OIDC) trust:

1. **Create Identity Provider**:
   - Go to **AWS IAM** -> **Identity Providers** -> **Add Provider**.
   - Select **OpenID Connect**.
   - **Provider URL**: `https://token.actions.githubusercontent.com`
   - **Audience**: `sts.amazonaws.com`
2. **Create IAM Role**:
   - Create a role with a **Custom trust policy** (replace `<AWS_ACCOUNT_ID>` with your AWS Account ID):
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Principal": {
             "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
           },
           "Action": "sts:AssumeRoleWithWebIdentity",
           "Condition": {
             "StringEquals": {
               "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
             },
             "StringLike": {
               "token.actions.githubusercontent.com:sub": "repo:gtracy/photo-archiver:*"
             }
           }
         }
       ]
     }
     ```
   - Attach a permission policy that grants access to update Lambda code and configurations (replace `<AWS_ACCOUNT_ID>` with your AWS Account ID):
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Action": [
             "lambda:UpdateFunctionCode",
             "lambda:UpdateFunctionConfiguration",
             "lambda:GetFunctionConfiguration"
           ],
           "Resource": [
             "arn:aws:lambda:us-east-2:<AWS_ACCOUNT_ID>:function:memories-photo-migration",
             "arn:aws:lambda:us-east-2:<AWS_ACCOUNT_ID>:function:photoResize",
             "arn:aws:lambda:us-east-2:<AWS_ACCOUNT_ID>:function:memories-photo-validator"
           ]
         }
       ]
     }
     ```