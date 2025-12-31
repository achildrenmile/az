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
# Prerequisites:
#   - Docker and docker-compose installed
#   - cloudflared CLI installed and authenticated
#   - Cloudflare API token with DNS and Tunnel permissions
#
# Environment variables (optional):
#   CLOUDFLARE_ACCOUNT_ID  - Cloudflare account ID
#   CLOUDFLARE_ZONE_ID     - Zone ID for strali.solutions
#   CLOUDFLARE_API_TOKEN   - API token for DNS management
#   AZ_BASE_DOMAIN         - Base domain (default: az.strali.solutions)
#   AZ_CUSTOMERS_DIR       - Directory for customer data (default: ./customers)

set -e

# Configuration
BASE_DOMAIN="${AZ_BASE_DOMAIN:-az.strali.solutions}"
CUSTOMERS_DIR="${AZ_CUSTOMERS_DIR:-./customers}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
    # Generate 16 character password with letters, numbers, and symbols
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

    # Check cloudflared
    if ! command -v cloudflared &> /dev/null; then
        log_error "cloudflared is not installed"
        echo "  Install with: curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared"
        exit 1
    fi

    # Check if Docker image exists
    if ! docker image inspect arbeitszeit:latest &> /dev/null; then
        log_warning "Docker image 'arbeitszeit:latest' not found"
        log_info "Building Docker image..."
        docker build -t arbeitszeit:latest "$SCRIPT_DIR"
    fi

    log_success "All prerequisites met"
}

# Create Cloudflare Tunnel
create_tunnel() {
    local customer="$1"
    local tunnel_name="az-${customer}"

    log_info "Creating Cloudflare Tunnel: $tunnel_name"

    # Check if tunnel already exists
    if cloudflared tunnel list | grep -q "$tunnel_name"; then
        log_warning "Tunnel '$tunnel_name' already exists"
        TUNNEL_ID=$(cloudflared tunnel list --output json | jq -r ".[] | select(.name==\"$tunnel_name\") | .id")
    else
        # Create new tunnel
        cloudflared tunnel create "$tunnel_name"
        TUNNEL_ID=$(cloudflared tunnel list --output json | jq -r ".[] | select(.name==\"$tunnel_name\") | .id")
    fi

    if [ -z "$TUNNEL_ID" ]; then
        log_error "Failed to get tunnel ID"
        exit 1
    fi

    log_success "Tunnel created: $TUNNEL_ID"
    echo "$TUNNEL_ID"
}

# Get tunnel token
get_tunnel_token() {
    local tunnel_name="$1"

    log_info "Getting tunnel token..."

    # Get token from cloudflared
    TUNNEL_TOKEN=$(cloudflared tunnel token "$tunnel_name" 2>/dev/null)

    if [ -z "$TUNNEL_TOKEN" ]; then
        log_error "Failed to get tunnel token"
        exit 1
    fi

    log_success "Tunnel token retrieved"
    echo "$TUNNEL_TOKEN"
}

# Create DNS record
create_dns_record() {
    local customer="$1"
    local tunnel_id="$2"
    local hostname="${customer}.${BASE_DOMAIN}"

    log_info "Creating DNS record: $hostname"

    # Route tunnel to hostname
    cloudflared tunnel route dns "$tunnel_id" "$hostname" 2>/dev/null || true

    log_success "DNS record created: https://$hostname"
}

# Configure tunnel ingress
configure_tunnel_ingress() {
    local customer="$1"
    local tunnel_id="$2"
    local customer_dir="$3"
    local hostname="${customer}.${BASE_DOMAIN}"

    log_info "Configuring tunnel ingress..."

    # Create tunnel config
    cat > "$customer_dir/tunnel-config.yml" << EOF
tunnel: $tunnel_id
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: $hostname
    service: http://app:3000
  - service: http_status:404
EOF

    log_success "Tunnel ingress configured"
}

# Create customer directory and files
create_customer_stack() {
    local customer="$1"
    local tunnel_token="$2"
    local admin_password="$3"
    local init_dummy_data="$4"
    local customer_dir="${CUSTOMERS_DIR}/${customer}"

    log_info "Creating customer stack in $customer_dir"

    # Create directory
    mkdir -p "$customer_dir/data"

    # Generate docker-compose.yml from template
    export CUSTOMER_NAME="$customer"
    export TUNNEL_TOKEN="$tunnel_token"
    export ADMIN_PASSWORD="$admin_password"
    export INIT_DUMMY_DATA="$init_dummy_data"

    envsubst < "$SCRIPT_DIR/docker-compose.template.yml" > "$customer_dir/docker-compose.yml"

    # Create .env file for reference (not used by docker-compose, but useful for debugging)
    cat > "$customer_dir/.env" << EOF
# Arbeitszeit-Tracker Customer: $customer
# Generated: $(date -Iseconds)
# URL: https://${customer}.${BASE_DOMAIN}

CUSTOMER_NAME=$customer
ADMIN_PASSWORD=$admin_password
INIT_DUMMY_DATA=$init_dummy_data
# TUNNEL_TOKEN is stored in docker-compose.yml for security
EOF

    log_success "Customer stack created"
}

# Start customer containers
start_customer() {
    local customer="$1"
    local customer_dir="${CUSTOMERS_DIR}/${customer}"

    log_info "Starting customer containers..."

    cd "$customer_dir"

    # Use docker compose (v2) or docker-compose (v1)
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
    local hostname="${customer}.${BASE_DOMAIN}"
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
                echo "Examples:"
                echo "  $0 demo                        # Create 'demo' customer"
                echo "  $0 demo --with-dummydata       # Create with demo data"
                echo "  $0 acme --password 'Secret123' # Create with specific password"
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
    echo "Domain:      ${customer}.${BASE_DOMAIN}"
    echo "Dummy Data:  $with_dummydata"
    echo ""

    # Run provisioning steps
    check_prerequisites

    tunnel_name="az-${customer}"
    create_tunnel "$customer"

    tunnel_token=$(get_tunnel_token "$tunnel_name")

    # Get tunnel ID for DNS
    tunnel_id=$(cloudflared tunnel list --output json | jq -r ".[] | select(.name==\"$tunnel_name\") | .id")

    create_dns_record "$customer" "$tunnel_id"

    create_customer_stack "$customer" "$tunnel_token" "$admin_password" "$with_dummydata"

    start_customer "$customer"

    print_summary "$customer" "$admin_password"
}

# Run main
main "$@"
