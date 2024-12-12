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
  
  // Strict bot identity check
  const isBotAuthor = (
    cast.author.fid?.toString() === config.BOT_FID ||
    cast.author.username?.toLowerCase() === config.BOT_USERNAME.toLowerCase() ||
    cast.author.username?.toLowerCase() === 'mienfoo.eth'
  );

  // Check if this is a response in a thread started by the bot
  const isInBotThread = cast.thread_hash && processedThreads.has(cast.thread_hash);
  
  // Add enhanced logging
  console.log('Bot message detection:', {
    timestamp: new Date().toISOString(),
    castHash: cast.hash,
    authorFid: cast.author.fid,
    authorUsername: cast.author.username,
    threadHash: cast.thread_hash,
    isBotAuthor,
    isInBotThread,
    botFid: config.BOT_FID,
    botUsername: config.BOT_USERNAME
  });

  // Consider it a bot message if either condition is true
  return isBotAuthor || isInBotThread;
}

function shouldProcessThread(cast: any): boolean {
  if (!cast?.thread_hash) return false;
  
  const threadHash = cast.thread_hash;
  const currentTime = Date.now();
  const castKey = `${cast.hash}-${threadHash}`;
  
  // Enhanced logging for thread processing decision
  console.log('Thread processing check:', {
    timestamp: new Date().toISOString(),
    castKey,
    threadHash,
    author: cast.author?.username,
    isReply: !!cast.parent_hash,
    hasThread: processedThreads.has(threadHash)
  });

  // If we haven't seen this thread before
  if (!processedThreads.has(threadHash)) {
    processedThreads.set(threadHash, {
      lastResponseTime: currentTime,
      responses: new Set([cast.hash]),
      initialAuthor: cast.author?.username,
      parentHash: cast.parent_hash
    });
    console.log('New thread initialized:', { castKey, threadHash });
    return true;
  }

  const threadData = processedThreads.get(threadHash)!;
  
  // Strict duplicate check
  if (threadData.responses.has(cast.hash)) {
    console.log('Duplicate cast detected:', { castKey, threadHash });
    return false;
  }

  // Cooldown period check (2 minutes)
  if (currentTime - threadData.lastResponseTime < 120 * 1000) {
    console.log('Thread cooldown active:', {
      castKey,
      threadHash,
      timeRemaining: `${Math.round((120 * 1000 - (currentTime - threadData.lastResponseTime)) / 1000)}s`
    });
    return false;
  }

  // Update thread data
  threadData.responses.add(cast.hash);
  threadData.lastResponseTime = currentTime;
  console.log('Thread processing approved:', { castKey, threadHash });
  return true;
}

export async function handleWebhook(event: any) {
  try {
    const timestamp = new Date().toISOString();
    
    // Enhanced webhook logging with full context
    console.log('Webhook event received:', {
      timestamp,
      eventType: event.body?.type,
      castHash: event.body?.data?.hash,
      threadHash: event.body?.data?.thread_hash,
      parentHash: event.body?.data?.parent_hash,
      author: event.body?.data?.author?.username,
      text: event.body?.data?.text,
      isReply: !!event.body?.data?.parent_hash,
      channelContext: event.body?.data?.author_channel_context
    });

    if (!event.body?.type || !event.body?.data) {
      console.log('Invalid webhook event structure');
      return;
    }

    const { type, data: cast } = event.body;
    
    // Early validation and filtering
    if (type !== 'cast.created') {
      console.log('Skipping non-cast event:', type);
      return;
    }

    // Create a unique key for this cast
    const castKey = `${cast.hash}-${cast.thread_hash}`;
    
    // Check if we've already processed this cast
    if (processedThreads.has(cast.thread_hash) && processedThreads.get(cast.thread_hash)?.responses.has(cast.hash)) {
      console.log('Skipping already processed cast:', {
        timestamp,
        castKey,
        reason: 'Already processed'
      });
      return;
    }

    // Enhanced bot message and self-mention detection
    if (isBotMessage(cast)) {
      console.log('Skipping bot-related message:', {
        timestamp,
        castKey,
        author: cast.author?.username,
        text: cast.text,
        reason: 'Bot message or in bot thread'
      });
      return;
    }

    // Check if this is a message chain started by the bot
    const isPartOfBotThread = cast.parent_hash && await isBotMessageInChain(cast.parent_hash);
    if (isPartOfBotThread) {
      console.log('Skipping message in bot-initiated thread:', {
        timestamp,
        hash: cast.hash,
        threadHash: cast.thread_hash,
        parentHash: cast.parent_hash,
        reason: 'Part of bot conversation'
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

// Helper function to check if a message is part of a bot-initiated thread
async function isBotMessageInChain(castHash: string, depth: number = 0): Promise<boolean> {
  if (depth > 5) return false; // Limit recursion depth
  
  try {
    const cast = await neynar.getCast(castHash);
    if (!cast) return false;
    
    if (isBotMessage(cast)) return true;
    
    if (cast.parent_hash) {
      return await isBotMessageInChain(cast.parent_hash, depth + 1);
    }
    
    return false;
  } catch (error) {
    console.error('Error checking message chain:', error);
    return false;
  }
}

async function handleMention(cast: any) {
  try {
    const timestamp = new Date().toISOString();
    
    // Enhanced mention logging
    console.log('Processing mention:', {
      timestamp,
      hash: cast.hash,
      threadHash: cast.thread_hash,
      author: cast.author.username,
      text: cast.text
    });

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

// Removed automatic channel engagement functionality to prevent duplicate responses
// and focus solely on webhook-driven interactions

// export async function engageWithChannelContent() {
//   // Functionality removed to prevent duplicate responses
// }

// function isCollectionRelatedContent(text: string): boolean {
//   // Helper function removed as part of channel engagement cleanup
//   return false;
// }

// Disabled periodic channel engagement to prevent duplicate responses
// setInterval(engageWithChannelContent, 5 * 60 * 1000);