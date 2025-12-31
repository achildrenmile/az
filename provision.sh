#!/bin/bash

# Arbeitszeit-Tracker Customer Provisioning Script
#
# Creates a new isolated customer instance with:
# - Cloudflare Tunnel for HTTPS access
# - DNS record at <customer>.az.strali.solutions
# - Docker container with SQLite database
# - Auto-generated admin credentials
#
# Usage:
#   ./provision.sh <customer-name>
#   ./provision.sh <customer-name> --with-dummydata
#   ./provision.sh <customer-name> --password <password>
#
# Authentication modes:
#   1. API Token (automated): Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
#   2. Interactive: Uses cloudflared CLI login (fallback if no token)
#
# Required environment variables for API mode:
#   CLOUDFLARE_API_TOKEN   - API token with Tunnel and DNS permissions
#   CLOUDFLARE_ACCOUNT_ID  - Cloudflare account ID
#
# Optional environment variables:
#   CLOUDFLARE_ZONE_ID     - Zone ID (auto-detected from domain if not set)
#   AZ_BASE_DOMAIN         - Base domain (default: az.strali.solutions)
#   AZ_CUSTOMERS_DIR       - Directory for customer data (default: ./customers)

set -e

# Configuration
# Note: Using az-<customer>.strali.solutions format for SSL compatibility
# Multi-level subdomains (customer.az.strali.solutions) require Advanced Certificate Manager
BASE_DOMAIN="${AZ_BASE_DOMAIN:-strali.solutions}"
CUSTOMER_PREFIX="${AZ_CUSTOMER_PREFIX:-az-}"
CUSTOMERS_DIR="${AZ_CUSTOMERS_DIR:-./customers}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CF_API_BASE="https://api.cloudflare.com/client/v4"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Authentication mode
USE_API_TOKEN=false

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Generate a strong random password
generate_password() {
    openssl rand -base64 24 | tr -dc 'A-Za-z0-9!@#$%&*' | head -c 16
}

# Validate customer name
validate_customer_name() {
    local name="$1"
    if [[ ! "$name" =~ ^[a-z0-9][a-z0-9-]*[a-z0-9]$ ]] && [[ ! "$name" =~ ^[a-z0-9]$ ]]; then
        log_error "Invalid customer name: '$name'"
        echo "  Customer name must:"
        echo "  - Start and end with a lowercase letter or number"
        echo "  - Contain only lowercase letters, numbers, and hyphens"
        echo "  - Be at least 1 character long"
        exit 1
    fi
}

