  const express = require('express');
  const client = require('prom-client');
  const path = require('path');

  const app = express();
  const port = process.env.PORT || 3000;

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views')); 

  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const http_requests_total = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests for the root path.',
    labelNames: ['method', 'route', 'code']
  });
  register.registerMetric(http_requests_total);

  app.get('/health', (req, res) => {
    res.send('OK');
  });

  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (ex) {
      res.status(500).end(ex);
    }
  });

  app.get('/', (req, res) => {
    http_requests_total.inc({ method: req.method, route: '/', code: 200 });

    res.render('index', { 
      serviceName: 'My Awesome EKS Microservice',
      message: 'Welcome! This service is running and monitored.',
      deploymentTime: new Date().toLocaleString()
    });
  });

  app.listen(port, () => {
    console.log(`myservice listening on port ${port}. Metrics available at /metrics`);
  });