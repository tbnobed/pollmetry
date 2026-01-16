# PollMetry.io Docker Deployment Guide

## Prerequisites

- Ubuntu Server (20.04 LTS or newer recommended)
- Docker Engine 20.10+
- Docker Compose 2.0+

## Quick Start

### 1. Install Docker on Ubuntu

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (logout/login required)
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y
```

### 2. Clone and Configure

```bash
# Clone or copy your project to the server
cd /opt
sudo mkdir pollmetry && sudo chown $USER:$USER pollmetry
cd pollmetry

# Copy your project files here, then:
cp .env.example .env

# Edit .env with secure values
nano .env
```

### 3. Configure Environment Variables

Edit `.env` with secure passwords:

```bash
# Generate a secure password
openssl rand -base64 24

# Generate a session secret
openssl rand -base64 32
```

Update `.env`:
```
POSTGRES_PASSWORD=your_secure_database_password
SESSION_SECRET=your_secure_session_secret
```

### 4. Build and Start

```bash
# Build and start all services
docker compose up -d --build

# Check status
docker compose ps

# View logs
docker compose logs -f app
```

### 5. Initialize Database Schema

After the first startup, run the database migration:

```bash
# Run Drizzle schema push
docker compose exec app npm run db:push
```

## Production Deployment

For production with resource limits and better logging:

```bash
cd docker
docker compose -f docker-compose.prod.yml up -d --build
```

## Useful Commands

```bash
# Stop all services
docker compose down

# Stop and remove volumes (WARNING: deletes database!)
docker compose down -v

# Restart app only
docker compose restart app

# View app logs
docker compose logs -f app

# View database logs
docker compose logs -f db

# Access database CLI
docker compose exec db psql -U pollmetry -d pollmetry

# Access app container shell
docker compose exec app sh
```

## Reverse Proxy (Optional)

For HTTPS with Nginx:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

## Health Check

The app exposes a health endpoint at `/api/health`:

```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{"status":"healthy","timestamp":"2024-01-16T12:00:00.000Z"}
```

## Troubleshooting

### Database Connection Issues
```bash
# Check if database is healthy
docker compose exec db pg_isready -U pollmetry -d pollmetry

# Check database logs
docker compose logs db
```

### App Won't Start
```bash
# Check app logs for errors
docker compose logs app

# Rebuild without cache
docker compose build --no-cache app
docker compose up -d
```

### Port Already in Use
```bash
# Find what's using port 5000
sudo lsof -i :5000

# Or change the port in docker-compose.yml
ports:
  - "3000:5000"  # Maps external 3000 to internal 5000
```

## Backup Database

```bash
# Create backup
docker compose exec db pg_dump -U pollmetry pollmetry > backup_$(date +%Y%m%d).sql

# Restore backup
cat backup_20240116.sql | docker compose exec -T db psql -U pollmetry -d pollmetry
```

## Default Admin Account

On first run, a default admin account is created:
- **Username:** admin
- **Password:** admin123

**IMPORTANT:** Change this password immediately after first login!
