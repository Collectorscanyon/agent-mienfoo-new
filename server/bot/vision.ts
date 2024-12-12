import vision from '@google-cloud/vision';
import { config } from '../config';

// Initialize the client
const client = new vision.ImageAnnotatorClient({
  keyFilename: config.GOOGLE_VISION_CREDENTIALS
});
console.log('Google Vision client initialized with credentials from:', config.GOOGLE_VISION_CREDENTIALS);

interface ImageAnalysis {
  labels: string[];
  text: string;
  isCollectible: boolean;
}

/**
 * Analyzes an image URL using Google Cloud Vision API
 */
export async function analyzeImage(imageUrl: string): Promise<ImageAnalysis | null> {
  try {
    console.log('Analyzing image:', imageUrl);

    // Analyze the image
    const [result] = await client.annotateImage({
      image: { source: { imageUri: imageUrl } },
      features: [
        { type: 'LABEL_DETECTION' },
        { type: 'TEXT_DETECTION' },
      ],
    });

    // Extract labels
    const labels = result.labelAnnotations?.map(label => label.description?.toLowerCase() || '').filter(Boolean) || [];
    
    // Extract text
    const text = result.textAnnotations?.[0]?.description || '';

    // Check if it's likely a collectible
    const collectibleKeywords = [
      'trading card', 'collectible', 'card game', 'action figure',
      'comic book', 'toy', 'merchandise', 'memorabilia', 'antique',
      'pokemon', 'magic the gathering', 'yugioh'
    ];

    const isCollectible = labels.some(label => 
      collectibleKeywords.some(keyword => label.includes(keyword))
    );

    console.log('Image analysis results:', {
      labels: labels.slice(0, 5), // Log first 5 labels
      hasText: !!text,
      isCollectible
    });

    return {
      labels,
      text,
      isCollectible
    };
  } catch (error) {
    console.error('Error analyzing image:', error);
    return null;
  }
}

/**
 * Generates a response based on image analysis
 */
export function generateImageResponse(analysis: ImageAnalysis): string {
  if (!analysis.isCollectible) {
    return "Hmm, I don't see any collectibles in this image. Would you mind sharing what makes this special? 🤔";
  }

  const collectibleType = analysis.labels.find(label => 
    label.includes('card') || label.includes('figure') || label.includes('comic')
  );

  let response = '';
  if (collectibleType?.includes('card')) {
    response = "Ah, a fellow card collector! 🃏 What a beautiful piece! The condition looks";
  } else if (collectibleType?.includes('figure')) {
    response = "An action figure! 🎭 These bring such joy to collections. The details are";
  } else if (collectibleType?.includes('comic')) {
    response = "A comic treasure! 📚 The preservation looks";
  } else {
    response = "What a fascinating collectible! 🏺 The quality appears";
  }

  // Add condition assessment if text was detected
  if (analysis.text) {
    response += " incredible! I can even make out the text clearly!";
  } else {
    response += " quite good from what I can see!";
  }

  return response;
}
