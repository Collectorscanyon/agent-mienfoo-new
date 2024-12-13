import express from 'express';
import type { Request, Response } from 'express';

const app = express();

// Configure body parsing middleware first
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next) => {
  console.log('Request received:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    headers: {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    },
    body: req.body
  });
  next();
});

// Simple webhook endpoint
app.post('/webhook', (req: Request, res: Response) => {
  console.log('Received POST at /webhook');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);

  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).send('No JSON body found');
  }

  // If we got here, the body is parsed correctly
  return res.status(200).send('Webhook received successfully!');
});

// Start server
const port = parseInt(process.env.PORT || '5000', 10);
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});