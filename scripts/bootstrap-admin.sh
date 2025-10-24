#!/usr/bin/env bash
set -euo pipefail

#############################################################################
# Bootstrap Admin Panel (admin.slimyai.xyz)
#
# Idempotent setup script for production deployment on Ubuntu/Debian.
# Run as user 'slimy' with sudo access.
#
# Usage:
#   cd /opt/slimy/app
#   npm run admin:bootstrap
#
# Or directly:
#   bash ./scripts/bootstrap-admin.sh
#############################################################################

REPO_ROOT="/opt/slimy/app"
ENV_FILE="${REPO_ROOT}/admin-api/.env.admin.production"
ENV_EXAMPLE="${REPO_ROOT}/admin-api/.env.admin.production.example"
BACKUP_ROOT="/var/backups/slimy"
BACKUP_MYSQL="${BACKUP_ROOT}/mysql"
BACKUP_DATA="${BACKUP_ROOT}/data"
CADDY_CONFIG="/etc/caddy/Caddyfile"
REQUIRED_USER="slimy"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check OS
    if [[ ! -f /etc/os-release ]]; then
        log_error "Cannot detect OS. /etc/os-release not found."
        exit 1
    fi

    source /etc/os-release
    if [[ "$ID" != "ubuntu" ]] && [[ "$ID" != "debian" ]]; then
        log_error "Unsupported OS: $ID. This script requires Ubuntu or Debian."
        exit 1
    fi
    log_success "OS detected: $ID $VERSION_ID"

    # Check sudo access
    if ! sudo -n true 2>/dev/null; then
        log_error "This script requires sudo access. Run 'sudo -v' first or add user to sudoers."
        exit 1
    fi
    log_success "Sudo access confirmed"

    # Check we're in the right directory
    if [[ ! -f "${REPO_ROOT}/package.json" ]]; then
        log_error "Must run from ${REPO_ROOT}"
        exit 1
    fi

    # Warn if not running as slimy user
    if [[ "$(whoami)" != "$REQUIRED_USER" ]]; then
        log_warn "Running as $(whoami), but deployment expects user '$REQUIRED_USER'"
        log_warn "Services will run as '$REQUIRED_USER' regardless"
    fi
}

setup_directories() {
    log_info "Setting up backup directories..."

    for dir in "$BACKUP_ROOT" "$BACKUP_MYSQL" "$BACKUP_DATA"; do
        if [[ ! -d "$dir" ]]; then
            sudo mkdir -p "$dir"
            log_success "Created: $dir"
        else
            log_info "Already exists: $dir"
        fi
    done

    # Ensure slimy user owns backup directories
    sudo chown -R slimy:slimy "$BACKUP_ROOT"
    log_success "Set ownership: slimy:slimy on $BACKUP_ROOT"

    # Create out directory for build logs
    if [[ ! -d "${REPO_ROOT}/out" ]]; then
        mkdir -p "${REPO_ROOT}/out"
        log_success "Created: ${REPO_ROOT}/out"
    fi
}

fix_ownership() {
    log_info "Fixing ownership of admin-api and admin-ui..."

    for dir in admin-api admin-ui; do
        local target="${REPO_ROOT}/${dir}"
        if [[ -d "$target" ]]; then
            local owner=$(stat -c '%U:%G' "$target")
            if [[ "$owner" != "slimy:slimy" ]]; then
                sudo chown -R slimy:slimy "$target"
                log_success "Fixed ownership: $target (was $owner, now slimy:slimy)"
            else
                log_info "Already correct: $target owned by slimy:slimy"
            fi
        fi
    done
}

