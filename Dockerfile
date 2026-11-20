# Build the React + Vite frontend
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies from the npm workspaces
COPY package.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm install

# Build the frontend
COPY . .
RUN npm run build

# Serve the static frontend with Nginx
FROM nginx:alpine AS production

# Railway provides the port through the PORT environment variable.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 8080
