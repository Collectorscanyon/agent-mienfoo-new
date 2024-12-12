import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { config } from '../config';
import { analyzeImage, generateImageResponse } from './vision';
import { generateBotResponse } from './openai';

// Initialize Neynar client
const neynar = new NeynarAPIClient({ 
  apiKey: config.NEYNAR_API_KEY
});

interface ProcessedCast {
  hash: string;
  timestamp: number;
}

// Cache for tracking processed messages with timestamps
const processedCasts = new Map<string, ProcessedCast>();
const CACHE_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Periodically clean up old entries
setInterval(() => {
  const now = Date.now();
  for (const [hash, cast] of processedCasts.entries()) {
    if (now - cast.timestamp > CACHE_TIMEOUT) {
      processedCasts.delete(hash);
    }
  }
}, 60 * 1000); // Clean every minute

function isBotAuthor(author: any): boolean {
  return (
    author.fid?.toString() === config.BOT_FID ||
    author.username?.toLowerCase() === config.BOT_USERNAME.toLowerCase() ||
    author.username?.toLowerCase() === 'mienfoo.eth'
  );
}

export async function handleWebhook(event: any) {
  try {
    console.log('Webhook handler started:', {
      eventType: event?.type,
      timestamp: new Date().toISOString()
    });

    if (!event?.type || !event?.data) {
      console.log('Invalid webhook event structure');
      return;
    }

    const { type, data: cast } = event;
    
    // Enhanced logging for webhook event processing
    console.log('Processing webhook event:', {
      type,
      timestamp: new Date().toISOString(),
      castHash: cast?.hash,
      authorUsername: cast?.author?.username,
      authorFid: cast?.author?.fid,
      botFid: config.BOT_FID,
      hasAttachments: cast?.attachments?.length > 0,
      text: cast?.text
    });

    if (type === 'cast.created') {
      // Skip if the message is from the bot itself
      if (isBotAuthor(cast.author)) {
        console.log('Skipping bot\'s own message:', {
          hash: cast.hash,
          author: cast.author.username,
          text: cast.text
        });
        return;
      }

      // Check for duplicate messages using strict deduplication
      const castKey = `${cast.hash}-${cast.timestamp}`;
      if (processedCasts.has(castKey)) {
        console.log('Skipping duplicate message:', {
          hash: cast.hash,
          key: castKey,
          timeSinceFirst: Date.now() - processedCasts.get(castKey)!.timestamp
        });
        return;
      }

      // Add to processed messages with compound key
      processedCasts.set(castKey, {
        hash: cast.hash,
        timestamp: Date.now()
      });

      // Check for mentions of the bot
      const isMentioned = (
        cast.mentions?.some((m: any) => m.fid?.toString() === config.BOT_FID) ||
        cast.text?.toLowerCase().includes(`@${config.BOT_USERNAME.toLowerCase()}`) ||
        cast.text?.toLowerCase().includes('@mienfoo.eth')
      );

      if (isMentioned) {
        console.log('Bot mention detected:', {
          castHash: cast.hash,
          author: cast.author.username,
          text: cast.text
        });
        await handleMention(cast);
      }
    }
  } catch (error) {
    console.error('Error in webhook handler:', error);
  }
}

async function handleMention(cast: any) {
  try {
    console.log('Processing mention:', {
      timestamp: new Date().toISOString(),
      castHash: cast.hash,
      author: cast.author.username,
      text: cast.text
    });

    // Double-check that this isn't a self-message before processing
    if (isBotAuthor(cast.author)) {
      console.log('Caught self-message in handleMention:', {
        hash: cast.hash,
        author: cast.author.username
      });
      return;
    }
    
    // Like the mention first
    try {
      await neynar.publishReaction({
        signerUuid: config.SIGNER_UUID,
        reactionType: 'like',
        target: cast.hash
      });
      console.log('Successfully liked mention:', cast.hash);
    } catch (error) {
      console.error('Error liking mention:', error);
    }

    // Check for images
    let imageUrl = null;
    let response;

    if (cast.attachments?.length > 0) {
      imageUrl = cast.attachments[0].url;
      console.log('Found image in direct attachments:', imageUrl);
    } else if (cast.embeds?.length > 0) {
      const embeddedImage = cast.embeds[0]?.cast?.embeds?.[0];
      if (embeddedImage?.url) {
        imageUrl = embeddedImage.url;
        console.log('Found image in embedded cast:', imageUrl);
      }
    }

    if (imageUrl) {
      try {
        const imageAnalysis = await analyzeImage(imageUrl);
        if (imageAnalysis) {
          response = generateImageResponse(imageAnalysis);
        } else {
          console.log('Image analysis failed, falling back to text response');
          const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
          response = await generateBotResponse(cleanedMessage);
        }
      } catch (error) {
        console.error('Error in image analysis:', error);
        const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
        response = await generateBotResponse(cleanedMessage);
      }
    } else {
      const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
      console.log('Generating response for cleaned message:', cleanedMessage);
      response = await generateBotResponse(cleanedMessage);
    }
    
    console.log('Generated response:', response);

    try {
      await neynar.publishCast({
        signerUuid: config.SIGNER_UUID,
        text: `@${cast.author.username} ${response}`,
        parent: cast.hash,
        channelId: 'collectorscanyon'
      });
      console.log('Successfully sent response to:', cast.author.username);
    } catch (error) {
      console.error('Error publishing response:', error);
    }
  } catch (error) {
    console.error('Error handling mention:', error);
  }
}

export async function engageWithChannelContent() {
  try {
    console.log('Checking collectors canyon channel for content to engage with');
    
    const response = await neynar.searchCasts({
      q: "collectorscanyon",
      channelId: "collectorscanyon",
      limit: 20
    });

    if (!response?.result?.casts) {
      console.log('No casts found in channel');
      return;
    }

    console.log(`Found ${response.result.casts.length} casts in channel`);

    for (const cast of response.result.casts) {
      try {
        // Skip bot's own messages and already processed messages
        if (isBotAuthor(cast.author) || processedCasts.has(cast.hash)) {
          continue;
        }

        // Like collection-related content
        if (isCollectionRelatedContent(cast.text)) {
          console.log('Found collection-related content:', {
            author: cast.author.username,
            text: cast.text.substring(0, 50) + '...',
            castHash: cast.hash
          });

          try {
            await neynar.publishReaction({
              signerUuid: config.SIGNER_UUID,
              reactionType: 'like',
              target: cast.hash
            });
            console.log(`Liked cast ${cast.hash} by ${cast.author.username}`);
            
            // Add to processed casts
            processedCasts.set(cast.hash, {
              hash: cast.hash,
              timestamp: Date.now()
            });
          } catch (error) {
            console.error('Error liking cast:', error);
          }
        }
      } catch (error) {
        console.error('Error processing cast:', {
          castHash: cast.hash,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        continue;
      }
    }
  } catch (error) {
    console.error('Error engaging with channel content:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

function isCollectionRelatedContent(text: string): boolean {
  if (!text) return false;
  
  const keywords = [
    'collect', 'rare', 'vintage', 'limited edition',
    'first edition', 'mint condition', 'graded', 'sealed',
    'cards', 'trading cards', 'figures', 'comics',
    'manga', 'coins', 'stamps', 'antiques', 'toys',
    'memorabilia', 'artwork'
  ];
  
  text = text.toLowerCase();
  return keywords.some(keyword => text.includes(keyword));
}

// Start periodic engagement
setInterval(engageWithChannelContent, 5 * 60 * 1000); // Check every 5 minutes
