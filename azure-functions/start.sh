#!/bin/bash
set -e

echo "Starting Azurite storage emulator..."
azurite --silent --location /tmp/azurite --blobHost 0.0.0.0 --queueHost 0.0.0.0 --tableHost 0.0.0.0 &

echo "Waiting for Azurite to be ready..."
sleep 10

# Connection string is set in Dockerfile ENV, use it for all child processes
export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXOU+FY=;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1/;TableEndpoint=http://127.0.0.1:10002/;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1/;"

# Optionally populate with seed data if table is empty
if [ -f "dist/scripts/seedData.js" ]; then
    echo "Populating sample data..."
    node dist/scripts/seedData.js || echo "Seed data already populated or skipped"
fi

echo "Starting Azure Functions host..."
echo 'n' | func host start --verbose
