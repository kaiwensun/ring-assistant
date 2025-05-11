#!/usr/bin/env zsh

set -e

root=$(dirname "$(realpath "$0")")
pushd "${root}" > /dev/null

VENV=".venv"
# Create venv and install requirements

if [ ! -d ".venv" ]; then
    python3 -m venv ".venv"
fi

if [ -z "${VIRTUAL_ENV}" ]; then
    source ./.venv/bin/activate
elif [ "${VIRTUAL_ENV}" != "$(realpath .venv 2>/dev/null)" ]; then
    echo "You are in a different virtual environment: ${VIRTUAL_ENV}."
    exit 1
fi
echo "Using virtual environment: ${VIRTUAL_ENV}"
pip3 install -r requirements.txt

# package
# https://docs.aws.amazon.com/lambda/latest/dg/python-package.html#python-package-create-dependencies
package_path=`pip3 show boto3 | awk -F ': ' '/^Location:/ {print $2}'`
pushd "$package_path" > /dev/null

DEPLOYABLE="${root}/deployable.zip"
zip -r "${DEPLOYABLE}" .
popd > /dev/null
find . -name "*.py" \
    -not -path "./.venv/*" \
    -not -path "*/__pycache__/*" \
    -exec zip "${DEPLOYABLE}" {} \;

# update lambda function
aws lambda update-function-code \
    --function-name RingAssistantEventListener \
    --zip-file "fileb://${DEPLOYABLE}" \
    --query "FunctionArn" \
    --output text
rm "${DEPLOYABLE}"