# Cloudflare API request helper
cf_api() {
    local method="$1"
    local endpoint="$2"
    local data="$3"

    local args=(-s -X "$method" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json")

    if [ -n "$data" ]; then
        args+=(-d "$data")
    fi

    curl "${args[@]}" "${CF_API_BASE}${endpoint}"
}

# Get zone ID from domain
get_zone_id() {
    local domain="$1"
    # Extract root domain (e.g., strali.solutions from az.strali.solutions)
    local root_domain=$(echo "$domain" | awk -F. '{print $(NF-1)"."$NF}')

    log_info "Looking up zone ID for $root_domain..."

    local response=$(cf_api GET "/zones?name=$root_domain")
    local zone_id=$(echo "$response" | jq -r '.result[0].id // empty')

    if [ -z "$zone_id" ]; then
        log_error "Could not find zone for domain: $root_domain"
        echo "$response" | jq '.errors' 2>/dev/null || echo "$response"
        exit 1
    fi

    echo "$zone_id"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    # Check docker-compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "docker-compose is not installed"
        exit 1
    fi

    # Check jq
    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed (required for JSON parsing)"
        echo "  Install with: apt install jq"
        exit 1
    fi

    # Determine authentication mode
    if [ -n "$CLOUDFLARE_API_TOKEN" ] && [ -n "$CLOUDFLARE_ACCOUNT_ID" ]; then
        USE_API_TOKEN=true
        log_info "Using API token authentication"

        # Verify API token
        local verify=$(cf_api GET "/user/tokens/verify")
        local status=$(echo "$verify" | jq -r '.result.status // empty')

        if [ "$status" != "active" ]; then
            log_error "API token is invalid or inactive"
            echo "$verify" | jq '.errors' 2>/dev/null || echo "$verify"
            exit 1
        fi
        log_success "API token verified"

        # Get or lookup zone ID
        if [ -z "$CLOUDFLARE_ZONE_ID" ]; then
            CLOUDFLARE_ZONE_ID=$(get_zone_id "$BASE_DOMAIN")
        fi
        log_info "Zone ID: $CLOUDFLARE_ZONE_ID"
    else
        USE_API_TOKEN=false
        log_warning "API token not configured, using interactive mode"

        # Check cloudflared for interactive mode
        if ! command -v cloudflared &> /dev/null; then
            log_error "cloudflared is not installed (required for interactive mode)"
            echo ""
            echo "Either install cloudflared:"
            echo "  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared"
            echo ""
            echo "Or configure API token for automated mode:"
            echo "  export CLOUDFLARE_API_TOKEN=your_token"
            echo "  export CLOUDFLARE_ACCOUNT_ID=your_account_id"
            exit 1
        fi
    fi

    # Check if Docker image exists
    if ! docker image inspect arbeitszeit:latest &> /dev/null; then
        log_warning "Docker image 'arbeitszeit:latest' not found"
        log_info "Building Docker image..."
        docker build -t arbeitszeit:latest "$SCRIPT_DIR"
    fi

    log_success "All prerequisites met"
}

# Create Cloudflare Tunnel via API
create_tunnel_api() {
    local customer="$1"
    local tunnel_name="az-${customer}"

    log_info "Creating Cloudflare Tunnel via API: $tunnel_name"

    # Check if tunnel already exists
    local existing=$(cf_api GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel?name=$tunnel_name")
    local existing_id=$(echo "$existing" | jq -r '.result[0].id // empty')

    if [ -n "$existing_id" ]; then
        log_warning "Tunnel '$tunnel_name' already exists: $existing_id"
        TUNNEL_ID="$existing_id"
    else
        # Generate tunnel secret
        local tunnel_secret=$(openssl rand -base64 32)

        # Create tunnel
        local create_data=$(jq -n \
            --arg name "$tunnel_name" \
            --arg secret "$tunnel_secret" \
            '{name: $name, tunnel_secret: $secret, config_src: "cloudflare"}')

        local response=$(cf_api POST "/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel" "$create_data")
        TUNNEL_ID=$(echo "$response" | jq -r '.result.id // empty')

        if [ -z "$TUNNEL_ID" ]; then
            log_error "Failed to create tunnel"
            echo "$response" | jq '.errors' 2>/dev/null || echo "$response"
            exit 1
        fi

        log_success "Tunnel created: $TUNNEL_ID"
    fi
}

# Create Cloudflare Tunnel via CLI (interactive)
create_tunnel_cli() {
    local customer="$1"
    local tunnel_name="az-${customer}"

    log_info "Creating Cloudflare Tunnel via CLI: $tunnel_name"

    # Check if tunnel already exists
    if cloudflared tunnel list 2>/dev/null | grep -q "$tunnel_name"; then
        log_warning "Tunnel '$tunnel_name' already exists"
        TUNNEL_ID=$(cloudflared tunnel list --output json 2>/dev/null | jq -r ".[] | select(.name==\"$tunnel_name\") | .id")
    else
        # Create new tunnel
        cloudflared tunnel create "$tunnel_name"
        TUNNEL_ID=$(cloudflared tunnel list --output json 2>/dev/null | jq -r ".[] | select(.name==\"$tunnel_name\") | .id")
    fi

    if [ -z "$TUNNEL_ID" ]; then
        log_error "Failed to get tunnel ID"
        exit 1
    fi

    log_success "Tunnel created: $TUNNEL_ID"
}

# Get tunnel token via API
get_tunnel_token_api() {
    local tunnel_id="$1"

    log_info "Getting tunnel token via API..."

    local response=$(cf_api GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel/$tunnel_id/token")
    TUNNEL_TOKEN=$(echo "$response" | jq -r '.result // empty')

    if [ -z "$TUNNEL_TOKEN" ]; then
        log_error "Failed to get tunnel token"
        echo "$response" | jq '.errors' 2>/dev/null || echo "$response"
        exit 1
    fi

    log_success "Tunnel token retrieved"
}

# Get tunnel token via CLI
get_tunnel_token_cli() {
    local tunnel_name="$1"

    log_info "Getting tunnel token via CLI..."

    TUNNEL_TOKEN=$(cloudflared tunnel token "$tunnel_name" 2>/dev/null)

    if [ -z "$TUNNEL_TOKEN" ]; then
        log_error "Failed to get tunnel token"
        exit 1
    fi

    log_success "Tunnel token retrieved"
}

# Create DNS record via API
create_dns_record_api() {
    local customer="$1"
    local tunnel_id="$2"
    local hostname="${CUSTOMER_PREFIX}${customer}.${BASE_DOMAIN}"

    log_info "Creating DNS record via API: $hostname"

    # Check if record already exists
    local existing=$(cf_api GET "/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=$hostname&type=CNAME")
    local existing_id=$(echo "$existing" | jq -r '.result[0].id // empty')

    local cname_target="${tunnel_id}.cfargotunnel.com"

    if [ -n "$existing_id" ]; then
        log_warning "DNS record already exists, updating..."
        local update_data=$(jq -n \
            --arg name "$hostname" \
            --arg content "$cname_target" \
            '{type: "CNAME", name: $name, content: $content, proxied: true}')

        cf_api PUT "/zones/$CLOUDFLARE_ZONE_ID/dns_records/$existing_id" "$update_data" > /dev/null
    else
        local create_data=$(jq -n \
            --arg name "$hostname" \
            --arg content "$cname_target" \
            '{type: "CNAME", name: $name, content: $content, proxied: true}')

        local response=$(cf_api POST "/zones/$CLOUDFLARE_ZONE_ID/dns_records" "$create_data")
        local success=$(echo "$response" | jq -r '.success')

        if [ "$success" != "true" ]; then
            log_error "Failed to create DNS record"
            echo "$response" | jq '.errors' 2>/dev/null || echo "$response"
            exit 1
        fi
    fi

    log_success "DNS record created: https://$hostname"
}

# Create DNS record via CLI
create_dns_record_cli() {
    local customer="$1"
    local tunnel_id="$2"
    local hostname="${CUSTOMER_PREFIX}${customer}.${BASE_DOMAIN}"

    log_info "Creating DNS record via CLI: $hostname"

    # Route tunnel to hostname (--overwrite-dns to replace existing records)
    if ! cloudflared tunnel route dns --overwrite-dns "$tunnel_id" "$hostname" 2>&1; then
        log_warning "DNS route command had issues, but continuing..."
    fi

    log_success "DNS record created: https://$hostname"
}

# Configure tunnel ingress via API
configure_tunnel_ingress_api() {
    local customer="$1"
    local tunnel_id="$2"
    local hostname="${CUSTOMER_PREFIX}${customer}.${BASE_DOMAIN}"

    log_info "Configuring tunnel ingress via API..."

    local config_data=$(jq -n \
        --arg hostname "$hostname" \
        '{
            config: {
                ingress: [
                    {hostname: $hostname, service: "http://app:3000"},
                    {service: "http_status:404"}
                ]
            }
        }')

    local response=$(cf_api PUT "/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel/$tunnel_id/configurations" "$config_data")
    local success=$(echo "$response" | jq -r '.success')

    if [ "$success" != "true" ]; then
        log_warning "Could not configure tunnel ingress via API (may need manual configuration)"
    else
        log_success "Tunnel ingress configured"
    fi
}

# Create cloudflared config for locally-managed tunnel (CLI mode)
create_cloudflared_config() {
    local customer="$1"
    local tunnel_id="$2"
    local customer_dir="${CUSTOMERS_DIR}/${customer}"
    local hostname="${CUSTOMER_PREFIX}${customer}.${BASE_DOMAIN}"
    local creds_file="$HOME/.cloudflared/${tunnel_id}.json"

    log_info "Creating cloudflared configuration..."

    mkdir -p "$customer_dir/cloudflared"

    # Copy credentials file
    if [ -f "$creds_file" ]; then
        cp "$creds_file" "$customer_dir/cloudflared/credentials.json"
        chmod 644 "$customer_dir/cloudflared/credentials.json"
    else
        log_error "Tunnel credentials file not found: $creds_file"
        exit 1
    fi

    # Create config file with ingress rules
    cat > "$customer_dir/cloudflared/config.yml" << EOF
tunnel: ${tunnel_id}
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: ${hostname}
    service: http://app:3000
  - service: http_status:404
EOF

    log_success "Cloudflared config created"
}

# Create customer directory and files
create_customer_stack() {
    local customer="$1"
    local tunnel_token="$2"
    local admin_password="$3"
    local init_dummy_data="$4"
    local use_local_config="$5"
    local customer_dir="${CUSTOMERS_DIR}/${customer}"

    log_info "Creating customer stack in $customer_dir"

    # Create directory
    mkdir -p "$customer_dir/data"

    # Generate docker-compose.yml
    if [ "$use_local_config" = "true" ]; then
        # Use locally-managed tunnel with config file
        cat > "$customer_dir/docker-compose.yml" << EOF
# Docker Compose for Arbeitszeit-Tracker customer: ${customer}
# Customer URL: https://${CUSTOMER_PREFIX}${customer}.${BASE_DOMAIN}

services:
  app:
    image: arbeitszeit:latest
    container_name: az-${customer}
    restart: unless-stopped
    environment:
      - PORT=3000
      - DATABASE_PATH=/data/arbeitszeit.db
      - ADMIN_PASSWORD=${admin_password}
      - INIT_DUMMY_DATA=${init_dummy_data}
      - NODE_ENV=production
    volumes:
      - ./data:/data
    networks:
      - az-${customer}-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  tunnel:
    image: cloudflare/cloudflared:latest
    container_name: az-${customer}-tunnel
    restart: unless-stopped
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - ./cloudflared/config.yml:/etc/cloudflared/config.yml:ro
      - ./cloudflared/credentials.json:/etc/cloudflared/credentials.json:ro
    networks:
      - az-${customer}-network
    depends_on:
      app:
        condition: service_healthy

networks:
  az-${customer}-network:
    driver: bridge
EOF
    else
        # Use token-based tunnel (API mode with remote config)
        export CUSTOMER_NAME="$customer"
        export TUNNEL_TOKEN="$tunnel_token"
        export ADMIN_PASSWORD="$admin_password"
        export INIT_DUMMY_DATA="$init_dummy_data"

        envsubst < "$SCRIPT_DIR/docker-compose.template.yml" > "$customer_dir/docker-compose.yml"
    fi

    # Create .env file for reference
    cat > "$customer_dir/.env" << EOF
# Arbeitszeit-Tracker Customer: $customer
# Generated: $(date -Iseconds)
# URL: https://${CUSTOMER_PREFIX}${customer}.${BASE_DOMAIN}

CUSTOMER_NAME=$customer
ADMIN_PASSWORD=$admin_password
INIT_DUMMY_DATA=$init_dummy_data
EOF

    log_success "Customer stack created"
}

# Start customer containers
start_customer() {
    local customer="$1"
    local customer_dir="${CUSTOMERS_DIR}/${customer}"

    log_info "Starting customer containers..."

    cd "$customer_dir"

    if docker compose version &> /dev/null; then
        docker compose up -d
    else
        docker-compose up -d
    fi

    cd - > /dev/null

    log_success "Customer containers started"
}

# Print summary
print_summary() {
    local customer="$1"
    local admin_password="$2"
    local hostname="${CUSTOMER_PREFIX}${customer}.${BASE_DOMAIN}"
    local customer_dir="${CUSTOMERS_DIR}/${customer}"

    echo ""
    echo "========================================"
    echo -e "${GREEN}PROVISIONING COMPLETE${NC}"
    echo "========================================"
    echo ""
    echo "Customer: $customer"
    echo "URL:      https://$hostname"
    echo ""
    echo "Admin Credentials:"
    echo "  Username: admin"
    echo "  Password: $admin_password"
    echo ""
    echo "Files:"
    echo "  $customer_dir/docker-compose.yml"
    echo "  $customer_dir/.env"
    echo "  $customer_dir/data/  (SQLite database)"
    echo ""
    echo "Commands:"
    echo "  cd $customer_dir"
    echo "  docker compose logs -f      # View logs"
    echo "  docker compose restart      # Restart"
    echo "  docker compose down         # Stop"
    echo "  docker compose down -v      # Stop and remove data"
    echo ""
    echo "========================================"
}

# Main function
main() {
    local customer=""
    local admin_password=""
    local with_dummydata="false"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --with-dummydata)
                with_dummydata="true"
                shift
                ;;
            --password)
                admin_password="$2"
                shift 2
                ;;
            --help|-h)
                echo "Usage: $0 <customer-name> [options]"
                echo ""
                echo "Options:"
                echo "  --with-dummydata    Initialize with demo data"
                echo "  --password <pass>   Set admin password (generated if not provided)"
                echo "  --help              Show this help"
                echo ""
                echo "Environment variables:"
                echo "  CLOUDFLARE_API_TOKEN   API token (for automated mode)"
                echo "  CLOUDFLARE_ACCOUNT_ID  Account ID (for automated mode)"
                echo "  CLOUDFLARE_ZONE_ID     Zone ID (optional, auto-detected)"
                echo "  AZ_BASE_DOMAIN         Base domain (default: az.strali.solutions)"
                echo ""
                echo "Examples:"
                echo "  # Interactive mode (uses cloudflared login)"
                echo "  $0 demo"
                echo ""
                echo "  # Automated mode (uses API token)"
                echo "  export CLOUDFLARE_API_TOKEN=xxx"
                echo "  export CLOUDFLARE_ACCOUNT_ID=xxx"
                echo "  $0 demo --with-dummydata"
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                exit 1
                ;;
            *)
                if [ -z "$customer" ]; then
                    customer="$1"
                else
                    log_error "Unexpected argument: $1"
                    exit 1
                fi
                shift
                ;;
        esac
    done

    # Validate customer name
    if [ -z "$customer" ]; then
        log_error "Customer name is required"
        echo "Usage: $0 <customer-name> [--with-dummydata] [--password <pass>]"
        exit 1
    fi

    validate_customer_name "$customer"

    # Generate password if not provided
    if [ -z "$admin_password" ]; then
        admin_password=$(generate_password)
    fi

    # Check if customer already exists
    if [ -d "${CUSTOMERS_DIR}/${customer}" ]; then
        log_error "Customer '$customer' already exists at ${CUSTOMERS_DIR}/${customer}"
        echo "To reprovision, first remove the existing customer:"
        echo "  cd ${CUSTOMERS_DIR}/${customer} && docker compose down -v && cd .. && rm -rf ${customer}"
        exit 1
    fi

    echo ""
    echo "========================================"
    echo "ARBEITSZEIT-TRACKER PROVISIONING"
    echo "========================================"
    echo ""
    echo "Customer:    $customer"
    echo "Domain:      ${CUSTOMER_PREFIX}${customer}.${BASE_DOMAIN}"
    echo "Dummy Data:  $with_dummydata"
    echo ""

    # Run provisioning steps
    check_prerequisites

    local tunnel_name="az-${customer}"
    local use_local_config="false"

    # Create tunnel (API or CLI)
    if [ "$USE_API_TOKEN" = true ]; then
        # API mode: remotely-managed tunnel with token
        create_tunnel_api "$customer"
        get_tunnel_token_api "$TUNNEL_ID"
        create_dns_record_api "$customer" "$TUNNEL_ID"
        configure_tunnel_ingress_api "$customer" "$TUNNEL_ID"
        use_local_config="false"
    else
        # CLI mode: locally-managed tunnel with config file
        create_tunnel_cli "$customer"
        create_dns_record_cli "$customer" "$TUNNEL_ID"
        create_cloudflared_config "$customer" "$TUNNEL_ID"
        use_local_config="true"
        TUNNEL_TOKEN=""  # Not used in local config mode
    fi

    create_customer_stack "$customer" "$TUNNEL_TOKEN" "$admin_password" "$with_dummydata" "$use_local_config"

    start_customer "$customer"

    print_summary "$customer" "$admin_password"
}

# Run main
main "$@"
