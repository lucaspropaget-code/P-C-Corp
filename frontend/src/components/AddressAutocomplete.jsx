import { useState, useEffect, useRef } from 'react';
import { Input } from './ui/input';
import { MapPin } from 'lucide-react';

export function AddressAutocomplete({ value, onChange, onSelect, placeholder, className, ...props }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchAddress = async (q) => {
    if (q.length < 3) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=6`);
      const data = await res.json();
      setSuggestions(data.features || []);
      setShowSuggestions(true);
    } catch (err) {
      console.error('Address API error:', err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange?.(val);
    
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAddress(val), 300);
  };

  const handleSelect = (feature) => {
    const label = feature.properties.label;
    const [lon, lat] = feature.geometry.coordinates;
    const city = feature.properties.city || '';
    const postcode = feature.properties.postcode || '';
    
    setQuery(label);
    setSuggestions([]);
    setShowSuggestions(false);
    onChange?.(label);
    onSelect?.({ address: label, latitude: lat, longitude: lon, city, postcode });
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder={placeholder || "Tapez une adresse..."}
          className={`pl-10 ${className || 'bg-secondary'}`}
          autoComplete="off"
          {...props}
        />
      </div>
      
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {suggestions.map((feat, i) => (
            <button
              key={i}
              type="button"
              className="w-full px-4 py-3 text-left hover:bg-secondary/80 transition-colors flex items-start gap-3 border-b border-border last:border-0"
              onClick={() => handleSelect(feat)}
            >
              <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{feat.properties.name}</p>
                <p className="text-xs text-muted-foreground">{feat.properties.postcode} {feat.properties.city}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default AddressAutocomplete;
