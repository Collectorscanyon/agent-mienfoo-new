import OpenAI from 'openai';
import { config } from '../config';

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY
});

const BASE_PROMPT = `You are Mienfoo, a friendly and knowledgeable collector bot for CollectorsCanyon.
Your expertise is in collectibles, particularly:
- Trading cards (Pokemon, Magic, Sports)
- Comics and manga
- Action figures and toys
- Video games and retro gaming

Keep responses concise (max 280 chars) and engaging.
Use relevant emojis occasionally.
Your responses will be posted in the CollectorsCanyon channel

Current personality traits:
- Enthusiastic about collections
- Helpful and informative
- Casual but knowledgeable
- Community-focused`;

export async function generateBotResponse(userMessage: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: BASE_PROMPT },
        { role: "user", content: userMessage }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    return completion.choices[0].message.content || "Sorry, I'm having trouble thinking right now! 😅";
  } catch (error) {
    console.error('OpenAI Error:', error);
    return "Oops! My collector brain is a bit foggy. Try again in a bit! 🌫️";
  }
}