setup_env_file() {
    log_info "Configuring production environment file..."

    if [[ -f "$ENV_FILE" ]]; then
        log_info "Production env file already exists: $ENV_FILE"
        chmod 600 "$ENV_FILE"
        log_success "Set permissions: 600 on $ENV_FILE"
        return 0
    fi

    if [[ ! -f "$ENV_EXAMPLE" ]]; then
        log_error "Missing example file: $ENV_EXAMPLE"
        exit 1
    fi

    # Copy from example
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    log_success "Created: $ENV_FILE (from example)"

    # Check for placeholders
    local missing_secrets=()

    if grep -q "JWT_SECRET=replace_me_with_32+_chars" "$ENV_FILE"; then
        missing_secrets+=("JWT_SECRET (generate with: openssl rand -base64 32)")
    fi

    if grep -q "^DISCORD_CLIENT_ID=$" "$ENV_FILE"; then
        missing_secrets+=("DISCORD_CLIENT_ID (from Discord Developer Portal)")
    fi

    if grep -q "^DISCORD_CLIENT_SECRET=$" "$ENV_FILE"; then
        missing_secrets+=("DISCORD_CLIENT_SECRET (from Discord Developer Portal)")
    fi

    if grep -q "DB_URL=mysql://user:password@" "$ENV_FILE"; then
        missing_secrets+=("DB_URL (update with real MySQL credentials)")
    fi

    if [[ ${#missing_secrets[@]} -gt 0 ]]; then
        log_warn "==================== ACTION REQUIRED ===================="
        log_warn "Production env file created but contains placeholders."
        log_warn "Edit $ENV_FILE and fill in:"
        for secret in "${missing_secrets[@]}"; do
            log_warn "  - $secret"
        done
        log_warn "Then run: sudo systemctl restart admin-api admin-ui"
        log_warn "========================================================="
    else
        log_success "All required secrets appear to be configured"
    fi
}

install_caddy() {
    log_info "Installing Caddy web server..."

    if command -v caddy &>/dev/null; then
        log_info "Caddy already installed: $(caddy version)"
        return 0
    fi

    # Install Caddy dependencies
    sudo apt-get update -qq
    sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl

    # Add Caddy GPG key and repository
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list

    # Install Caddy
    sudo apt-get update -qq
    sudo apt-get install -y caddy

    log_success "Caddy installed: $(caddy version)"
}

install_nginx() {
    log_info "Installing nginx and certbot..."

    if ! command -v nginx &>/dev/null; then
        sudo apt-get update -qq
        sudo apt-get install -y nginx
        log_success "nginx installed"
    else
        log_info "nginx already installed"
    fi

    if ! command -v certbot &>/dev/null; then
        sudo apt-get install -y certbot python3-certbot-nginx
        log_success "certbot installed"
    else
        log_info "certbot already installed"
    fi
}

configure_reverse_proxy() {
    if [[ "${USE_NGINX:-0}" == "1" ]]; then
        log_info "Configuring nginx (USE_NGINX=1 detected)..."
        install_nginx

        # Run the setup script
        if [[ -x "${REPO_ROOT}/deploy/scripts/setup-nginx-admin.sh" ]]; then
            sudo bash "${REPO_ROOT}/deploy/scripts/setup-nginx-admin.sh"
            log_success "nginx configured via setup-nginx-admin.sh"
        else
            log_warn "nginx setup script not executable or missing"
            log_warn "Run manually: sudo bash ${REPO_ROOT}/deploy/scripts/setup-nginx-admin.sh"
        fi
    else
        log_info "Configuring Caddy (default)..."
        install_caddy

        # Install Caddyfile
        if [[ -f "${REPO_ROOT}/deploy/Caddyfile" ]]; then
            sudo cp "${REPO_ROOT}/deploy/Caddyfile" "$CADDY_CONFIG"
            sudo systemctl reload caddy || sudo systemctl restart caddy
            log_success "Caddyfile installed and Caddy reloaded"
        else
            log_error "Missing: ${REPO_ROOT}/deploy/Caddyfile"
            exit 1
        fi
    fi
}

install_systemd_services() {
    log_info "Installing systemd services..."

    local services=("admin-api" "admin-ui")

    for service in "${services[@]}"; do
        local source="${REPO_ROOT}/deploy/systemd/${service}.service"
        local target="/etc/systemd/system/${service}.service"

        if [[ ! -f "$source" ]]; then
            log_error "Missing service file: $source"
            exit 1
        fi

        sudo cp "$source" "$target"
        log_success "Installed: $target"
    done

    sudo systemctl daemon-reload
    log_success "systemd daemon reloaded"
}

install_node_deps() {
    log_info "Installing Node.js dependencies..."

    cd "$REPO_ROOT"

    if [[ ! -d node_modules ]]; then
        npm ci
        log_success "Dependencies installed (npm ci)"
    else
        log_info "node_modules exists, skipping install (run 'npm ci' manually if needed)"
    fi
}

build_admin_ui() {
    log_info "Building Admin UI..."

    cd "$REPO_ROOT"

    # Check if admin-ui/package.json has a build script
    if [[ ! -f admin-ui/package.json ]]; then
        log_warn "admin-ui/package.json not found, skipping build"
        log_warn "TODO: Create admin-ui/package.json with Next.js build script"
        return 0
    fi

    if ! grep -q '"build"' admin-ui/package.json; then
        log_warn "admin-ui/package.json has no 'build' script, skipping build"
        log_warn "TODO: Add build script to admin-ui/package.json"
        return 0
    fi

    if [[ ! -d admin-ui/.next ]]; then
        npm run admin:ui:build 2>&1 | tee out/admin-ui-build.log
        if [[ -d admin-ui/.next ]]; then
            log_success "Admin UI built successfully"
        else
            log_error "Build failed. Check out/admin-ui-build.log"
            exit 1
        fi
    else
        log_info "Build exists (.next directory found), skipping"
        log_info "To rebuild, delete admin-ui/.next and re-run"
    fi
}

enable_and_start_services() {
    log_info "Enabling and starting services..."

    local services=("admin-api" "admin-ui")

    for service in "${services[@]}"; do
        sudo systemctl enable "$service" 2>/dev/null || true

        if systemctl is-active --quiet "$service"; then
            log_info "$service is already running, restarting..."
            sudo systemctl restart "$service"
        else
            sudo systemctl start "$service"
        fi

        if systemctl is-active --quiet "$service"; then
            log_success "$service is active"
        else
            log_error "$service failed to start. Check: journalctl -u $service -n 50"
            exit 1
        fi
    done
}

configure_firewall() {
    log_info "Configuring firewall..."

    if ! command -v ufw &>/dev/null; then
        log_info "ufw not installed, skipping firewall configuration"
        return 0
    fi

    # Allow HTTP/HTTPS if not already allowed
    sudo ufw allow 80/tcp comment 'HTTP' 2>/dev/null || log_info "Port 80 already allowed"
    sudo ufw allow 443/tcp comment 'HTTPS' 2>/dev/null || log_info "Port 443 already allowed"

    log_success "Firewall rules configured"
}

run_verification() {
    log_info "Running verification checks..."

    echo ""
    echo "=========================================="
    echo "  Deployment Status"
    echo "=========================================="

    # Service status
    echo ""
    echo "Services:"
    for service in admin-api admin-ui; do
        if systemctl is-active --quiet "$service"; then
            echo -e "  ✓ $service: ${GREEN}active${NC}"
        else
            echo -e "  ✗ $service: ${RED}inactive${NC}"
        fi
    done

    # Caddy/nginx status
    echo ""
    echo "Reverse Proxy:"
    if [[ "${USE_NGINX:-0}" == "1" ]]; then
        if systemctl is-active --quiet nginx; then
            echo -e "  ✓ nginx: ${GREEN}active${NC}"
        else
            echo -e "  ✗ nginx: ${RED}inactive${NC}"
        fi
    else
        if systemctl is-active --quiet caddy; then
            echo -e "  ✓ caddy: ${GREEN}active${NC}"
        else
            echo -e "  ✗ caddy: ${RED}inactive${NC}"
        fi
    fi

    # Environment file
    echo ""
    echo "Configuration:"
    if [[ -f "$ENV_FILE" ]]; then
        echo -e "  ✓ Production env: ${GREEN}exists${NC}"

        # Check for placeholders
        if grep -q "replace_me" "$ENV_FILE" || grep -q "^DISCORD_CLIENT_ID=$" "$ENV_FILE"; then
            echo -e "  ${YELLOW}⚠${NC}  Warning: Placeholders detected in $ENV_FILE"
        fi
    else
        echo -e "  ✗ Production env: ${RED}missing${NC}"
    fi

    echo ""
    echo "=========================================="
    echo "  Next Steps"
    echo "=========================================="
    echo ""
    echo "1. Edit production environment file:"
    echo "   nano $ENV_FILE"
    echo ""
    echo "2. Fill in required secrets (JWT_SECRET, DISCORD_*, DB_URL)"
    echo ""
    echo "3. Restart services:"
    echo "   sudo systemctl restart admin-api admin-ui"
    echo ""
    echo "4. Verify HTTPS and headers:"
    echo "   curl -I http://admin.slimyai.xyz"
    echo "   curl -I https://admin.slimyai.xyz | grep -i 'strict-transport\\|x-frame'"
    echo ""
    echo "5. Check service logs if needed:"
    echo "   journalctl -u admin-api -n 50 -f"
    echo "   journalctl -u admin-ui -n 50 -f"
    echo ""
    echo "=========================================="
}

main() {
    log_info "Starting Admin Panel bootstrap..."
    echo ""

    check_prerequisites
    setup_directories
    fix_ownership
    setup_env_file
    configure_reverse_proxy
    install_systemd_services
    install_node_deps
    build_admin_ui
    enable_and_start_services
    configure_firewall

    echo ""
    log_success "Bootstrap complete!"
    echo ""

    run_verification
}

# Run main function
main "$@"
