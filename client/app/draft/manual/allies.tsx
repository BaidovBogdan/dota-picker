import { ManualHeroWizardStep } from '@/components/draft/manual-wizard';

export default function AlliesStepScreen() {
  return <ManualHeroWizardStep step={1} team="allies" nextPath="/draft/manual/rank" />;
}
