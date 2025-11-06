# Monitoring and Observability Setup Guide

## Overview

This guide provides comprehensive instructions for setting up and configuring monitoring and observability for the Slimy Admin API. The system includes Sentry error tracking, Prometheus metrics collection, Grafana dashboards, alerting, and structured logging.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Admin API     │───▶│   Prometheus    │───▶│    Grafana      │
│                 │    │                 │    │                 │
│ • Error Tracking│    │ • Metrics       │    │ • Dashboards    │
│ • Performance   │    │ • Health Checks │    │ • Alerts        │
│ • Structured Logs│   │ • Alert Rules   │    │ • Visualizations│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌─────────────────┐
                    │    Sentry       │
                    │                 │
                    │ • Error Tracking│
                    │ • Performance   │
                    │ • Profiling     │
                    └─────────────────┘
```

## Prerequisites

- Node.js 18+
- Docker and Docker Compose (for local monitoring stack)
- Sentry account (for error tracking)
- SMTP server (for email alerts) - optional

## Quick Start

### 1. Environment Configuration

Add the following environment variables to your `.env` file:

```bash
# Sentry Configuration
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Service Information
ADMIN_API_SERVICE_NAME=slimy-admin-api
ADMIN_API_VERSION=1.0.0

# Logging
LOG_LEVEL=info

# Optional: Alertmanager SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### 2. Local Development Setup

Start the monitoring stack using Docker Compose:

```bash
# From the web directory
cd /opt/slimy/web
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

This will start:
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093

### 3. Import Dashboard

1. Open Grafana at http://localhost:3000
2. Login with admin/admin
3. Navigate to Dashboards → Import
4. Upload `monitoring/dashboards/grafana-dashboard.json`
5. Select Prometheus as the data source

## Core Components

### Error Tracking (Sentry)

**File**: `src/lib/monitoring/sentry.ts`

Sentry provides:
- Automatic error tracking
- Performance monitoring
- Transaction tracing
- CPU/memory profiling

**Configuration**:
```javascript
// Automatically configured via environment variables
SENTRY_DSN=https://your-dsn@sentry.io/project
```

### Metrics Collection (Prometheus)

**File**: `src/lib/monitoring/metrics.ts`

**Metrics Endpoints**:
- `/api/metrics` - Prometheus-compatible metrics
- `/api/health` - Health check status
- `/api/diag` - Detailed diagnostics (admin only)

**Available Metrics**:
- **HTTP Metrics**: requests, response times, status codes, error rates
- **Database Metrics**: query count, average query time, connections
- **System Metrics**: memory usage, CPU usage, uptime
- **Application Metrics**: images processed, chat messages, active sessions

### Alerting System

**File**: `src/lib/alerts.js`

**Alert Types**:
- **Error Rate**: Warning > 5%, Critical > 10%
- **Response Time**: P95/P99 thresholds
- **Memory Usage**: Warning > 80%, Critical > 90%
- **Database Performance**: Query time thresholds
- **Health Checks**: Service availability

**Alert Rules** (Prometheus format):
```yaml
groups:
- name: slimy_admin_api_alerts
  rules:
  - alert: HighErrorRate
    expr: slimy_admin_api_error_rate_percent > 5
    for: 5m
    labels:
      severity: warning
```

### Structured Logging

**File**: `src/lib/logger.js`

**Features**:
- JSON structured logs for production
- Pretty-printed logs for development
- Request ID correlation
- Contextual information in all logs

**Log Levels**: debug, info, warn, error

## Production Deployment

### 1. Prometheus Configuration

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

scrape_configs:
  - job_name: 'slimy-admin-api'
    static_configs:
      - targets: ['your-api-server:3080']
    metrics_path: '/api/metrics'
    scrape_interval: 15s

alerting:
  alertmanagers:
  - static_configs:
    - targets:
      - alertmanager:9093
```

### 2. Alertmanager Configuration

Create `alertmanager.yml`:

