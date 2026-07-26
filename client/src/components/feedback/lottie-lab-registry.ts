import type { LottieViewProps } from 'lottie-react-native';

export type LottieLabEntry = {
  id: string;
  fileName: string;
  source: LottieViewProps['source'];
  status: 'used' | 'candidate';
  staticProgress: number;
  speed: number;
  loop: boolean;
  usageKeys: readonly string[];
};

export type LottieLabSection = {
  id: string;
  titleKey: string;
  entries: readonly LottieLabEntry[];
};

export const lottieLabSections: readonly LottieLabSection[] = [
  {
    id: 'loading',
    titleKey: 'lottieLab.group.loading',
    entries: [
      {
        id: 'loading',
        fileName: 'loading.json',
        source: require('../../../assets/lottie/loading.json'),
        status: 'used',
        staticProgress: 0.42,
        speed: 1,
        loop: true,
        usageKeys: [
          'lottieLab.usage.bootstrap',
          'lottieLab.usage.analysis',
          'lottieLab.usage.resultSync',
        ],
      },
    ],
  },
  {
    id: 'empty',
    titleKey: 'lottieLab.group.empty',
    entries: [
      {
        id: 'no-item',
        fileName: 'no-item.json',
        source: require('../../../assets/lottie/no-item.json'),
        status: 'used',
        staticProgress: 0.34,
        speed: 0.86,
        loop: true,
        usageKeys: [
          'lottieLab.usage.historyEmpty',
          'lottieLab.usage.heroEmpty',
          'lottieLab.usage.photoMissing',
          'lottieLab.usage.resultMissing',
        ],
      },
    ],
  },
  {
    id: 'warning',
    titleKey: 'lottieLab.group.warning',
    entries: [
      {
        id: 'close',
        fileName: 'close.json',
        source: require('../../../assets/lottie/close.json'),
        status: 'used',
        staticProgress: 0.48,
        speed: 0.86,
        loop: true,
        usageKeys: ['lottieLab.usage.heroError'],
      },
    ],
  },
  {
    id: 'draft',
    titleKey: 'lottieLab.group.draft',
    entries: [
      {
        id: 'plus',
        fileName: 'plus.json',
        source: require('../../../assets/lottie/plus.json'),
        status: 'used',
        staticProgress: 1,
        speed: 1,
        loop: false,
        usageKeys: ['lottieLab.usage.draftAllies'],
      },
    ],
  },
  {
    id: 'candidate',
    titleKey: 'lottieLab.group.candidate',
    entries: [
      {
        id: 'user-profile',
        fileName: 'user-profile.json',
        source: require('../../../assets/lottie/user-profile.json'),
        status: 'candidate',
        staticProgress: 0.5,
        speed: 0.86,
        loop: true,
        usageKeys: ['lottieLab.usage.profileCandidate'],
      },
    ],
  },
];
