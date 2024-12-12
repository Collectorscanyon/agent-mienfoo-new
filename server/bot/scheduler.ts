import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { config } from '../config';

// Import the shared Neynar client instance
import { neynar } from '../index';

// Set 8-hour interval for casts to avoid rate limiting
const CAST_INTERVAL = 8 * 60 * 60 * 1000;

const messages = [
  "👋 What's your favorite item in your collection? Share with me! 🤔",
  "✨ Any exciting additions to your collection today? Let me know! 🎉",
  "🎯 Love seeing rare finds! What's your most unique collectible? ✨",
  "🌟 Who else is passionate about collecting? Let's chat! 🌟",
  "📚 What started your collecting journey? I'd love to hear your story! 📚",
  "🎁 Show off your latest addition! What's new in your collection? 🎯",
  "🏆 Collectors unite! What's your specialty? 🏆"
];

export async function createDailyCast() {
  try {
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    
    console.log('Creating daily cast:', randomMessage);
    await neynar.publishCast({
      signerUuid: config.SIGNER_UUID,
      text: `${randomMessage}\n\n/collectorscanyon`,
      channelId: 'collectorscanyon'
    });
    
    console.log('Daily cast created successfully');
  } catch (error) {
    console.error('Error creating daily cast:', error);
  }
}

// Schedule daily casts
export function initializeScheduler() {
  // Post every 8 hours to maintain active presence while avoiding rate limits
  setInterval(createDailyCast, CAST_INTERVAL);
  
  // Post initial cast on startup with a small delay
  setTimeout(createDailyCast, 5000);
  
  console.log('Scheduler initialized - ready to create periodic casts');
}
