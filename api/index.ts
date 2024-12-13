import type { VercelRequest, VercelResponse } from '@vercel/node';
import { config } from './config';

// Simple root endpoint handler for Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const memory = process.memoryUsage();
  
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
    memory: {
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
    },
    config: {
      hasNeynarKey: !!config.NEYNAR_API_KEY,
      hasOpenAIKey: !!config.OPENAI_API_KEY,
      hasWebhookSecret: !!config.WEBHOOK_SECRET,
      botConfig: {
        username: config.BOT_USERNAME,
        fid: config.BOT_FID
      }
    }
  });
}

// Enhanced production security headers and monitoring
if (process.env.NODE_ENV === 'production') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
    
    // Request monitoring
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log('Request completed:', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
    });
    
    next();
  });

  // Request timeout middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setTimeout(30000, () => {
      console.error('Request timeout:', {
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString()
      });
      res.status(408).json({ error: 'Request timeout' });
    });
    next();
  });
}

// Rate limiting for production
if (process.env.NODE_ENV === 'production') {
  const rateLimit = require('express-rate-limit');
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests from this IP, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/webhook', limiter);
}

// Verify required environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'NEYNAR_API_KEY',
  'BOT_USERNAME',
  'BOT_FID',
  'WEBHOOK_SECRET',
  'SIGNER_UUID'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// Configure middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enhanced request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log('Incoming request:', {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 
        `${(req.headers['x-neynar-signature'] as string).substring(0, 10)}...` : 'missing',
      'user-agent': req.headers['user-agent']
    },
    body: req.method === 'POST' ? 
      JSON.stringify(req.body).substring(0, 200) + '...' : 
      'not a POST request'
  });

  // Add requestId to response headers for tracking
  res.setHeader('X-Request-ID', requestId);
  next();
});

// Enhanced health check endpoint for production monitoring
app.get('/', (_req: Request, res: Response) => {
  const startTime = process.uptime();
  const memory = process.memoryUsage();
  
  res.json({ 
    status: 'ok', 
    message: 'Bot API is running',
    uptime: `${Math.floor(startTime / 60)} minutes`,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    memory: {
      heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
    },
    config: {
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasBotConfig: !!process.env.BOT_USERNAME && !!process.env.BOT_FID,
      hasWebhookSecret: !!process.env.WEBHOOK_SECRET
    }
  });
});

// Production CORS configuration
if (process.env.NODE_ENV === 'production') {
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://*.vercel.app'],
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-neynar-signature'],
    maxAge: 86400
  }));
}

// Register webhook route with enhanced logging
console.log('Registering webhook route...');

// Handle webhook at /api/webhook only
app.use('/api/webhook', webhookRouter);
console.log('Webhook route registered at /api/webhook', {
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'development'
});

// Add explicit POST handler for detailed logging
app.post('/api/webhook', (req: Request, res: Response, next: NextFunction) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log('Webhook POST request received:', {
    requestId,
    timestamp: new Date().toISOString(),
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 
        `${(req.headers['x-neynar-signature'] as string).substring(0, 10)}...` : 'missing',
      'user-agent': req.headers['user-agent']
    },
    body: req.body ? {
      type: req.body.type,
      data: req.body.data ? {
        hash: req.body.data.hash,
        text: req.body.data.text,
        author: req.body.data.author ? {
          username: req.body.data.author.username,
          fid: req.body.data.author.fid
        } : null
      } : null
    } : 'empty',
    rawBody: process.env.NODE_ENV === 'development' ? 
      JSON.stringify(req.body, null, 2) : undefined
  });
  next();
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', {
    timestamp: new Date().toISOString(),
    error: err instanceof Error ? {
      name: err.name,
      message: err.message,
      stack: err.stack
    } : err,
    path: req.path,
    method: req.method
  });
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Vercel serverless handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  return new Promise((resolve, reject) => {
    const expressReq = Object.assign(req, {
      get: (header: string) => req.headers[header],
      header: (header: string) => req.headers[header],
      accepts: () => true,
    });

    const expressRes = Object.assign(res, {
      status: (statusCode: number) => {
        res.status(statusCode);
        return expressRes;
      },
      json: (body: any) => {
        res.json(body);
        return expressRes;
      },
      send: (body: any) => {
        res.send(body);
        return expressRes;
      }
    });

    app(expressReq as any, expressRes as any, (err?: any) => {
      if (err) {
        console.error('Express error:', err);
        reject(err);
      } else {
        resolve(undefined);
      }
    });
  });
}

// Start local server if not in Vercel environment
if (process.env.VERCEL !== '1') {
  const port = parseInt(process.env.PORT || '5000', 10);
  app.listen(port, '0.0.0.0', () => {
    const timestamp = new Date().toISOString();
    console.log('Server started successfully:', {
      timestamp,
      port,
      environment: process.env.NODE_ENV,
      config: {
        username: process.env.BOT_USERNAME,
        fid: process.env.BOT_FID,
        hasNeynarKey: !!process.env.NEYNAR_API_KEY,
        hasSignerUuid: !!process.env.SIGNER_UUID,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasWebhookSecret: !!process.env.WEBHOOK_SECRET
      }
    });
  });
}