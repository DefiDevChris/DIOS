import { useState, useRef, useEffect, useCallback } from 'react';

interface Suggestion {
  placeId: string;
  description: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  onPlaceSelected?: (result: { address: string; city: string; state: string; zipCode: string; lat: number; lng: number }) => void;
  placeholder?: string;
  className?: string;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  placeholder = '123 Farm Road, City, State ZIP',
  className = '',
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (input: string) => {
    if (!input.trim() || input.length < 3 || !window.electronAPI?.places) {
      setSuggestions([]);
      return;
    }
    try {
      const results = await window.electronAPI.places.autocomplete(input);
      setSuggestions(results || []);
      setShowDropdown(results.length > 0);
      setActiveIndex(-1);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSelect = async (suggestion: Suggestion) => {
    setShowDropdown(false);
    setSuggestions([]);
    onChange(suggestion.description);

    if (onPlaceSelected && window.electronAPI?.places) {
      const details = await window.electronAPI.places.details(suggestion.placeId);
      if (details) {
        onPlaceSelected(details);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showDropdown && suggestions.length > 0 && (
        <ul
          className="absolute z-50 left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-lg border border-[rgba(212,165,116,0.25)]"
          style={{ background: 'linear-gradient(135deg, #fdfbf8 0%, #fff 100%)' }}
        >
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              onMouseDown={() => handleSelect(s)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                i === activeIndex
                  ? 'bg-[rgba(212,165,116,0.15)] text-[#4a4038]'
                  : 'text-[#5a4e42] hover:bg-[rgba(212,165,116,0.08)]'
              }`}
            >
              {s.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
