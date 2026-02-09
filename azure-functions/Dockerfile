# Use Node.js 20 LTS (matches package.json requirement and has better ARM64 support)
FROM node:20-bullseye-slim

# Install required system dependencies for Azure Functions
RUN apt-get update && apt-get install -y libicu67 && rm -rf /var/lib/apt/lists/*

# Install Azure Functions Core Tools and Azurite storage emulator
RUN npm install -g azure-functions-core-tools@4 azurite --force

# Set the working directory
WORKDIR /home/site/wwwroot

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm install --production

# Copy the built functions preserving the dist folder structure
COPY dist/ ./dist/

# Copy host.json and local.settings.json
COPY host.json ./
COPY local.settings.json ./

# Copy startup script
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

# Set environment variables for Azurite connection
ENV AZURE_STORAGE_ACCOUNT_NAME=devstoreaccount1
ENV AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXOU+FY=;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1/;TableEndpoint=http://127.0.0.1:10002/;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1/;"

# Expose the Functions port and Azurite ports
EXPOSE 7071 10000 10001 10002

# Start both Azurite and Functions host
CMD ["/usr/local/bin/start.sh"]
