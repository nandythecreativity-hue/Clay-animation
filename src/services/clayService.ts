import { GoogleGenAI } from "@google/genai";

export const CLAY_THEMES = [
  "Clay City", "Clay Village", "Clay Forest", "Clay Beach", "Clay Mountain",
  "Clay Space", "Clay Cafe", "Clay Classroom", "Clay Fantasy World", "Clay Cyberpunk",
  "Clay Studio", "Clay Market", "Clay Desert", "Clay Snow Land", "Clay Playground",
  "Clay Underwater", "Clay Volcano", "Clay Library", "Clay Garden", "Clay Castle",
  "Clay Farm", "Clay Airport", "Clay Train Station", "Clay Museum", "Clay Cinema",
  "Clay Gym", "Clay Hospital", "Clay Office", "Clay Rooftop", "Clay Jungle",
  "Clay Savanna", "Clay Arctic", "Clay Mars", "Clay Moon", "Clay Candy Land",
  "Clay Toy Shop", "Clay Workshop", "Clay Kitchen", "Clay Bedroom", "Clay Living Room",
  "Clay Attic", "Clay Basement", "Clay Backyard", "Clay Park", "Clay Carnival",
  "Clay Circus", "Clay Stadium", "Clay Concert", "Clay Temple", "Clay Pyramid"
];

export type Quality = "1080p" | "2K" | "4K";
export type AspectRatio = "1:1" | "4:3" | "3:4" | "16:9" | "9:16";

export interface StoryboardScene {
  id: string;
  image?: string;
  prompt: string;
  animationPrompt?: string;
  description: string;
  dialog?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  error?: string;
  quality?: Quality;
  aspectRatio?: AspectRatio;
}

export interface Storyboard {
  title: string;
  scenes: StoryboardScene[];
}

export interface GenerationState {
  originalImage: string | null;
  generatedImage: string | null;
  isProcessing: boolean;
  error: string | null;
  theme: string;
  quality: Quality;
  aspectRatio: AspectRatio;
}

