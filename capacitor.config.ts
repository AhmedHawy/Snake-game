import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ahmedhawy.snakerush',
  appName: 'Snake Rush',
  webDir: 'dist',
  backgroundColor: '#0f3d1e',
  android: {
    // No remote content: everything is bundled in the APK.
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
