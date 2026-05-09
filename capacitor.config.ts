import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.55644ebd3f2c4995aee804523489f5b8',
  appName: 'BillBook',
  webDir: 'dist',
  server: {
    url: 'https://55644ebd-3f2c-4995-aee8-04523489f5b8.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