async function withRetry<T>(fn: (attempt: number) => Promise<T>, maxRetries = 8, initialDelay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn(i);
    } catch (err: any) {
      lastError = err;
      
      const errStr = typeof err === 'string' ? err : JSON.stringify(err);
      const is429 = errStr.includes('429') || err?.status === 429 || errStr.includes('RESOURCE_EXHAUSTED');
      const is503 = errStr.includes('503') || errStr.includes('UNAVAILABLE') || err?.status === 503;
      const isDeadline = errStr.includes('Deadline') || errStr.includes('expired');
      
      if (is429 || is503 || isDeadline || errStr.includes('Internal error')) {
        // Try to extract retry delay from the error message if provided by Gemini
        let delay = (initialDelay * Math.pow(2, i)) + (Math.random() * 500);
        
        // Look for "retry in X.Xs" or similar in the error string
        const retryMatch = errStr.match(/retry in ([\d.]+)s/i);
        if (retryMatch && retryMatch[1]) {
          const serverSuggestedDelay = parseFloat(retryMatch[1]) * 1000;
          delay = Math.max(delay, serverSuggestedDelay + 500);
        }

        console.warn(`Attempt ${i + 1} failed. Retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function generateClayAnimation(
  base64Image: string,
  theme: string,
  quality: Quality,
  aspectRatio: AspectRatio,
  revisionPrompt?: string
): Promise<string> {
  return withRetry(async (attempt) => {
    const ai = getAiClient();
    
    // Extract mime type and data
    const mimeType = base64Image.split(';')[0].split(':')[1];
    const imageData = base64Image.split(',')[1];

    let prompt = `Transform EVERY element of this photo into a high-quality cute cartoon clay animation style, similar to a stop-motion movie character. 
    The character MUST be completely reimagined as a 3D clay figure:
    - Skin should have a smooth, matte clay texture with subtle thumbprint details.
    - Hair should look like sculpted clay chunks or coils.
    - Eyes should be expressive, rounded, and look like polished clay or plastic beads.
    - Clothes should have thick, simplified clay folds and textures.
    The entire background and all objects must be fully regenerated into a ${theme} environment made entirely of colorful, whimsical cartoon clay. 
    ABSOLUTELY NO realistic human skin or hair textures should remain. The final result must look like a physical handcrafted clay model in a studio setting with soft shadows and vibrant colors. 
    Maintain the original pose and composition exactly.`;

    if (revisionPrompt) {
      prompt = `Refine this cartoon clay result: ${revisionPrompt}. 
      Maintain the cute cartoon clay style:
      - Smooth matte clay skin with thumbprints.
      - Sculpted clay hair and expressive clay eyes.
      - Thick, simplified clay clothes.
      - Everything must look like a handcrafted 3D clay model.
      Original theme was ${theme}.`;
    }

    // Fallback to gemini-2.5-flash-image if gemini-3.1-flash-image-preview is consistently failing
    const model = attempt > 3 ? 'gemini-2.5-flash-image' : 'gemini-3.1-flash-image-preview';

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              data: imageData,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: quality === "4K" ? "4K" : quality === "2K" ? "2K" : "1K"
        }
      }
    });

    let generatedBase64 = "";
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        generatedBase64 = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!generatedBase64) {
      throw new Error("Failed to generate cartoon clay image.");
    }

    return generatedBase64;
  });
}

function getAiClient() {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5
  ].filter(Boolean);
  
  if (keys.length === 0) {
    throw new Error("No Gemini API key found in environment variables.");
  }
  
  // Rotate keys randomly to balance load
  const selectedKey = keys[Math.floor(Math.random() * keys.length)];
  return new GoogleGenAI({ apiKey: selectedKey });
}

export async function generateStoryboardPrompts(
  characterImage: string,
  title: string,
  sceneCount: number
): Promise<{ description: string; visualPrompt: string; dialog: string; animationPrompt: string }[]> {
  return withRetry(async (attempt) => {
    const ai = getAiClient();
    
    const mimeType = characterImage.split(';')[0].split(':')[1];
    const imageData = characterImage.split(',')[1];

    const storyPrompt = `Create a connected ${sceneCount}-scene storyboard for a cute cartoon clay animation titled "${title}". 
    The main character is shown in the provided image. 
    Decide on a creative clay-style setting based on the title.
    For each scene, provide:
    1. A short description of the action.
    2. A specific visual prompt for an image generator to create that scene while keeping the character consistent.
    3. A short, charming dialog line for the character(s) in this scene.
    4. An "animationPrompt" for a video generator (like Luma, Runway, or Kling) to animate this specific scene. It should describe the movement, camera angle, and clay-style physics (squash and stretch).
    Return the result as a JSON array of objects with "description", "visualPrompt", "dialog", and "animationPrompt" fields. 
    Example: [{"description": "Character walking", "visualPrompt": "Character walking in a clay forest", "dialog": "I wonder what's behind those clay trees!", "animationPrompt": "The clay character walks forward with a bouncy, stop-motion feel, camera follows from a low angle, clay trees sway slightly."}]`;

    const textResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: imageData,
              mimeType: mimeType
            }
          },
          {
            text: storyPrompt
          }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(textResponse.text);
  });
}

export async function generateSceneImage(
  characterImage: string,
  title: string,
  visualPrompt: string,
  sceneIndex: number,
  aspectRatio: AspectRatio,
  quality: Quality = "1080p"
): Promise<string> {
  return withRetry(async (attempt) => {
    const ai = getAiClient();
    
    const mimeType = characterImage.split(';')[0].split(':')[1];
    const imageData = characterImage.split(',')[1];

    // Fallback to gemini-2.5-flash-image if gemini-3.1-flash-image-preview is consistently failing
    const model = attempt > 3 ? 'gemini-2.5-flash-image' : 'gemini-3.1-flash-image-preview';

    const imageResponse = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              data: imageData,
              mimeType: mimeType
            }
          },
          {
            text: `Create scene ${sceneIndex + 1} of the storyboard "${title}" in cartoon clay style. 
            Visual Prompt: ${visualPrompt}. 
            Keep the character from the reference image consistent. 
            The style must be 3D handcrafted clay animation.`
          }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: quality === "4K" ? "4K" : quality === "2K" ? "2K" : "1K"
        }
      }
    });

    let sceneBase64 = "";
    for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        sceneBase64 = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!sceneBase64) throw new Error("Failed to generate scene image");
    return sceneBase64;
  });
}
