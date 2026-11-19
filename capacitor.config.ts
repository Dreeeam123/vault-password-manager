import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.privatevault.mobile',
  appName: 'Vault',
  webDir: 'out',
  server: { androidScheme: 'https', cleartext: false },
  backgroundColor: '#151719',
  zoomEnabled: false,
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  plugins: {
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
  },
}

export default config
