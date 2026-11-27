import React, { useState } from 'react';
import { X, Search, BookOpen } from 'lucide-react';
import { MEDICAL_ABBREVIATIONS } from '../utils/medicalDictionary';
import { MedScribeLogo } from './MedScribeLogo';

interface MedicalDictionaryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MedicalDictionaryModal: React.FC<MedicalDictionaryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  if (!isOpen) return null;

  const categories = [
    'All',
    'Prescription Frequency',
    'Timing',
    'Clinical Heading',
    'Systemic Exam',
    'Common Abbreviation',
  ];

  const filteredTerms = MEDICAL_ABBREVIATIONS.filter((item) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      item.term.toLowerCase().includes(q) ||
      item.meaning.toLowerCase().includes(q) ||
      item.example.toLowerCase().includes(q);
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2E2A3B]/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FDFBF9] rounded-2xl max-w-3xl w-full shadow-2xl border border-[#E6E0D8] overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#D6DDF8] flex items-center justify-between bg-gradient-to-r from-[#F4F1FA] via-[#E1F7FC] to-[#EBFBF3] text-[#1E3A5F]">
          <div className="flex items-center gap-3">
            <MedScribeLogo variant="icon" size="sm" />
            <div>
              <h2 className="text-base font-bold text-[#2D2A3E] flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-teal-700" />
                <span>Medical Shorthand &amp; Abbreviations Dictionary</span>
              </h2>
              <p className="text-xs text-[#4B6385]">
                Quick reference guide for standard OPD, OT, and IPD clinical abbreviations ({MEDICAL_ABBREVIATIONS.length} terms)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#4B6385] hover:text-[#1E3A5F] hover:bg-white/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="p-4 border-b border-slate-100 bg-white space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search abbreviation or term (e.g. TDS, c/o, a/c, k/c/o, SpO2)..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full whitespace-nowrap transition-colors font-medium cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* List of Terms */}
        <div className="p-4 overflow-y-auto divide-y divide-slate-100 flex-1 bg-white">
          {filteredTerms.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              No matching abbreviation found for &ldquo;{searchTerm}&rdquo;.
            </div>
          ) : (
            filteredTerms.map((term, idx) => (
              <div
                key={idx}
                className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      {term.term}
                    </span>
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                      {term.category}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 mt-1">{term.meaning}</p>
                  <p className="text-xs text-slate-500 italic mt-0.5">Example: {term.example}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E6E0D8] bg-[#FAF8F5] flex items-center justify-between text-xs text-[#6B647B]">
          <span>
            Showing {filteredTerms.length} of {MEDICAL_ABBREVIATIONS.length} standard clinical abbreviations.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#E1F7FC] hover:bg-[#CBE8F8] text-[#1E4D5C] border border-[#A9CFF7] font-bold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
