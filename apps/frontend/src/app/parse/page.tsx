'use client';
import { RaceParserSection } from './components/RaceParserSection';
import { VideoEditorSection } from './components/VideoEditorSection';
import { JobsSection } from './components/JobsSection';
import { JobModal } from './components/JobModal';
import { AuthButton } from '@/components/AuthButton';
import Link from 'next/link';

export default function ParsePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden">
      {/* Background atmosphere */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/5 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,107,0,0.03),transparent_70%)]" />
      </div>

      {/* Header */}
      <header className="relative border-b border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20 group-hover:shadow-orange-500/40 transition-shadow">
              <span className="text-white font-bold text-sm">AP</span>
            </div>
            <div>
              <span className="text-white font-bold text-sm tracking-wide">ACE OF PACE</span>
              <span className="text-orange-500/60 text-[10px] block tracking-[3px] uppercase">Race Engineer</span>
            </div>
          </Link>
          <AuthButton />
        </div>
      </header>

      {/* Content */}
      <main className="relative max-w-6xl mx-auto px-6 py-10 space-y-10">
        <RaceParserSection />
        <div className="border-t border-white/5" />
        <VideoEditorSection />
        <div className="border-t border-white/5" />
        <JobsSection />
      </main>

      <JobModal />
    </div>
  );
}
