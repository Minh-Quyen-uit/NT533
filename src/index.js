const express = require('express');
const client = require('prom-client');
const path = require('path');
const helmet = require('helmet');

const app = express();
const port = process.env.PORT || 3000;

/* =======================
   VIEW ENGINE
======================= */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

/* =======================
   SECURITY
======================= */
app.use(helmet());
app.disable('x-powered-by');

/* =======================
   PROMETHEUS SETUP
======================= */
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const http_requests_total = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'code']
});

const http_request_duration_seconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 0.3, 0.5, 1, 1.5, 2, 5]
});

const http_errors_total = new client.Counter({
  name: 'http_errors_total',
  help: 'Total HTTP error responses',
  labelNames: ['route', 'code']
});

const app_info = new client.Gauge({
  name: 'app_info',
  help: 'Application information',
  labelNames: ['version', 'env']
});

const active_homepage_requests = new client.Gauge({
  name: 'active_homepage_requests',
  help: 'Concurrent homepage requests'
});

register.registerMetric(http_requests_total);
register.registerMetric(http_request_duration_seconds);
register.registerMetric(http_errors_total);
register.registerMetric(app_info);
register.registerMetric(active_homepage_requests);

app_info.set(
  { version: '1.0.0', env: process.env.NODE_ENV || 'dev' },
  1
);

/* =======================
   METRICS MIDDLEWARE
======================= */
app.use((req, res, next) => {
  // Không đo chính /metrics
  if (req.path === '/metrics') return next();

  const end = http_request_duration_seconds.startTimer();

  res.on('finish', () => {
    const route = req.route ? req.route.path : 'unknown';

    http_requests_total.inc({
      method: req.method,
      route,
      code: res.statusCode
    });

    if (res.statusCode >= 400) {
      http_errors_total.inc({
        route,
        code: res.statusCode
      });
    }

    end({
      method: req.method,
      route,
      code: res.statusCode
    });
  });

  next();
});

/* =======================
   HEALTH CHECKS
======================= */
app.get('/health', (req, res) => res.send('OK'));

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

let ready = true;
app.get('/readyz', (req, res) => {
  ready
    ? res.status(200).json({ status: 'ready' })
    : res.status(503).json({ status: 'not ready' });
});

/* =======================
   METRICS ENDPOINT
======================= */
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

/* =======================
   MAIN ROUTE
======================= */
app.get('/', (req, res) => {
  active_homepage_requests.inc();

  res.render('index', {
    serviceName: 'My Awesome EKS Microservice',
    message: 'Welcome! This service is running and monitored. hello quyền',
    deploymentTime: new Date().toLocaleString()
  });

  res.on('finish', () => {
    active_homepage_requests.dec();
  });
});

/* =======================
   ERROR HANDLER
======================= */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Internal Server Error');
});

/* =======================
   START SERVER
======================= */
app.listen(port, () => {
  console.log(`Service running on port ${port}`);
  console.log(`Metrics available at /metrics`);
});
