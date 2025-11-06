# Monitoring & Observability Setup

This document describes the monitoring and observability features implemented for the Slimy Admin API.

## Features Implemented

### ✅ Application Performance Monitoring (APM)
- **Sentry Integration**: Error tracking and performance monitoring
- **Transaction Tracing**: Automatic request tracing with performance data
- **Profiling**: CPU and memory profiling for performance bottlenecks

### ✅ Enhanced Metrics
- **HTTP Metrics**: Request count, response times, status codes, error rates
- **Database Metrics**: Query count, average query time, connection count
- **System Metrics**: Memory usage, CPU usage, uptime
- **Application Metrics**: Images processed, chat messages, active sessions

### ✅ Health Checks
- **Service Health**: Overall service status with detailed checks
- **Database Health**: Connection status and response time
- **Discord API Health**: External service dependency checks
- **System Health**: Memory and uptime monitoring

### ✅ Structured Logging
- **JSON Format**: Production-ready structured logging
- **Request Tracing**: Request IDs for correlation
- **Contextual Information**: Service metadata in all logs

### ✅ Alerting
- **Automated Alerts**: Configurable thresholds for errors, performance, and health
- **Alert Levels**: Warning and critical severity levels
- **Cooldown Periods**: Prevent alert spam

### ✅ Monitoring Dashboard
- **Grafana Dashboard**: Comprehensive visualization of all metrics
- **Prometheus Metrics**: Standard metrics format for monitoring platforms

## Configuration

### Environment Variables

```bash
# Sentry (APM & Error Tracking)
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Logging
LOG_LEVEL=info  # debug, info, warn, error

# Service Information
ADMIN_API_SERVICE_NAME=slimy-admin-api
ADMIN_API_VERSION=1.0.0
```

### Alert Thresholds

The following alert thresholds are configured (can be modified in `src/lib/alerts.js`):

- **Error Rate**: Warning > 5%, Critical > 10%
- **Response Time P95**: Warning > 2s, Critical > 5s
- **Response Time P99**: Warning > 5s, Critical > 10s
- **Memory Usage**: Warning > 80%, Critical > 90%
- **Database Query Time**: Warning > 100ms, Critical > 500ms

## Endpoints

### Health Check
```
GET /api/health
```
Returns comprehensive health status including:
- Service status
- Database connectivity
- Discord API status
- System resources
- Metrics snapshot

### Metrics (Prometheus Format)
```
GET /api/metrics
```
Returns metrics in Prometheus-compatible format for monitoring systems.

### Diagnostics (Admin Only)
```
GET /api/diag
```
Detailed diagnostics including session information (requires admin role).

## Monitoring Stack Setup

### Option 1: Local Development

1. Start the monitoring stack:
```bash
cd /opt/slimy/web
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

2. Access services:
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093

### Option 2: Production Setup

For production, set up monitoring services separately:

1. **Prometheus**: Configure to scrape `/api/metrics` endpoint
2. **Grafana**: Import the dashboard from `grafana-dashboard.json`
3. **Alertmanager**: Configure alert routing (email, Slack, etc.)

## Dashboard Panels

The Grafana dashboard includes:

1. **Service Health**: Overall service status
2. **Uptime**: Service uptime in hours
3. **Error Rate**: Current error rate with thresholds
4. **Active Connections**: Current connection count
5. **Response Time Percentiles**: P50, P95, P99 response times
6. **Request Rate**: Requests per second over time
7. **HTTP Status Codes**: Distribution of response codes
8. **Memory Usage**: Heap memory usage
9. **Database Performance**: Connections and query times
10. **Application Metrics**: Business-specific metrics
11. **Error Trends**: Error rate over time

## Alert Examples

### High Error Rate Alert
```
Alert: High error rate detected
Description: Error rate is 7.5% (threshold: 5%)
Severity: warning
```

### Slow Response Time Alert
```
Alert: Slow response times detected
Description: P95 response time is 3500ms (threshold: 2000ms)
Severity: warning
```

### Service Unhealthy Alert
```
Alert: Service health check failed
Description: Service health check failed: unhealthy
Severity: critical
```

## Log Format

### Development (Pretty Print)
```
slimy-admin-api INFO [2025-11-06 10:30:15.123] Incoming request method=GET path=/api/health statusCode=200 duration=45
```

### Production (JSON)
```json
{
  "level": "INFO",
  "time": "2025-11-06T10:30:15.123Z",
  "service": "slimy-admin-api",
  "version": "1.0.0",
  "env": "production",
  "hostname": "api-server-01",
  "pid": 12345,
  "requestId": "req-abc123",
  "method": "GET",
  "path": "/api/health",
  "statusCode": 200,
  "duration": 45,
  "msg": "Request completed"
}
```

## Troubleshooting

### Metrics Not Appearing
1. Check that the `/api/metrics` endpoint is accessible
2. Verify Prometheus configuration points to correct endpoint
3. Check service logs for metrics collection errors

### Alerts Not Firing
1. Verify alert thresholds in `src/lib/alerts.js`
2. Check alert cooldown periods (5 minutes default)
3. Ensure alert checking is running (logs should show "Alert monitoring started")

### Health Check Failing
1. Check database connectivity: `docker-compose logs postgres`
2. Verify Discord API credentials
3. Check system resources (memory, disk space)

## Security Considerations

- Metrics endpoint is public (consider authentication for production)
- Health check endpoint provides detailed information (consider rate limiting)
- Alertmanager configuration contains sensitive email credentials
- Grafana admin password should be changed in production

## Future Enhancements

- **Distributed Tracing**: Add trace IDs across service boundaries
- **Custom Business Metrics**: Add domain-specific KPIs
- **Log Aggregation**: Integrate with ELK stack or similar
- **Anomaly Detection**: Machine learning-based alerting
- **Performance Profiling**: Continuous profiling in production
