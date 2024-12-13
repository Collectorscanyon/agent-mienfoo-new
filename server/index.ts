import express, { Request, Response } from 'express';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req: Request, res: Response, next) => {
  console.log('Request received:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body
  });
  next();
});

app.post('/webhook', (req: Request, res: Response) => {
  console.log('Webhook endpoint hit with body:', req.body);

  // Check if the payload includes a type field
  const { type, data } = req.body;
  if (!type) {
    console.log('No "type" field found in the request body.');
    return res.status(400).send('Missing event type in request body');
  }

  switch (type) {
    case 'cast.created':
      // For now, just log that we received a cast.created event
      console.log('Received a cast.created event:', data);
      break;

    default:
      console.log('Received an unknown event type:', type);
      break;
  }

  return res.status(200).send('Webhook event processed successfully!');
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});