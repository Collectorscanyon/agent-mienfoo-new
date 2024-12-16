import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { generateBotResponse } from './openai';
import { config } from '../config';

// Initialize Neynar client
if (!process.env.NEYNAR_API_KEY) {
  throw new Error('Missing NEYNAR_API_KEY');
}

const neynar = new NeynarAPIClient({ 
  apiKey: process.env.NEYNAR_API_KEY 
});

// Track processed casts to prevent duplicates
const processedCasts = new Set<string>();

// Clean up old casts every 5 minutes
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  processedCasts.clear();
}, 5 * 60 * 1000);

export async function handleWebhook(req: any) {
  const requestId = Math.random().toString(36).substring(7);
  const timestamp = new Date().toISOString();
  
  try {
    console.log('Starting webhook processing:', {
      requestId,
      timestamp,
      type: req.body?.type,
      eventData: {
        hash: req.body?.data?.hash,
        text: req.body?.data?.text?.substring(0, 100),
        author: req.body?.data?.author?.username
      }
    });

    // 1. Environment variable check
    try {
      const requiredConfig = {
        BOT_USERNAME: process.env.BOT_USERNAME,
        BOT_FID: process.env.BOT_FID,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        NEYNAR_API_KEY: process.env.NEYNAR_API_KEY,
        SIGNER_UUID: process.env.SIGNER_UUID
      };

      const missingVars = Object.entries(requiredConfig)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

      if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
      }
    } catch (error) {
      console.error('Configuration error:', {
        requestId,
        timestamp,
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    // 2. Cast data validation
    let cast;
    try {
      cast = req.body?.data;
      if (!cast?.hash || !cast?.text || !cast?.author?.username) {
        throw new Error('Invalid webhook data structure');
      }
    } catch (error) {
      console.error('Invalid webhook data:', {
        requestId,
        timestamp,
        validation: {
          hasHash: !!cast?.hash,
          hasText: !!cast?.text,
          hasAuthor: !!cast?.author?.username
        },
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    // 3. Duplicate check
    try {
      if (processedCasts.has(cast.hash)) {
        console.log('Skipping duplicate cast:', {
          requestId,
          timestamp,
          hash: cast.hash
        });
        return;
      }
    } catch (error) {
      console.error('Error checking duplicates:', {
        requestId,
        timestamp,
        hash: cast.hash,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // 4. Mention detection
    let isBotMentioned = false;
    try {
      const botUsername = process.env.BOT_USERNAME?.toLowerCase() || '';
      const botFid = process.env.BOT_FID || '';

      const mentions = {
        defaultUsername: cast.text.toLowerCase().includes(`@${botUsername}`),
        mienfooEth: cast.text.toLowerCase().includes('@mienfoo.eth'),
        mentionedProfiles: cast.mentioned_profiles?.some(
          (profile: any) => profile.fid?.toString() === botFid
        )
      };

      isBotMentioned = mentions.defaultUsername || mentions.mienfooEth || mentions.mentionedProfiles;

      console.log('Mention detection results:', {
        requestId,
        timestamp,
        hash: cast.hash,
        mentions,
        isBotMentioned
      });

      if (!isBotMentioned) {
        console.log('No bot mention detected:', {
          requestId,
          hash: cast.hash,
          text: cast.text
        });
        return;
      }
    } catch (error) {
      console.error('Error detecting mentions:', {
        requestId,
        timestamp,
        hash: cast.hash,
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    // Mark cast as processed
    processedCasts.add(cast.hash);

    // 5. Process mention and generate response
    try {
      const signerUuid = process.env.SIGNER_UUID;
      if (!signerUuid) {
        throw new Error('Missing SIGNER_UUID');
      }

      // Like the cast
      try {
        console.log('Attempting to like cast:', {
          requestId,
          hash: cast.hash
        });

        const reaction = await neynar.publishReaction({
          signerUuid,
          reactionType: 'like',
          target: cast.hash
        });

        console.log('Successfully liked cast:', {
          requestId,
          hash: cast.hash,
          reactionHash: reaction?.hash
        });
      } catch (error) {
        console.error('Error liking cast:', {
          requestId,
          hash: cast.hash,
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue with response generation even if like fails
      }

      // Generate and send response
      try {
        const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
        console.log('Generating bot response:', {
          requestId,
          hash: cast.hash,
          cleanedMessage
        });

        const response = await generateBotResponse(cleanedMessage);
        console.log('Generated response:', {
          requestId,
          hash: cast.hash,
          response
        });

        const replyText = `@${cast.author.username} ${response} /collectorscanyon`;
        console.log('Publishing reply:', {
          requestId,
          hash: cast.hash,
          replyText
        });

        const reply = await neynar.publishCast({
          signerUuid,
          text: replyText,
          parent: cast.hash,
          channelId: 'collectorscanyon'
        });

        console.log('Successfully published reply:', {
          requestId,
          originalHash: cast.hash,
          replyHash: reply.cast?.hash
        });
      } catch (error) {
        console.error('Error generating or publishing response:', {
          requestId,
          hash: cast.hash,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } catch (error) {
      console.error('Error processing mention:', {
        requestId,
        timestamp,
        hash: cast.hash,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  } catch (error) {
    console.error('Fatal webhook handler error:', {
      requestId,
      timestamp,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });
  }
}
