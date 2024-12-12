import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { handleCommand } from './commands';
import { config } from '../config';
import { generateBotResponse } from './openai';

// Import the shared Neynar client instance
import { neynar } from '../index';

// Memory store for user collections
// Define proper types for Neynar SDK responses
interface Cast {
  hash: string;
  author: {
    username: string;
    fid: string;
  };
  text: string;
}

interface CollectionItem {
  item: string;
  added: string;
}

interface UserCollection {
  [userId: string]: CollectionItem[];
}

const collections: UserCollection = {};

export async function handleMention(cast: Cast) {
  try {
    const username = cast.author.username;
    const content = cast.text.toLowerCase();

    console.log(`Processing mention from @${username}: ${content}`);

    // Skip our own casts to prevent loops
    if (username.toLowerCase() === config.BOT_USERNAME.toLowerCase()) {
      console.log('Skipping own cast to prevent loops');
      return;
    }

    // First, let's log what we received
    console.log('Processing mention details:', {
      username,
      content,
      castHash: cast.hash,
      hasCommands: content.includes('add') || content.includes('show') || content.includes('collection')
    });

    // Like the mention first
    try {
      console.log('Attempting to like cast:', cast.hash);
      await likeCast(cast.hash);
    } catch (likeError) {
      console.error('Error liking cast:', likeError);
      // Continue processing even if like fails
    }

    // Check for commands
    const isCommand = content.includes('add') || 
                     content.includes('show') || 
                     content.includes('collection');
    
    if (isCommand) {
      console.log('Command detected, handling:', content);
      await handleCommand(cast, collections);
      return;
    }

    // Generate AI response
    console.log('Generating AI response');
    const cleanedMessage = content.replace(/@mienfoo/i, '').trim();
    
    // Generate response using OpenAI
    const response = await generateBotResponse(cleanedMessage);
    await reply(cast.hash, `@${username} ${response}`);
  } catch (error) {
    console.error('Error handling mention:', error);
    // Log the full error for debugging
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
  }
}

export async function reply(parentHash: string, text: string) {
  try {
    console.log('Attempting to reply to cast:', { parentHash, text });
    // Add #/collectorscanyon hashtag to all messages
    // Format text with channel tag
    // Format text without hashtag since we're posting directly to channel
    const channelText = `${text}`;
    
    // Publish the cast to the collectors canyon channel
    const response = await neynar.publishCast({
      signerUuid: config.SIGNER_UUID,
      text: channelText,
      parent: parentHash,
      channelId: 'collectorscanyon'
    });
    console.log('Reply sent successfully:', response);
  } catch (error) {
    console.error('Error replying to cast:', error);
    if (error instanceof Error) {
      console.error('Reply error details:', {
        message: error.message,
        stack: error.stack
      });
    }
    throw error; // Re-throw to handle at caller level if needed
  }
}

export async function likeCast(castHash: string) {
  try {
    console.log(`Attempting to like cast: ${castHash}`);
    const response = await neynar.publishReaction({
      signerUuid: config.SIGNER_UUID,
      reactionType: 'like',
      target: castHash
    });
    console.log('Successfully liked cast:', response);
  } catch (error) {
    console.error('Error liking cast:', error);
    if (error instanceof Error) {
      console.error('Like error details:', {
        message: error.message,
        stack: error.stack
      });
    }
    // Don't throw the error, just log it and continue
    // This prevents reactions from blocking the main flow
  }
}

export { collections };
