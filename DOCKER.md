# Docker Deployment

The Arbeitszeit-Tracker can be deployed as a Docker container for isolated, repeatable deployments.

## Quick Start

### Build the Image

```bash
docker build -t arbeitszeit:latest .
```

### Run a Container

```bash
# Basic usage (auto-generates admin password)
docker run -d -p 3000:3000 -v ./data:/data arbeitszeit:latest

# With specific admin password
docker run -d -p 3000:3000 -v ./data:/data \
  -e ADMIN_PASSWORD=YourSecurePassword123 \
  arbeitszeit:latest

# With demo data
docker run -d -p 3000:3000 -v ./data:/data \
  -e INIT_DUMMY_DATA=true \
  arbeitszeit:latest
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `DATABASE_PATH` | /data/arbeitszeit.db | SQLite database path |
| `ADMIN_PASSWORD` | (generated) | Admin password on first startup |
| `INIT_DUMMY_DATA` | false | Set to `true` to initialize with demo data |
| `NODE_ENV` | production | Node environment |

## Initialization Modes

The container supports two initialization modes (only runs on first startup):

### Admin-Only Mode (Default)

Creates a single admin user:
- Username: `admin`
- Password: Auto-generated (printed in logs) or set via `ADMIN_PASSWORD`

```bash
docker run -d -v ./data:/data arbeitszeit:latest
# Check logs for generated password:
docker logs <container-id>
```

### Dummy Data Mode

Creates admin user plus demo data:
- 5 demo employees (password: `Demo1234!`)
- 5 demo customers
- 5 demo construction sites
- ~30 days of time entries

```bash
docker run -d -v ./data:/data -e INIT_DUMMY_DATA=true arbeitszeit:latest
```

## Persistence

The SQLite database is stored at `/data/arbeitszeit.db`. Mount a volume to persist data:

```bash
docker run -v /path/to/data:/data arbeitszeit:latest
```

## Health Check

The container includes a health check:
- Endpoint: `http://localhost:3000/`
- Interval: 30 seconds
- Timeout: 5 seconds
- Retries: 3

Check container health:
```bash
docker inspect --format='{{.State.Health.Status}}' <container-id>
```

## Multi-Tenant Provisioning

For automated multi-tenant deployments with Cloudflare Tunnels, use the provisioning script:

```bash
# Provision a new customer
./provision.sh customer-name

# With demo data
./provision.sh demo --with-dummydata

# With specific password
./provision.sh acme --password "SecurePass123"
```

Each customer gets:
- Isolated Docker container
- Dedicated SQLite database
- Cloudflare Tunnel for HTTPS
- DNS record at `<customer>.az.strali.solutions`

### Prerequisites for Provisioning

1. Docker and docker-compose installed
2. cloudflared CLI installed and authenticated
3. jq installed for JSON parsing

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared

# Authenticate
cloudflared tunnel login
```

## Docker Compose

### Single Instance

```yaml
services:
  arbeitszeit:
    image: arbeitszeit:latest
    container_name: arbeitszeit
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - ADMIN_PASSWORD=YourSecurePassword
    volumes:
      - ./data:/data
```

### With Cloudflare Tunnel

```yaml
services:
  app:
    image: arbeitszeit:latest
    container_name: arbeitszeit
    restart: unless-stopped
    environment:
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    volumes:
      - ./data:/data

  tunnel:
    image: cloudflare/cloudflared:latest
    container_name: arbeitszeit-tunnel
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${TUNNEL_TOKEN}
    depends_on:
      - app
```

## Backup

```bash
# Stop container
docker stop arbeitszeit

# Copy database
cp ./data/arbeitszeit.db ./backups/arbeitszeit_$(date +%Y%m%d).db

# Start container
docker start arbeitszeit
```

## Upgrade

```bash
# Pull/build new image
docker build -t arbeitszeit:latest .

# Recreate container (data persists in volume)
docker stop arbeitszeit
docker rm arbeitszeit
docker run -d --name arbeitszeit -v ./data:/data arbeitszeit:latest
```

## Troubleshooting

### Container won't start
```bash
docker logs arbeitszeit
```

### Permission denied errors
Ensure the data directory is writable:
```bash
chmod 777 ./data
```

### Database locked
Only one container should access the SQLite database. Stop any duplicate containers.

### Check container health
```bash
docker inspect --format='{{json .State.Health}}' arbeitszeit | jq
```
