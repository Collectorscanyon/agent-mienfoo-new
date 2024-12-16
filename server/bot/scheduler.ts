import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { config } from '../config';

const neynar = new NeynarAPIClient({ apiKey: config.NEYNAR_API_KEY });

// Set cast interval and cooldown
const CAST_INTERVAL = 8 * 60 * 60 * 1000; // 8 hours
const CAST_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours
let lastCastTime = 0;

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
    const now = Date.now();
    if (now - lastCastTime < CAST_COOLDOWN) {
      console.log('Skipping cast due to cooldown period');
      return;
    }

    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    
    console.log('Creating daily cast:', randomMessage);
    await neynar.publishCast({
      signerUuid: config.SIGNER_UUID,
      text: randomMessage,
      channelId: 'collectorscanyon'
    });
    
    lastCastTime = now;
    console.log('Daily cast created successfully at:', new Date(now).toISOString());
  } catch (error) {
    console.error('Error creating daily cast:', error);
  }
}

export function initializeScheduler() {
  console.log('Initializing scheduler with interval:', CAST_INTERVAL);
  setInterval(createDailyCast, CAST_INTERVAL);
  console.log('Scheduler initialized - ready to create periodic casts');
}
