# Use a Node.js 18 base image
FROM node:18-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy server's package files and install dependencies
COPY server/package*.json ./
RUN npm install

# Copy the rest of the server's source code
COPY server/ .

# Expose the port the server runs on
EXPOSE 5001

# The command to start the server
CMD ["npm", "start"]
