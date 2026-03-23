/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  Wand2, 
  Download, 
  RefreshCw, 
  Video,
  Image as ImageIcon, 
  ChevronRight, 
  Check,
  Copy,
  MessageSquare,
  AlertCircle,
  Sparkles,
  Layers,
  Monitor,
  ArrowRightLeft,
  Square,
  RectangleHorizontal,
  RectangleVertical,
  Maximize2,
  BookOpen,
  Film,
  Plus,
  Minus,
  ExternalLink,
  Layout,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  CLAY_THEMES, 
  generateClayAnimation, 
  generateStoryboardPrompts,
  generateSceneImage,
  type Quality, 
  type AspectRatio,
  type Storyboard,
  type StoryboardScene
} from './services/clayService';

// Add global type for AI Studio
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState(CLAY_THEMES[0]);
  const [selectedQuality, setSelectedQuality] = useState<Quality>("2K");
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>("1:1");
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isComparing, setIsComparing] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  
  // Storyboard State
  const [activeMode, setActiveMode] = useState<"single" | "storyboard">("single");
  const [storyTitle, setStoryTitle] = useState("My Clay Adventure");
  const [sceneCount, setSceneCount] = useState(3);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [currentGeneratingScene, setCurrentGeneratingScene] = useState<number | null>(null);
  const [downloadingScenes, setDownloadingScenes] = useState<Set<string>>(new Set());

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setOriginalImage(reader.result as string);
        setGeneratedImage(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles: File[]) => onDrop(acceptedFiles),
    accept: {
      'image/jpeg': [],
      'image/png': []
    },
    multiple: false
  } as any);

  const checkApiKey = async () => {
    try {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        setShowKeyDialog(true);
        return false;
      }
      return true;
    } catch (e) {
      // Fallback if not in AI Studio environment
      return true;
    }
  };

  const handleOpenKeyDialog = async () => {
    await window.aistudio.openSelectKey();
    setShowKeyDialog(false);
    handleGenerate();
  };

  const formatErrorMessage = (err: string) => {
    if (err.includes("429") || err.includes("RESOURCE_EXHAUSTED") || err.includes("quota")) {
      return "The AI system is currently very busy or you've reached the free tier limit. Tip: You can add up to 5 API keys in the AI Studio Settings to balance the load.";
    }
    if (err.includes("503") || err.includes("UNAVAILABLE")) {
      return "The AI service is temporarily unavailable. Retrying automatically...";
    }
    return err;
  };

  const handleGenerate = async (isRevision = false) => {
    if (!originalImage) {
      setError("Please upload a photo first!");
      return;
    }
    
    const hasKey = await checkApiKey();
    if (!hasKey) return;

    setIsProcessing(true);
    if (activeMode === "storyboard") setIsGeneratingStoryboard(true);
    setError(null);
    
    try {
      if (activeMode === "single") {
        const result = await generateClayAnimation(
          originalImage, 
          selectedTheme, 
          selectedQuality,
          selectedAspectRatio,
          isRevision ? revisionPrompt : undefined
        );
        setGeneratedImage(result);
      } else {
        setStoryboard(null);
        setCurrentGeneratingScene(0);
        
        const characterImg = generatedImage || originalImage;
        const prompts = await generateStoryboardPrompts(
          characterImg,
          storyTitle,
          sceneCount
        );

        // Initialize empty storyboard with pending scenes
        const initialScenes: StoryboardScene[] = prompts.map((p, i) => ({
          id: `scene-${i + 1}`,
          prompt: p.visualPrompt,
          animationPrompt: p.animationPrompt,
          description: p.description,
          dialog: p.dialog,
          status: 'pending'
        }));

        setStoryboard({ title: storyTitle, scenes: initialScenes });

        // Helper to process a single scene
        const processScene = async (i: number) => {
          // Update status to generating
          setStoryboard(prev => {
            if (!prev) return prev;
            const updated = [...prev.scenes];
            updated[i] = { ...updated[i], status: 'generating' };
            return { ...prev, scenes: updated };
          });

          try {
            const sceneImage = await generateSceneImage(
              characterImg,
              storyTitle,
              prompts[i].visualPrompt,
              i,
              selectedAspectRatio,
              selectedQuality
            );

            setStoryboard(prev => {
              if (!prev) return prev;
              const updated = [...prev.scenes];
              updated[i] = { 
                ...updated[i], 
                image: sceneImage, 
                status: 'completed',
                quality: selectedQuality,
                aspectRatio: selectedAspectRatio
              };
              return { ...prev, scenes: updated };
            });
          } catch (sceneErr) {
            console.error(`Error generating scene ${i + 1}:`, sceneErr);
            setStoryboard(prev => {
              if (!prev) return prev;
              const updated = [...prev.scenes];
              updated[i] = { 
                ...updated[i], 
                status: 'failed',
                error: sceneErr instanceof Error ? sceneErr.message : "Generation failed"
              };
              return { ...prev, scenes: updated };
            });
          }
        };

        // Generate scenes in batches to avoid rate limits
        const BATCH_SIZE = 3; // Increased from 2
        for (let i = 0; i < initialScenes.length; i += BATCH_SIZE) {
          const batch = initialScenes.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map((_, idx) => processScene(i + idx)));
          
          // Small delay between batches to let API breathe
          if (i + BATCH_SIZE < initialScenes.length) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 1000
          }
        }

        setCurrentGeneratingScene(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      if (err instanceof Error && err.message.includes("Requested entity was not found")) {
        setShowKeyDialog(true);
      }
    } finally {
      setIsProcessing(false);
      setIsGeneratingStoryboard(false);
    }
  };

  const handleRetryScene = async (sceneId: string) => {
    if (isProcessing || !storyboard) return;
    
    const hasKey = await checkApiKey();
    if (!hasKey) return;

    const sceneIndex = storyboard.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex === -1) return;

    const scene = storyboard.scenes[sceneIndex];

    setIsProcessing(true);
    setCurrentGeneratingScene(sceneIndex + 1);
    
    // Update status to generating
    setStoryboard(prev => {
      if (!prev) return prev;
      const updated = [...prev.scenes];
      updated[sceneIndex] = { ...updated[sceneIndex], status: 'generating', error: undefined };
      return { ...prev, scenes: updated };
    });

    try {
      const characterImg = generatedImage || originalImage;
      const sceneImage = await generateSceneImage(
        characterImg!,
        storyTitle,
        scene.prompt,
        sceneIndex,
        selectedAspectRatio,
        selectedQuality
      );

      setStoryboard(prev => {
        if (!prev) return prev;
        const updated = [...prev.scenes];
        updated[sceneIndex] = { 
          ...updated[sceneIndex], 
          image: sceneImage, 
          status: 'completed',
          quality: selectedQuality,
          aspectRatio: selectedAspectRatio
        };
        return { ...prev, scenes: updated };
      });
    } catch (err) {
      console.error(`Retry failed for scene ${sceneIndex + 1}:`, err);
      setStoryboard(prev => {
        if (!prev) return prev;
        const updated = [...prev.scenes];
        updated[sceneIndex] = { 
          ...updated[sceneIndex], 
          status: 'failed',
          error: err instanceof Error ? err.message : "Retry failed"
        };
        return { ...prev, scenes: updated };
      });
    } finally {
      setIsProcessing(false);
      setCurrentGeneratingScene(null);
    }
  };

  const handleRetryAllFailed = async () => {
    if (isProcessing || !storyboard) return;
    
    const failedScenes = storyboard.scenes.filter(s => s.status === 'failed');
    if (failedScenes.length === 0) return;

    const hasKey = await checkApiKey();
    if (!hasKey) return;

    setIsProcessing(true);
    
    try {
      // Process failed scenes in batches
      const BATCH_SIZE = 2;
      for (let i = 0; i < failedScenes.length; i += BATCH_SIZE) {
        const batch = failedScenes.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (scene) => {
          const sceneIndex = storyboard.scenes.findIndex(s => s.id === scene.id);
          
          // Update status to generating
          setStoryboard(prev => {
            if (!prev) return prev;
            const updated = [...prev.scenes];
            updated[sceneIndex] = { ...updated[sceneIndex], status: 'generating', error: undefined };
            return { ...prev, scenes: updated };
          });

          try {
            const characterImg = generatedImage || originalImage;
            const sceneImage = await generateSceneImage(
              characterImg!,
              storyTitle,
              scene.prompt,
              sceneIndex,
              selectedAspectRatio,
              selectedQuality
            );

            setStoryboard(prev => {
              if (!prev) return prev;
              const updated = [...prev.scenes];
              updated[sceneIndex] = { 
                ...updated[sceneIndex], 
                image: sceneImage, 
                status: 'completed',
                quality: selectedQuality,
                aspectRatio: selectedAspectRatio
              };
              return { ...prev, scenes: updated };
            });
          } catch (sceneErr) {
            console.error(`Error retrying scene ${sceneIndex + 1}:`, sceneErr);
            setStoryboard(prev => {
              if (!prev) return prev;
              const updated = [...prev.scenes];
              updated[sceneIndex] = { 
                ...updated[sceneIndex], 
                status: 'failed',
                error: sceneErr instanceof Error ? sceneErr.message : "Retry failed"
              };
              return { ...prev, scenes: updated };
            });
          }
        }));

        if (i + BATCH_SIZE < failedScenes.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async (quality: Quality) => {
    if (!generatedImage) return;

    // If the requested quality matches what we already have, download instantly
    if (quality === selectedQuality) {
      const link = document.createElement('a');
      link.href = generatedImage;
      link.download = `clay-cartoon-${selectedTheme.toLowerCase().replace(/\s+/g, '-')}-${quality}.png`;
      link.click();
      return;
    }

    // Otherwise, we need to generate the higher quality version
    const hasKey = await checkApiKey();
    if (!hasKey) return;

    setIsProcessing(true);
    try {
      const highResImage = await generateClayAnimation(
        originalImage!,
        selectedTheme,
        quality,
        selectedAspectRatio,
        revisionPrompt || undefined
      );

      const link = document.createElement('a');
      link.href = highResImage;
      link.download = `clay-cartoon-${selectedTheme.toLowerCase().replace(/\s+/g, '-')}-${quality}.png`;
      link.click();
    } catch (err) {
      console.error("Failed to generate high-res image:", err);
      setError("Failed to generate high-resolution image. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadScene = async (sceneIdx: number, quality: Quality) => {
    if (!storyboard) return;
    
    const scene = storyboard.scenes[sceneIdx];
    if (!scene || scene.status !== 'completed') return;

    // If the requested quality matches what we already have, download instantly
    if (quality === scene.quality) {
      const link = document.createElement('a');
      link.href = scene.image!;
      link.download = `storyboard-scene-${sceneIdx + 1}-${quality}.png`;
      link.click();
      return;
    }

    if (downloadingScenes.has(scene.id)) return;

    const hasKey = await checkApiKey();
    if (!hasKey) return;

    setDownloadingScenes(prev => new Set(prev).add(scene.id));
    
    try {
      const characterImg = generatedImage || originalImage;
      const highResImage = await generateSceneImage(
        characterImg!,
        storyTitle,
        scene.prompt,
        sceneIdx,
        selectedAspectRatio,
        quality
      );

      const link = document.createElement('a');
      link.href = highResImage;
      link.download = `storyboard-scene-${sceneIdx + 1}-${quality}-${Date.now()}.png`;
      link.click();
    } catch (err) {
      console.error(`Download failed for scene ${sceneIdx + 1}:`, err);
      setError(`Failed to generate high-resolution image for download. Please try again.`);
    } finally {
      setDownloadingScenes(prev => {
        const next = new Set(prev);
        next.delete(scene.id);
        return next;
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getAspectClass = (ratio: AspectRatio) => {
    switch (ratio) {
      case "1:1": return "aspect-square";
      case "16:9": return "aspect-video";
      case "4:3": return "aspect-[4/3]";
      case "3:4": return "aspect-[3/4]";
      case "9:16": return "aspect-[9/16]";
      default: return "aspect-video";
    }
  };

  return (
    <div className="min-h-screen pb-20">
      {/* API Key Dialog */}
      <AnimatePresence>
        {showKeyDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-clay-sand/30 rounded-full flex items-center justify-center mx-auto text-clay-accent mb-6">
                <Sparkles size={40} />
              </div>
              <h3 className="text-2xl font-black text-clay-text mb-4">High Accuracy Mode</h3>
              <p className="text-slate-500 mb-8 leading-relaxed">
                To get the most accurate cartoon clay characters, we use our premium AI model. 
                Please select your API key to continue.
                <br />
                <a 
                  href="https://ai.google.dev/gemini-api/docs/billing" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-clay-accent underline font-bold"
                >
                  Learn about billing
                </a>
              </p>
              <button 
                onClick={handleOpenKeyDialog}
                className="w-full clay-button-primary py-4 text-lg"
              >
                Select API Key
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Header */}
      <header className="pt-12 pb-8 px-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-clay-accent/10 text-clay-accent font-bold mb-4 border border-clay-accent/20 shadow-[0_0_15px_rgba(217,119,87,0.2)]"
        >
          <Sparkles size={18} />
          <span>AI-Powered Magic</span>
        </motion.div>
        <motion.h1 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-5xl md:text-6xl font-black tracking-tight text-clay-text mb-4 drop-shadow-[0_2px_10px_rgba(217,119,87,0.3)]"
        >
          Clay Animation <span className="text-clay-accent">Generator</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-slate-500 text-lg max-w-2xl mx-auto font-medium"
        >
          Transform your photos into adorable clay characters with a magical glow!
        </motion.p>
      </header>

      <main className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Controls */}
        <div className="lg:col-span-4 space-y-6">
          {/* Mode Switcher */}
          <div className="flex p-1 bg-clay-sky/10 rounded-2xl border border-clay-sky/20">
            <button
              onClick={() => setActiveMode("single")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all",
                activeMode === "single" ? "bg-white text-clay-accent shadow-md" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <ImageIcon size={18} />
              Single Character
            </button>
            <button
              onClick={() => setActiveMode("storyboard")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all",
                activeMode === "storyboard" ? "bg-white text-clay-accent shadow-md" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <BookOpen size={18} />
              Storyboard
            </button>
          </div>

          {/* Storyboard Settings */}
          {activeMode === "storyboard" && (
            <motion.section 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="clay-card p-6 space-y-4"
            >
              <h2 className="text-lg font-bold flex items-center gap-2 text-clay-accent">
                <Layout size={20} />
                Storyboard Settings
              </h2>
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Story Title</label>
                <input 
                  type="text"
                  value={storyTitle}
                  onChange={(e) => setStoryTitle(e.target.value)}
                  className="w-full bg-clay-sky/5 border border-clay-sky/20 rounded-xl px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-clay-accent/20"
                  placeholder="Enter story title..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Number of Scenes ({sceneCount})</label>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setSceneCount(Math.max(1, sceneCount - 1))}
                    className="p-2 bg-clay-sky/10 rounded-lg hover:bg-clay-sky/20 text-slate-600"
                  >
                    <Minus size={16} />
                  </button>
                  <input 
                    type="range"
                    min="1"
                    max="20"
                    value={sceneCount}
                    onChange={(e) => setSceneCount(parseInt(e.target.value))}
                    className="flex-1 accent-clay-accent"
                  />
                  <button 
                    onClick={() => setSceneCount(Math.min(20, sceneCount + 1))}
                    className="p-2 bg-clay-sky/10 rounded-lg hover:bg-clay-sky/20 text-slate-600"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </motion.section>
          )}

          {/* Upload Section */}
          <section className="clay-card p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-clay-accent">
              <Upload size={20} />
              Upload Photo
            </h2>
            <div 
              {...getRootProps()} 
              className={cn(
                "border-2 border-dashed rounded-[1.5rem] p-8 transition-all duration-300 cursor-pointer text-center",
                isDragActive ? "border-clay-accent bg-clay-accent/5" : "border-clay-sky/30 hover:border-clay-accent/50 hover:bg-clay-sand/10",
                originalImage ? "py-4" : "py-12"
              )}
            >
              <input {...getInputProps()} />
              {originalImage ? (
                <div className="relative group">
                  <img 
                    src={originalImage} 
                    alt="Preview" 
                    className="w-full h-48 object-cover rounded-2xl shadow-md"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-clay-accent/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center backdrop-blur-[2px]">
                    <p className="text-white text-sm font-bold">Change Photo</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-14 h-14 bg-clay-sand/30 rounded-full flex items-center justify-center mx-auto text-clay-accent shadow-[0_0_15px_rgba(217,119,87,0.2)]">
                    <ImageIcon size={28} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-700">Drag & drop or click</p>
                    <p className="text-xs text-slate-400 mt-1">Supports JPG, PNG (Max 10MB)</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Theme Selector */}
          {activeMode === "single" && (
            <section className="clay-card p-6">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-clay-accent">
                <Layers size={20} />
                Background Theme
              </h2>
              <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {CLAY_THEMES.map((theme) => (
                  <button
                    key={theme}
                    onClick={() => setSelectedTheme(theme)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-sm font-bold transition-all text-left",
                      selectedTheme === theme 
                        ? "bg-clay-accent text-white shadow-[0_4px_10px_rgba(217,119,87,0.3)]" 
                        : "bg-clay-sand/10 text-slate-600 hover:bg-clay-sand/20"
                    )}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Aspect Ratio Selector */}
          <section className="clay-card p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-clay-accent">
              <Maximize2 size={20} />
              Aspect Ratio
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "1:1", label: "1:1", icon: <Square size={14} /> },
                { id: "4:3", label: "4:3", icon: <RectangleHorizontal size={14} /> },
                { id: "3:4", label: "3:4", icon: <RectangleVertical size={14} /> },
                { id: "16:9", label: "16:9", icon: <RectangleHorizontal size={14} /> },
                { id: "9:16", label: "9:16", icon: <RectangleVertical size={14} /> },
              ].map((ratio) => (
                <button
                  key={ratio.id}
                  onClick={() => setSelectedAspectRatio(ratio.id as AspectRatio)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold transition-all",
                    selectedAspectRatio === ratio.id
                      ? "bg-clay-accent text-white shadow-[0_4px_10px_rgba(217,119,87,0.3)]"
                      : "bg-clay-sky/10 text-slate-600 hover:bg-clay-sky/20"
                  )}
                >
                  {ratio.icon}
                  {ratio.label}
                </button>
              ))}
            </div>
          </section>

          {/* Quality Selector */}
          <section className="clay-card p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-clay-accent">
              <Monitor size={20} />
              Output Quality
            </h2>
            <div className="flex gap-2">
              {(["1080p", "2K", "4K"] as Quality[]).map((q) => (
                <button
                  key={q}
                  onClick={() => setSelectedQuality(q)}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-sm font-bold transition-all",
                    selectedQuality === q
                      ? "bg-clay-accent text-white shadow-[0_4px_10px_rgba(217,119,87,0.3)]"
                      : "bg-clay-sky/10 text-slate-600 hover:bg-clay-sky/20"
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
          </section>

          {/* Generate Button */}
          <button
            onClick={() => handleGenerate()}
            disabled={isProcessing}
            className="w-full clay-button-primary py-4 text-lg flex items-center justify-center gap-3"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="animate-spin" size={20} />
                {activeMode === "single" 
                  ? "Processing..." 
                  : currentGeneratingScene === 0 
                    ? "Planning Story..." 
                    : `Creating Scene ${currentGeneratingScene}/${sceneCount}...`}
              </>
            ) : (
              <>
                {activeMode === "single" ? <Sparkles size={20} /> : <Film size={20} />}
                {activeMode === "single" ? "Generate Clay Animation" : "Generate Storyboard"}
              </>
            )}
          </button>

          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 rounded-2xl bg-red-50 text-red-600 text-sm flex items-start gap-3 border border-red-100"
            >
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <p>{formatErrorMessage(error)}</p>
            </motion.div>
          )}
        </div>

        {/* Right Column: Output & Comparison */}
        <div className="lg:col-span-8 space-y-6">
          {activeMode === "single" ? (
            /* Single Image Display */
            <div className="space-y-6">
              <section className="clay-card min-h-[500px] flex flex-col">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setIsComparing(false)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-sm font-bold transition-all",
                        !isComparing ? "bg-white shadow-sm text-clay-accent" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      Cartoon Result
                    </button>
                    <button 
                      onClick={() => setIsComparing(true)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-sm font-bold transition-all",
                        isComparing ? "bg-white shadow-sm text-clay-accent" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      Comparison
                    </button>
                  </div>
                  {generatedImage && (
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                      <Check size={14} />
                      Cartoon Magic Ready
                    </div>
                  )}
                </div>

                <div className="flex-1 relative bg-clay-sand/5 overflow-hidden flex items-center justify-center p-8">
                  {!originalImage && !generatedImage && (
                    <div className="text-center space-y-4 max-w-sm">
                      <div className="w-24 h-24 bg-white rounded-[2rem] shadow-[0_8px_20px_rgba(217,119,87,0.1)] flex items-center justify-center mx-auto text-clay-sand">
                        <ImageIcon size={48} />
                      </div>
                      <p className="text-slate-400 font-bold">Upload a photo to see the cartoon magic happen here</p>
                    </div>
                  )}

                  {originalImage && !generatedImage && !isProcessing && (
                    <div className={cn(
                      "relative group max-w-2xl w-full rounded-2xl overflow-hidden shadow-xl border-4 border-white",
                      getAspectClass(selectedAspectRatio)
                    )}>
                      <img 
                        src={originalImage} 
                        alt="Original" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold">
                        Original Preview
                      </div>
                    </div>
                  )}

                  {isProcessing && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/60 backdrop-blur-md">
                      <div className="relative">
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          className="w-28 h-28 rounded-full border-4 border-clay-accent/10 border-t-clay-accent shadow-[0_0_20px_rgba(217,119,87,0.2)]"
                        />
                        <motion.div 
                          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="absolute inset-0 flex items-center justify-center text-clay-accent"
                        >
                          <Sparkles size={40} />
                        </motion.div>
                      </div>
                      <p className="mt-8 text-clay-accent font-black tracking-widest uppercase text-xs animate-pulse">Sculpting Cartoon Magic...</p>
                    </div>
                  )}

                  {generatedImage && !isComparing && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={cn(
                        "relative group max-w-2xl w-full rounded-[2rem] overflow-hidden shadow-[0_20px_50px_rgba(217,119,87,0.3)] border-4 border-white",
                        getAspectClass(selectedAspectRatio)
                      )}
                    >
                      <img 
                        src={generatedImage} 
                        alt="Generated Cartoon Clay" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-4 right-4 bg-clay-accent text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg">
                        Cartoon Magic
                      </div>
                    </motion.div>
                  )}

                  {generatedImage && isComparing && (
                    <div className={cn(
                      "relative w-full max-w-2xl rounded-[2rem] overflow-hidden shadow-[0_20px_50px_rgba(217,119,87,0.3)] border-4 border-white select-none",
                      getAspectClass(selectedAspectRatio)
                    )}>
                      <img 
                        src={originalImage!} 
                        alt="Before" 
                        className="absolute inset-0 w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div 
                        className="absolute inset-0 w-full h-full overflow-hidden"
                        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                      >
                        <img 
                          src={generatedImage} 
                          alt="After" 
                          className="absolute inset-0 w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div 
                        className="absolute inset-y-0 z-20 group cursor-ew-resize"
                        style={{ left: `${sliderPosition}%` }}
                      >
                        <div className="absolute inset-y-0 -left-px w-1 bg-white shadow-lg" />
                        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-12 h-12 bg-white rounded-full shadow-xl flex items-center justify-center border-2 border-clay-accent text-clay-accent transition-transform group-hover:scale-110">
                          <ArrowRightLeft size={24} />
                        </div>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={sliderPosition} 
                        onChange={(e) => setSliderPosition(Number(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30"
                      />
                      <div className="absolute bottom-4 left-4 z-10 bg-black/40 backdrop-blur-md text-white px-4 py-1.5 rounded-full text-xs font-bold">
                        Original
                      </div>
                      <div className="absolute bottom-4 right-4 z-10 bg-clay-accent/90 backdrop-blur-md text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg">
                        Cartoon Magic
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-left">
                    <p className="text-sm font-bold text-slate-700">Export Cartoon Magic</p>
                    <p className="text-xs text-slate-400">Download your cartoon clay character in high quality</p>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => handleDownload("2K")}
                      disabled={!generatedImage || isProcessing}
                      className="clay-button-secondary py-2 px-4 text-sm flex items-center gap-2"
                    >
                      {isProcessing ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                      Download 2K
                    </button>
                    <button 
                      onClick={() => handleDownload("4K")}
                      disabled={!generatedImage || isProcessing}
                      className="clay-button-primary py-2 px-4 text-sm flex items-center gap-2"
                    >
                      {isProcessing ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                      Download 4K
                    </button>
                  </div>
                </div>
              </section>

              <section className="clay-card p-6">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-clay-accent">
                  <RefreshCw size={20} />
                  Refine Your Magic
                </h2>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative">
                    <input 
                      type="text" 
                      value={revisionPrompt}
                      onChange={(e) => setRevisionPrompt(e.target.value)}
                      placeholder="Describe what you want to change (e.g., more glow, change background...)"
                      className="w-full bg-clay-sky/5 border border-clay-sky/20 rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-clay-accent/20 focus:border-clay-accent/50 transition-all"
                    />
                  </div>
                  <button 
                    onClick={() => handleGenerate(true)}
                    disabled={!generatedImage || !revisionPrompt || isProcessing}
                    className="clay-button-primary whitespace-nowrap flex items-center justify-center gap-2"
                  >
                    <Wand2 size={18} />
                    Apply Revision
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-400 italic">
                  AI updates ONLY selected parts while keeping original composition unless specified.
                </p>
              </section>
            </div>
          ) : (
            /* Storyboard Display */
            <div className="space-y-6">
              <section className="clay-card p-6 bg-clay-sky/5 border-clay-sky/20">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-black text-clay-text">{storyboard?.title || storyTitle}</h2>
                    <p className="text-slate-500 text-sm">Connected Clay Animation Storyboard</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {storyboard && storyboard.scenes.some(s => s.status === 'failed') && (
                      <button 
                        onClick={handleRetryAllFailed}
                        disabled={isProcessing}
                        className="flex items-center gap-2 text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-full border border-red-200 transition-all disabled:opacity-50"
                      >
                        <RefreshCw size={14} className={isProcessing ? "animate-spin" : ""} />
                        Retry Failed Scenes
                      </button>
                    )}
                    {storyboard && (
                      <div className="flex items-center gap-2 text-xs font-bold text-clay-accent bg-white px-4 py-2 rounded-full border border-clay-accent/20 shadow-sm">
                        <Film size={16} />
                        {storyboard.scenes.filter(s => s.status === 'completed').length} / {storyboard.scenes.length} Scenes Ready
                      </div>
                    )}
                  </div>
                </div>

                {!storyboard && !isProcessing && (
                  <div className="py-20 text-center space-y-4">
                    <div className="w-20 h-20 bg-clay-sand/10 rounded-full flex items-center justify-center mx-auto text-clay-accent">
                      <BookOpen size={40} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-clay-text">Create Your Story</h3>
                      <p className="text-slate-400 text-sm mt-2">Set your title and scene count, then click generate to create a connected story!</p>
                    </div>
                  </div>
                )}

                {isGeneratingStoryboard && (
                  <div className="py-20 text-center space-y-6">
                    <div className="relative w-32 h-32 mx-auto">
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 border-4 border-clay-accent/20 border-t-clay-accent rounded-full"
                      />
                      <div className="absolute inset-0 flex items-center justify-center text-clay-accent">
                        <Film size={40} className="animate-pulse" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-clay-text">
                        {currentGeneratingScene === 0 ? "Directing Your Story..." : `Sculpting Scene ${currentGeneratingScene}...`}
                      </h3>
                      <p className="text-slate-400 text-sm mt-2">
                        {currentGeneratingScene === 0 
                          ? "AI is planning your connected scenes." 
                          : `Hand-crafting scene ${currentGeneratingScene} of ${sceneCount}.`}
                      </p>
                    </div>
                  </div>
                )}

                {storyboard && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {storyboard.scenes.map((scene, idx) => (
                      <motion.div 
                        key={scene.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className={cn(
                          "bg-white rounded-3xl p-4 shadow-lg border flex flex-col transition-all",
                          scene.status === 'failed' ? "border-red-200 bg-red-50/30" : "border-slate-100"
                        )}
                      >
                        <div className={cn(
                          "relative rounded-2xl overflow-hidden mb-4 border-4 border-slate-50 bg-slate-100 flex items-center justify-center",
                          getAspectClass(scene.aspectRatio || selectedAspectRatio)
                        )}>
                          {scene.status === 'completed' && scene.image ? (
                            <img 
                              src={scene.image} 
                              alt={`Scene ${idx + 1}`} 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : scene.status === 'generating' ? (
                            <div className="flex flex-col items-center gap-3 text-clay-accent">
                              <RefreshCw className="animate-spin" size={32} />
                              <p className="text-[10px] font-black uppercase tracking-widest">Sculpting...</p>
                            </div>
                          ) : scene.status === 'failed' ? (
                            <div className="flex flex-col items-center gap-3 text-red-400">
                              <AlertCircle size={32} />
                              <p className="text-[10px] font-black uppercase tracking-widest">Failed</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-3 text-slate-300">
                              <Film size={32} />
                              <p className="text-[10px] font-black uppercase tracking-widest">Waiting...</p>
                            </div>
                          )}
                          
                          <div className={cn(
                            "absolute top-3 left-3 text-white text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest",
                            scene.status === 'failed' ? "bg-red-400" : "bg-clay-accent"
                          )}>
                            Scene {idx + 1}
                          </div>
                        </div>

                        <div className="flex-1 space-y-2 mb-4">
                          <h4 className={cn(
                            "font-bold text-sm line-clamp-2",
                            scene.status === 'failed' ? "text-red-900" : "text-clay-text"
                          )}>
                            {scene.description}
                          </h4>
                          
                          {scene.dialog && (
                            <div className="bg-clay-sand/5 border border-clay-sand/10 rounded-xl p-2 flex gap-2 items-start">
                              <MessageSquare size={14} className="text-clay-accent mt-0.5 shrink-0" />
                              <p className="text-[11px] font-medium text-slate-600 leading-relaxed">
                                "{scene.dialog}"
                              </p>
                            </div>
                          )}

                          {scene.status === 'failed' && scene.error && (
                            <div className="bg-red-50 border border-red-100 rounded-xl p-2 flex gap-2 items-start">
                              <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                              <p className="text-[10px] font-medium text-red-600 leading-relaxed">
                                {formatErrorMessage(scene.error)}
                              </p>
                            </div>
                          )}

                          <div className="relative group/prompt">
                            <p className={cn(
                              "text-[10px] italic line-clamp-2 pr-6",
                              scene.status === 'failed' ? "text-red-400" : "text-slate-400"
                            )}>
                              "{scene.prompt}"
                            </p>
                            <button 
                              onClick={() => copyToClipboard(scene.prompt)}
                              className="absolute right-0 top-0 p-1 text-slate-300 hover:text-clay-accent transition-colors"
                              title="Copy Visual Prompt"
                            >
                              <Copy size={12} />
                            </button>
                          </div>

                          {scene.animationPrompt && (
                            <div className="relative group/animation-prompt bg-clay-accent/5 border border-clay-accent/10 rounded-xl p-2">
                              <div className="flex items-center gap-2 mb-1">
                                <Video size={12} className="text-clay-accent" />
                                <span className="text-[9px] font-bold text-clay-accent uppercase tracking-wider">Animation Prompt</span>
                              </div>
                              <p className="text-[10px] text-slate-500 leading-relaxed pr-6 line-clamp-2">
                                {scene.animationPrompt}
                              </p>
                              <button 
                                onClick={() => copyToClipboard(scene.animationPrompt!)}
                                className="absolute right-2 top-2 p-1 text-slate-300 hover:text-clay-accent transition-colors"
                                title="Copy Animation Prompt"
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          )}
                        </div>

                        {scene.status === 'failed' ? (
                          <button 
                            onClick={() => handleRetryScene(scene.id)}
                            disabled={isProcessing}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-50"
                          >
                            <RefreshCw size={14} className={isProcessing && currentGeneratingScene === idx + 1 ? "animate-spin" : ""} />
                            Retry Scene {idx + 1}
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <button 
                                onClick={() => handleDownloadScene(idx, "2K")}
                                disabled={scene.status !== 'completed' || downloadingScenes.has(scene.id)}
                                className="flex items-center justify-center gap-1.5 py-2 bg-white border border-clay-sand/20 text-clay-accent hover:bg-clay-sand/5 rounded-xl text-[10px] font-bold transition-all disabled:opacity-50"
                              >
                                {downloadingScenes.has(scene.id) ? (
                                  <RefreshCw size={12} className="animate-spin" />
                                ) : (
                                  <Download size={12} />
                                )}
                                2K
                              </button>
                              <button 
                                onClick={() => handleDownloadScene(idx, "4K")}
                                disabled={scene.status !== 'completed' || downloadingScenes.has(scene.id)}
                                className="flex items-center justify-center gap-1.5 py-2 bg-white border border-clay-accent/20 text-clay-accent hover:bg-clay-accent/5 rounded-xl text-[10px] font-bold transition-all disabled:opacity-50"
                              >
                                {downloadingScenes.has(scene.id) ? (
                                  <RefreshCw size={12} className="animate-spin" />
                                ) : (
                                  <Download size={12} />
                                )}
                                4K
                              </button>
                            </div>
                            <a 
                              href="https://labs.google/fx/id/tools/flow" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className={cn(
                                "w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-bold transition-all",
                                scene.status === 'completed' 
                                  ? "bg-clay-sand/10 hover:bg-clay-sand/20 text-clay-accent" 
                                  : "bg-slate-100 text-slate-400 pointer-events-none"
                              )}
                            >
                              <ExternalLink size={14} />
                              Create Video in Flow AI
                            </a>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>

      {/* Footer Info */}
      <footer className="mt-20 pb-10 text-center text-slate-400 text-sm">
        <p>© 2026 Clay Animation Generator • by Nandi Arzhanka</p>
        <button 
          onClick={() => window.aistudio.openSelectKey()}
          className="mt-4 text-xs font-bold text-clay-accent/60 hover:text-clay-accent transition-colors flex items-center gap-1 mx-auto"
        >
          <Key size={12} />
          Change API Key
        </button>
      </footer>
    </div>
  );
}
