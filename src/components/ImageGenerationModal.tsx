'use client';

import { useState } from 'react';
import Image from 'next/image';
import { GeneratedImage } from '@/lib/ai-image-generator';

interface ImageGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  onImageGenerated: (image: GeneratedImage) => void;
}

export default function ImageGenerationModal({ 
  isOpen, 
  onClose, 
  productName, 
  onImageGenerated 
}: ImageGenerationModalProps) {
  const [loading, setLoading] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<'futuristic' | 'realistic' | 'artistic' | 'minimal'>('futuristic');
  const [selectedMood, setSelectedMood] = useState<'dark' | 'bright' | 'neon' | 'elegant'>('dark');
  const [error, setError] = useState<string | null>(null);

  const generateImages = async () => {
    setLoading(true);
    setGeneratedImages([]);
    setError(null);

    const requestPayload = {
      productName,
      style: selectedStyle,
      mood: selectedMood
    };

    console.log('🚀 Sending request to /api/generate-nft-image');
    console.log('📦 Request payload:', requestPayload);

    try {
      const response = await fetch('/api/generate-nft-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      console.log('📡 Response status:', response.status);
      console.log('📡 Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error response body:', errorText);
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Success response data:', data);

      if (data.success && data.image) {
        console.log('🖼️ Image data received:', {
          hasBase64: !!data.image.base64,
          hasDataUrl: !!data.image.dataUrl,
          prompt: data.image.prompt,
          timestamp: data.image.timestamp
        });
        
        setGeneratedImages([data.image]);
        console.log('✨ Images set in state');
      } else {
        console.error('❌ Unexpected response format:', data);
        throw new Error(data.message || data.error || 'Failed to generate image');
      }
    } catch (error) {
      console.error('💥 Error generating images:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const selectImage = (image: GeneratedImage) => {
    console.log('🎯 Image selected:', {
      hasBase64: !!image.base64,
      hasDataUrl: !!image.dataUrl,
      prompt: image.prompt
    });
    onImageGenerated(image);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-700">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">Generate NFT Receipt Image</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl"
            >
              ×
            </button>
          </div>
          <p className="text-gray-400 mt-2">Creating AI image for: {productName}</p>
        </div>

        <div className="p-6">
          {/* Style and Mood Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">Style</label>
              <div className="grid grid-cols-2 gap-2">
                {(['futuristic', 'realistic', 'artistic', 'minimal'] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => setSelectedStyle(style)}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      selectedStyle === style
                        ? 'border-cyan-400 bg-cyan-400/10 text-cyan-400'
                        : 'border-gray-600 hover:border-gray-500 text-gray-300'
                    }`}
                  >
                    {style.charAt(0).toUpperCase() + style.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">Mood</label>
              <div className="grid grid-cols-2 gap-2">
                {(['dark', 'bright', 'neon', 'elegant'] as const).map((mood) => (
                  <button
                    key={mood}
                    onClick={() => setSelectedMood(mood)}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      selectedMood === mood
                        ? 'border-purple-400 bg-purple-400/10 text-purple-400'
                        : 'border-gray-600 hover:border-gray-500 text-gray-300'
                    }`}
                  >
                    {mood.charAt(0).toUpperCase() + mood.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <div className="text-center mb-6">
            <button
              onClick={generateImages}
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-purple-500 to-cyan-500 text-white font-semibold rounded-lg hover:from-purple-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? 'Generating...' : 'Generate AI Image'}
            </button>
          </div>

          {/* Error State */}
          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-400 p-4 rounded-lg mb-6">
              <p className="font-semibold">Generation Failed</p>
              <p className="text-sm mt-1">{error}</p>
              <button 
                onClick={() => setError(null)}
                className="text-xs underline mt-2 hover:no-underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
              <p className="text-gray-400 mt-4">Creating your unique NFT image...</p>
              <p className="text-gray-500 text-sm mt-2">This may take 10-30 seconds</p>
            </div>
          )}

          {/* Generated Images */}
          {generatedImages.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white text-center">Select Your NFT Image</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {generatedImages.map((image, index) => (
                  <div key={index} className="relative group">
                    <Image
                      src={image.dataUrl}
                      alt={`Generated NFT ${index + 1}`}
                      width={300}
                      height={300}
                      className="rounded-lg w-full h-auto cursor-pointer transition-transform group-hover:scale-105"
                      onClick={() => selectImage(image)}
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded-lg transition-all flex items-center justify-center">
                      <button
                        onClick={() => selectImage(image)}
                        className="opacity-0 group-hover:opacity-100 bg-cyan-500 text-white px-4 py-2 rounded-lg font-semibold transition-opacity"
                      >
                        Select This Image
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      {selectedStyle} • {selectedMood}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}