"""
CHANGE: Added Prometheus metrics for publication request monitoring
WHY: Required by ТЗ 4.1.3 - monitor integration health, errors, and performance
QUOTE(ТЗ): "добавить метрики (успешные/ошибочные запросы, время ответа)"
REF: issue #47
"""
from prometheus_client import Counter, Histogram, Gauge

# Publication request counters
publication_requests_total = Counter(
    'publication_requests_total',
    'Total number of publication requests received from microservice',
    ['status', 'format']
)

publication_requests_success = Counter(
    'publication_requests_success_total',
    'Number of successful publication requests',
    ['format']
)

publication_requests_failed = Counter(
    'publication_requests_failed_total',
    'Number of failed publication requests',
    ['error_type', 'format']
)

publication_requests_no_creative = Counter(
    'publication_requests_no_creative_total',
    'Number of requests where no suitable creative was found',
    ['format']
)

# Response time histogram
publication_request_duration_seconds = Histogram(
    'publication_request_duration_seconds',
    'Time spent processing publication request',
    ['status', 'format'],
    buckets=(0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0)
)

# Creative selection metrics
creative_selection_attempts = Counter(
    'creative_selection_attempts_total',
    'Number of creative selection attempts',
    ['format', 'result']
)

creative_selection_duration_seconds = Histogram(
    'creative_selection_duration_seconds',
    'Time spent selecting creative',
    ['format'],
    buckets=(0.01, 0.05, 0.1, 0.5, 1.0)
)

# Bot publication metrics
bot_publication_attempts = Counter(
    'bot_publication_attempts_total',
    'Number of attempts to send publication to bot',
    ['status']
)

bot_publication_duration_seconds = Histogram(
    'bot_publication_duration_seconds',
    'Time spent sending publication to bot',
    buckets=(0.1, 0.5, 1.0, 2.0, 5.0, 10.0)
)

# Authentication metrics
authentication_attempts = Counter(
    'microservice_auth_attempts_total',
    'Number of authentication attempts',
    ['result']  # success, invalid_key, missing_header
)

# Gauge for tracking active requests
active_publication_requests = Gauge(
    'active_publication_requests',
    'Number of publication requests currently being processed'
)

# Channel metrics
channels_with_errors = Gauge(
    'channels_with_publication_errors',
    'Number of channels that encountered publication errors recently'
)

# Webhook outgoing metrics (from issue #45)
webhook_sent_total = Counter(
    'webhook_sent_total',
    'Total number of webhook notifications sent to parser microservice',
    ['event_type', 'status']
)

webhook_duration_seconds = Histogram(
    'webhook_duration_seconds',
    'Time spent sending webhook to parser microservice',
    ['event_type'],
    buckets=(0.1, 0.5, 1.0, 2.0, 5.0)
)

webhook_retry_total = Counter(
    'webhook_retry_total',
    'Number of webhook retry attempts',
    ['event_type', 'attempt']
)
