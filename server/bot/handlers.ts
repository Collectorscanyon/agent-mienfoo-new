import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { handleCommand } from './commands';
import { config } from '../config';

// Initialize Neynar client with v2 configuration
const neynarConfig = new Configuration({
  apiKey: config.NEYNAR_API_KEY,
});

const neynar = new NeynarAPIClient(neynarConfig);

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
    if (username === BOT_USERNAME) {
      console.log('Skipping own cast to prevent loops');
      return;
    }

    // Like the mention first thing
    console.log('Liking the mention cast');
    await likeCast(cast.hash);

    // Process commands if present
    const isCommand = content.includes('add') || 
                     content.includes('show') || 
                     content.includes('collection');
    
    if (isCommand) {
      console.log('Handling command in mention');
      await handleCommand(cast, collections);
      return;
    }

    // Default friendly responses
    if (content.includes('hello') || content.includes('hi')) {
      console.log('Responding to greeting');
      await reply(cast.hash, 
        `Hey @${username}! 👋 I'm Mienfoo, your friendly collector companion! Tell me about your collection!`
      );
    } else {
      console.log('Sending default response');
      await reply(cast.hash,
        `@${username} Thanks for the mention! I love chatting about collections. Try:
• "add [item]" to track items
• "show collection" to see your items
What's your favorite piece? 🌟`
      );
    }
  } catch (error) {
    console.error('Error handling mention:', error);
    console.error(error);
  }
}

export async function reply(parentHash: string, text: string) {
  try {
    await neynar.publishCast({
      signerUuid: config.SIGNER_UUID,
      text,
      parent: parentHash
    });
  } catch (error) {
    console.error('Error replying to cast:', error);
  }
}

export async function likeCast(castHash: string) {
  try {
    console.log(`Attempting to like cast: ${castHash}`);
    await neynar.reactToCast({
      signerUuid: SIGNER_UUID,
      reaction_type: 'like',
      cast_hash: castHash
    });
    console.log('Successfully liked cast');
  } catch (error) {
    console.error('Error liking cast:', error);
    console.error(error);
  }
}

export { collections };
