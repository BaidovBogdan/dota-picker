import { MagnifyingGlassIcon } from '@phosphor-icons/react';

export function FilterSearchField({
  className = '',
  label,
  onValueChange,
  placeholder,
  reveal = false,
  value,
}: {
  className?: string;
  label: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  reveal?: boolean;
  value: string;
}) {
  return (
    <label
      className={`search-field filter-search-field ${className}`}
      data-reveal={reveal ? 'true' : undefined}
    >
      <MagnifyingGlassIcon size={17} aria-hidden />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
