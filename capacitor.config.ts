import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.billingsoftwareonline.app',
  appName: 'Bill Look',
  webDir: 'dist',
  server: {
    url: 'https://billlook.com/',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: false, // we hide manually after app mounts
      backgroundColor: '#1d4fb8',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#ffffff',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      backgroundColor: '#1d4fb8',
      style: 'LIGHT',
    },
  },
};

export default config;
