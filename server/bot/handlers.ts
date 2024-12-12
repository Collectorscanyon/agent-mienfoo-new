import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { config } from '../config';
import { analyzeImage, generateImageResponse } from './vision';
import { generateBotResponse } from './openai';

// Initialize Neynar client
const neynar = new NeynarAPIClient({ 
  apiKey: config.NEYNAR_API_KEY
});

// Track processed threads and responses
const processedThreads = new Map<string, {
  lastResponseTime: number;
  responses: Set<string>;
}>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [threadHash, data] of processedThreads.entries()) {
    if (data.lastResponseTime < tenMinutesAgo) {
      processedThreads.delete(threadHash);
    }
  }
}, 5 * 60 * 1000);

function isBotMessage(cast: any): boolean {
  if (!cast?.author) return false;
  
  return (
    cast.author.fid?.toString() === config.BOT_FID ||
    cast.author.username?.toLowerCase() === config.BOT_USERNAME.toLowerCase() ||
    cast.author.username?.toLowerCase() === 'mienfoo.eth'
  );
}

function shouldProcessThread(cast: any): boolean {
  const threadHash = cast.thread_hash;
  const currentTime = Date.now();
  
  // If we haven't seen this thread before
  if (!processedThreads.has(threadHash)) {
    processedThreads.set(threadHash, {
      lastResponseTime: currentTime,
      responses: new Set([cast.hash])
    });
    return true;
  }

  const threadData = processedThreads.get(threadHash)!;
  
  // If we've already processed this exact cast
  if (threadData.responses.has(cast.hash)) {
    console.log(`Skipping already processed cast ${cast.hash} in thread ${threadHash}`);
    return false;
  }

  // If the last response was too recent (within 30 seconds)
  if (currentTime - threadData.lastResponseTime < 30 * 1000) {
    console.log(`Skipping response in thread ${threadHash} - too recent`);
    return false;
  }

  // Update thread data and allow processing
  threadData.responses.add(cast.hash);
  threadData.lastResponseTime = currentTime;
  return true;
}

export async function handleWebhook(event: any) {
  try {
    // Log webhook details for debugging
    console.log('Webhook request received:', {
      timestamp: new Date().toISOString(),
      headers: event.headers,
      body: event.body,
      path: event.path
    });

    if (!event.body?.type || !event.body?.data) {
      console.log('Invalid webhook event structure');
      return;
    }

    const { type, data: cast } = event.body;
    
    // Early exit for non-cast events
    if (type !== 'cast.created') {
      console.log('Skipping non-cast event:', type);
      return;
    }

    // Early exit for bot's own messages
    if (isBotMessage(cast)) {
      console.log('Skipping bot\'s own message:', {
        hash: cast.hash,
        author: cast.author?.username,
        text: cast.text
      });
      return;
    }

    // Enhanced duplicate and thread management
    if (!shouldProcessThread(cast)) {
      console.log('Thread management prevented processing:', {
        hash: cast.hash,
        thread: cast.thread_hash,
        timestamp: new Date().toISOString()
      });
      return;
    }

    console.log('Processing new message in thread:', {
      hash: cast.hash,
      thread: cast.thread_hash,
      parent: cast.parent_hash,
      timestamp: new Date().toISOString()
    });

    console.log('Processing new cast:', {
      hash: cast.hash,
      key: castKey,
      author: cast.author?.username,
      text: cast.text,
      timestamp: new Date().toISOString()
    });

    // Check for bot mentions
    const isMentioned = (
      cast.mentioned_profiles?.some((m: any) => m.fid?.toString() === config.BOT_FID) ||
      cast.text?.toLowerCase().includes(`@${config.BOT_USERNAME.toLowerCase()}`) ||
      cast.text?.toLowerCase().includes('@mienfoo.eth')
    );

    if (isMentioned) {
      console.log('Processing mention:', {
        hash: cast.hash,
        author: cast.author.username,
        text: cast.text
      });
      await handleMention(cast);
    }

  } catch (error) {
    console.error('Error in webhook handler:', error);
  }
}

async function handleMention(cast: any) {
  try {
    // Like the mention
    console.log('Attempting to like cast:', cast.hash);
    try {
      const reaction = await neynar.publishReaction({
        signerUuid: config.SIGNER_UUID,
        reactionType: 'like',
        target: cast.hash
      });
      console.log('Successfully liked the mention:', reaction);
    } catch (error) {
      console.error('Error liking mention:', error);
    }

    // Generate response
    console.log('Generating response for:', cast.text);
    const response = await generateTextResponse(cast.text);
    console.log('Generated response:', response);

    // Send response
    console.log('Attempting to reply to cast:', {
      hash: cast.hash,
      signerUuid: config.SIGNER_UUID,
      author: cast.author.username
    });

    try {
      const reply = await neynar.publishCast({
        signerUuid: config.SIGNER_UUID,
        text: `@${cast.author.username} ${response}`,
        parent: cast.hash,
        channelId: 'collectorscanyon'
      });
      console.log('Reply sent successfully:', {
        replyHash: reply.cast.hash,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error publishing response:', error);
    }

  } catch (error) {
    console.error('Error handling mention:', error);
  }
}

async function generateTextResponse(text: string): Promise<string> {
  const cleanedMessage = text.replace(/@[\w.]+/g, '').trim();
  console.log('Generating response for cleaned message:', cleanedMessage);
  return await generateBotResponse(cleanedMessage);
}

const processedCastHashes = new Set<string>(); // Reintroduced from original code

export async function engageWithChannelContent() {
  try {
    const response = await neynar.searchCasts({
      q: "collectorscanyon",
      channelId: "collectorscanyon",
      limit: 20
    });

    if (!response?.result?.casts) {
      return;
    }

    for (const cast of response.result.casts) {
      // Skip bot's own messages and processed casts
      if (isBotMessage(cast) || processedCastHashes.has(cast.hash)) {
        continue;
      }

      if (isCollectionRelatedContent(cast.text)) {
        try {
          await neynar.publishReaction({
            signerUuid: config.SIGNER_UUID,
            reactionType: 'like',
            target: cast.hash
          });
          processedCastHashes.add(cast.hash);
        } catch (error) {
          console.error('Error liking cast:', error);
        }
      }
    }
  } catch (error) {
    console.error('Error engaging with channel content:', error);
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
setInterval(engageWithChannelContent, 5 * 60 * 1000);