import * as Select from '@radix-ui/react-select';
import {
  CaretDownIcon,
  CaretUpIcon,
  CheckIcon,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';

export type AppSelectOption = {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export function AppSelect({
  value,
  onValueChange,
  options,
  label,
  placeholder,
  leadingIcon,
  className = '',
  disabled = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly AppSelectOption[];
  label: string;
  placeholder?: string;
  leadingIcon?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { text } = useI18n();
  const selected = options.find((option) => option.value === value);
  const selectedIcon = selected?.icon ?? leadingIcon;
  const hasOptionIcons = options.some((option) => option.icon);
  const resolvedPlaceholder = placeholder ?? text('Выберите значение', 'Select a value');

  return (
    <Select.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <Select.Trigger
        className={`app-select ${selectedIcon ? 'app-select--with-icon' : ''} ${className}`}
        aria-label={label}
      >
        {selectedIcon ? (
          <span className="app-select__leading" aria-hidden>
            {selectedIcon}
          </span>
        ) : null}
        <Select.Value className="app-select__value" placeholder={resolvedPlaceholder}>
          {selected ? (
            <span className="app-select__selected">
              <span>{selected.label}</span>
              {selected.description ? <small>{selected.description}</small> : null}
            </span>
          ) : undefined}
        </Select.Value>
        <Select.Icon className="app-select__caret">
          <CaretDownIcon size={15} weight="bold" aria-hidden />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="app-select-content"
          position="popper"
          align="start"
          sideOffset={6}
          collisionPadding={12}
        >
          <Select.ScrollUpButton className="app-select-scroll">
            <CaretUpIcon size={15} weight="bold" aria-hidden />
          </Select.ScrollUpButton>
          <Select.Viewport className="app-select-viewport">
            {options.map((option) => (
              <Select.Item
                className={`app-select-item ${hasOptionIcons ? 'app-select-item--with-icon' : ''}`}
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {hasOptionIcons ? (
                  <span className="app-select-item__icon" aria-hidden>
                    {option.icon}
                  </span>
                ) : null}
                <Select.ItemText>
                  <span className="app-select-item__copy">
                    <span>{option.label}</span>
                    {option.description ? <small>{option.description}</small> : null}
                  </span>
                </Select.ItemText>
                <Select.ItemIndicator className="app-select-item__indicator">
                  <CheckIcon size={14} weight="bold" aria-hidden />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="app-select-scroll">
            <CaretDownIcon size={15} weight="bold" aria-hidden />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
