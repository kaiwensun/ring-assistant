#!/bin/zsh

# Exit on error
set -e

echo "Starting optimized Lambda deployment..."

# Create a temporary directory for production deployment
TEMP_DIR="./dist/lambda-deploy"

# Clean up and create the temp directory
echo "Creating temporary deployment directory..."
rm -rf $TEMP_DIR
mkdir -p $TEMP_DIR

# Copy only the necessary files
echo "Copying compiled code..."
cp -r ./dist/lib/* $TEMP_DIR/

# Copy package.json
echo "Copying package.json..."
cp package.json $TEMP_DIR/

# Install only production dependencies in the temp directory
echo "Installing production dependencies..."
cd $TEMP_DIR
npm install --production
cd ../..

# Create the zip file
echo "Creating deployment package..."
rm -f lambda-func.zip
cd $TEMP_DIR
zip -rq ../../lambda-func.zip .
cd ../..

# Check the size of the deployment package
PACKAGE_SIZE=$(du -h lambda-func.zip | cut -f1)
echo "Deployment package size: $PACKAGE_SIZE"

# Deploy to AWS Lambda
echo "Deploying to AWS Lambda..."
if aws lambda update-function-code --function-name RingAssistantEventListener --zip-file fileb://./lambda-func.zip --region us-west-2; then
  echo "Deployment successful!"
else
  echo "\nYour deployment package is still too large for direct upload."
  echo "Try deploying via S3 instead:"
  echo "\n1. Upload the package to S3:"
  echo "aws s3 cp lambda-func.zip s3://ring-assistant-lambda-deployment/lambda-func.zip"
  aws s3 cp lambda-func.zip s3://ring-assistant-lambda-deployment/lambda-func.zip
  echo "\n2. Update the Lambda function from S3:"
  echo "aws lambda update-function-code --function-name RingAssistantEventListener --s3-bucket ring-assistant-lambda-deployment --s3-key lambda-func.zip --region us-west-2"
  aws lambda update-function-code --function-name RingAssistantEventListener --s3-bucket ring-assistant-lambda-deployment --s3-key lambda-func.zip --region us-west-2
fi
