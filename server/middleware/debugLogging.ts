import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function debugLogging(req: Request, res: Response, next: NextFunction) {
  const requestId = crypto.randomBytes(4).toString('hex');
  
  // Log request details
  console.log('Debug: Incoming request:', {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 'present' : 'missing'
    },
    body: req.method === 'POST' ? JSON.stringify(req.body) : undefined
  });

  // Track response
  const oldSend = res.send;
  res.send = function(data) {
    console.log('Debug: Outgoing response:', {
      requestId,
      timestamp: new Date().toISOString(),
      statusCode: res.statusCode,
      body: data
    });
    return oldSend.apply(res, arguments as any);
  };

  next();
}
