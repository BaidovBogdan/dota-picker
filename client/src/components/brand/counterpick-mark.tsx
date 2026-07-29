import { CounterpickLogo } from '@/components/brand/counterpick-logo';

type Props = { size?: number };

export function CounterpickMark({ size = 40 }: Props) {
  return <CounterpickLogo size={size} />;
}
