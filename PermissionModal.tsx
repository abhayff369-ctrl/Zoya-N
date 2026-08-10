import React from 'react';
import { motion } from 'motion/react';
import { MicOff } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export default function PermissionModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-md bg-[#0b0b14] border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-amber-400" />
          <div className="absolute top-[-30%] right-[-20%] w-[60%] h-[60%] rounded-full bg-red-500/10 blur-[80px]" />
        </div>
        
        <div className="relative w-16 h-16 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-6">
          <MicOff size={32} className="text-red-400" />
        </div>
        
        <h2 className="relative text-2xl font-display font-semibold text-white mb-3 tracking-wide">Microphone Blocked</h2>
        <p className="relative text-white/60 text-sm mb-6 leading-relaxed">
          Your browser has blocked microphone access for this site. Zoya cannot hear you until you allow it.
        </p>
        
        <div className="relative bg-white/[0.04] border border-white/10 rounded-xl p-4 text-left w-full mb-8">
          <p className="text-sm text-white/80 font-medium mb-2">How to fix this:</p>
          <ol className="text-xs text-white/60 list-decimal pl-4 space-y-2">
            <li>Click the <strong>lock icon (🔒)</strong> or <strong>tune icon (⚙️)</strong> next to the URL bar at the top of your browser.</li>
            <li>Find <strong>Microphone</strong> and change it to <strong>Allow</strong>.</li>
            <li>Refresh this page.</li>
          </ol>
        </div>
        
        <div className="relative flex flex-col w-full gap-3">
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 px-4 bg-white text-black font-semibold rounded-xl hover:bg-gray-200 transition-colors"
          >
            I've allowed it, Refresh Page
          </button>
          <button 
            onClick={onClose}
            className="w-full py-3 px-4 bg-white/5 text-white/70 font-medium rounded-xl hover:bg-white/10 transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
