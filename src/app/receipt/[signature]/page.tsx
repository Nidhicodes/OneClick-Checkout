'use client';

import { usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Transaction } from '@/lib/db';
import ImageGenerationModal from '@/components/ImageGenerationModal';
import { GeneratedImage } from '@/lib/ai-image-generator';

export default function Receipt() {
  const pathname = usePathname();
  const signature = pathname.split('/').pop();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImageModal, setShowImageModal] = useState(false);
  const [customImage, setCustomImage] = useState<GeneratedImage | null>(null);

  useEffect(() => {
    if (signature) {
      fetch(`/api/get-transaction/${signature}`)
        .then(res => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          return res.json();
        })
        .then(data => {
          if (data.error) {
            console.error('API Error:', data);
            setTransaction(null);
          } else {
            console.log('🧾 Transaction loaded:', data);
            console.log('🏷️ Product name:', data.product);
            setTransaction(data);
          }
          setLoading(false);
        })
        .catch(err => {
          console.error('Fetch error:', err);
          setTransaction(null);
          setLoading(false);
        });
    }
  }, [signature]);

  const handleImageGenerated = (image: GeneratedImage) => {
    setCustomImage(image);
  };

  const handleOpenImageModal = () => {
    console.log('🎨 Opening image modal');
    console.log('🏷️ Product name being passed:', transaction?.product);
    console.log('🧾 Full transaction:', transaction);
    setShowImageModal(true);
  };

  const currentImage = customImage?.dataUrl || transaction?.imageUrl;

  return (
    <div className="font-sans flex flex-col items-center min-h-screen p-8 bg-gray-900 text-gray-100">
      <header className="w-full max-w-4xl mx-auto text-center mb-8">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
          {loading ? 'Loading Receipt...' : transaction ? 'Payment Successful!' : 'Receipt Not Found'}
        </h1>
        {transaction && <p className="text-lg text-gray-400 mt-2">Here is your unique, AI-generated NFT receipt.</p>}
      </header>

      <main className="w-full max-w-lg mx-auto bg-gray-800/50 p-8 rounded-lg border border-gray-700">
        {loading ? (
          <div className="flex justify-center items-center h-96">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
          </div>
        ) : transaction ? (
          <div className="flex flex-col items-center">
            <div className="relative">
              {currentImage ? (
                <Image
                  src={currentImage}
                  alt={`${transaction.product} NFT Receipt`}
                  width={400}
                  height={400}
                  className="rounded-lg mb-4 shadow-lg"
                  priority
                />
              ) : (
                // Use regular img tag for placeholder to avoid Next.js domain configuration
                <img
                  src="https://placehold.co/400x400/1A202C/FFFFFF?text=Image%0ANot%0AAvailable"
                  alt="Placeholder image"
                  width={400}
                  height={400}
                  className="rounded-lg mb-4 shadow-lg"
                />
              )}
              
              {!currentImage && (
                <button
                  onClick={handleOpenImageModal}
                  className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg transition-opacity hover:bg-opacity-70"
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">🎨</div>
                    <div className="text-white font-semibold">Generate AI Image</div>
                  </div>
                </button>
              )}
            </div>

            {currentImage && (
              <button
                onClick={handleOpenImageModal}
                className="text-sm text-cyan-400 hover:text-cyan-300 mb-4 underline"
              >
                Generate New AI Image
              </button>
            )}

            <h2 className="text-2xl font-semibold text-white">{transaction.product}</h2>
            <p className="text-xl font-bold text-cyan-400 mt-1">{transaction.amount} USDC</p>

            <div className="w-full mt-6 border-t border-gray-700 pt-6 text-sm text-gray-400">
              <p className="flex justify-between">
                <span>Status:</span> 
                <span className="font-semibold text-green-400">Confirmed</span>
              </p>
              <p className="flex justify-between mt-2">
                <span>Transaction ID:</span>
              </p>
              <p className="break-all font-mono text-xs mt-1 text-gray-500">{signature}</p>
              
              {customImage && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <p className="text-xs text-gray-500 mb-1">AI Generated Image</p>
                  <p className="text-xs text-gray-600 break-all">
                    Prompt: {customImage.prompt.substring(0, 100)}...
                  </p>
                </div>
              )}
            </div>

            <p className="text-center text-xs text-gray-500 mt-6">
              This is a demo NFT receipt. {customImage ? 'Image generated by Stability AI.' : 'Click above to generate a unique AI image.'}
            </p>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">❌</div>
            <p className="text-xl text-gray-300 mb-2">Transaction Not Found</p>
            <p className="text-gray-500">We could not find a transaction for this signature.</p>
            <p className="text-xs text-gray-600 mt-4 break-all">{signature}</p>
          </div>
        )}
      </main>

      <footer className="w-full max-w-4xl mx-auto text-center mt-8">
        <Link href="/" className="text-cyan-400 hover:underline">
          Back to store
        </Link>
      </footer>

      {transaction && (
        <ImageGenerationModal
          isOpen={showImageModal}
          onClose={() => setShowImageModal(false)}
          productName={transaction.product || 'Unknown Product'}
          onImageGenerated={handleImageGenerated}
        />
      )}
    </div>
  );
}