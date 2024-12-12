import OpenAI from 'openai';

// Initialize OpenAI with environment variables
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function generateBotResponse(message: string): Promise<string> {
    console.log('Attempt 1/3 to generate response for:', message);
    console.log('Cleaned message:', message);

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a wise and knowledgeable collector bot named Mienfoo. Your purpose is to share insights about collectibles, trading cards, NFTs, and other collecting hobbies. Be concise but informative, and always maintain a friendly, mentor-like tone."
                },
                {
                    role: "user",
                    content: message
                }
            ],
            temperature: 0.7,
            max_tokens: 150
        });

        const response = completion.choices[0]?.message?.content?.trim() || "I apologize, but I need to gather my thoughts on that. Could you rephrase your question?";
        console.log('Generated response:', response);
        return response;
    } catch (error) {
        console.error('Error generating response:', error);
        return "I apologize, but I'm having trouble processing that request right now. Could you try again in a moment?";
    }
}
