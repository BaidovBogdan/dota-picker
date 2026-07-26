module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        canvas: '#F1F0E8',
        surface: '#F8F7F1',
        ink: '#11120F',
        muted: '#686861',
        primary: '#2049D8',
        radiant: '#2049D8',
        dire: '#F04432',
      },
      fontFamily: {
        display: ['Oswald_700Bold'],
        body: ['IBMPlexSans_400Regular'],
        bodySemibold: ['IBMPlexSans_600SemiBold'],
        mono: ['IBMPlexMono_500Medium'],
      },
    },
  },
  plugins: [],
};
