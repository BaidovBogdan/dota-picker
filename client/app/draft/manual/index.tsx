import { ManualHeroWizardStep } from '@/components/draft/manual-wizard';

export default function OpponentsStepScreen() {
  return <ManualHeroWizardStep step={0} team="enemies" nextPath="/draft/manual/allies" />;
}