```yaml
global:
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_from: 'alerts@yourdomain.com'
  smtp_auth_username: 'your-email@gmail.com'
  smtp_auth_password: 'your-app-password'

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'email-notifications'

receivers:
- name: 'email-notifications'
  email_configs:
  - to: 'admin@yourdomain.com'
    send_resolved: true
```

### 3. Grafana Configuration

1. Install Grafana
2. Add Prometheus as data source
3. Import dashboard from `monitoring/dashboards/grafana-dashboard.json`
4. Configure alert notifications

### 4. Docker Compose (Production)

```yaml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - ./alert_rules.yml:/etc/prometheus/alert_rules.yml
    ports:
      - "9090:9090"

  alertmanager:
    image: prom/alertmanager:latest
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml
    ports:
      - "9093:9093"

  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=secure-password
    volumes:
      - grafana_data:/var/lib/grafana
    ports:
      - "3000:3000"

volumes:
  grafana_data:
```

## Monitoring Dashboard

The Grafana dashboard includes:

1. **Service Health** - Overall service status
2. **Uptime** - Service uptime in hours
3. **Error Rate** - Current error rate with color-coded thresholds
4. **Active Connections** - Current connection count
5. **Response Time Percentiles** - P50, P95, P99 response times
6. **Request Rate** - Requests per second over time
7. **HTTP Status Codes** - Distribution of response codes
8. **Memory Usage** - Heap memory usage trends
9. **Database Performance** - Connection count and query times
10. **Application Metrics** - Business-specific metrics
11. **Error Trends** - Error rate over time

## Alert Examples

### High Error Rate Alert
```
Alert: High error rate detected
Description: Error rate is 7.5% (threshold: 5%)
Severity: warning
```

### Service Unhealthy Alert
```
Alert: Service health check failed
Description: Service health check failed: unhealthy
Severity: critical
```

## Troubleshooting

### Metrics Not Appearing
1. Verify `/api/metrics` endpoint is accessible
2. Check Prometheus configuration points to correct endpoint
3. Check service logs for metrics collection errors

### Alerts Not Firing
1. Verify alert thresholds in `src/lib/alerts.js`
2. Check alert cooldown periods (5 minutes default)
3. Ensure alert checking is running

### Health Check Failing
1. Check database connectivity
2. Verify external service credentials
3. Check system resources (memory, disk space)

### Sentry Not Working
1. Verify SENTRY_DSN environment variable
2. Check Sentry project configuration
3. Ensure network connectivity to Sentry

## Security Considerations

- Metrics endpoint is public (consider authentication for sensitive environments)
- Health check endpoint provides detailed information (consider rate limiting)
- Alertmanager configuration contains sensitive email credentials
- Change default Grafana admin password in production
- Use HTTPS for all monitoring endpoints in production

## Performance Impact

The monitoring system has minimal performance impact:
- **Metrics**: ~1-2ms per request
- **Logging**: ~0.5ms per log entry
- **Health Checks**: ~50-100ms every 30 seconds
- **Sentry**: Configurable sampling rates (10% in production)

## Maintenance

### Regular Tasks
- Monitor dashboard for trends
- Review Sentry issues weekly
- Update alert thresholds based on baseline performance
- Archive old logs and metrics

### Updates
- Keep Sentry SDK updated
- Update Prometheus and Grafana regularly
- Review and update alert rules annually
- Monitor storage usage for metrics and logs

## Support

For issues with the monitoring setup:
1. Check service logs for errors
2. Verify configuration files
3. Test individual components
4. Review network connectivity
5. Check resource utilization

## File Structure

```
src/lib/monitoring/
├── sentry.ts              # Sentry error tracking
└── metrics.ts             # Prometheus metrics

monitoring/dashboards/
└── grafana-dashboard.json # Grafana dashboard

src/lib/
├── alerts.js              # Alert definitions
├── logger.js              # Structured logging
└── database.js            # Database metrics

# Configuration files
├── prometheus.yml         # Prometheus config
├── alertmanager.yml       # Alertmanager config
└── MONITORING_SETUP_GUIDE.md # This guide
```
