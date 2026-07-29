const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withAndroidVideoPipCapability(config) {
  return withAndroidManifest(config, (nextConfig) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(nextConfig.modResults);
    activity.$['android:supportsPictureInPicture'] = 'true';
    return nextConfig;
  });
};
