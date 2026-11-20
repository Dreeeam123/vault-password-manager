import localFont from 'next/font/local'

const inter = localFont({
  src: '../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-inter',
  display: 'swap',
})
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { LOOK_BOOT_SCRIPT } from '@/lib/look'
import { contentSecurityPolicy } from '@/lib/csp'

export const metadata: Metadata = {
  title: 'Vault — Your passwords. Yours alone.',
  description: 'A private, offline-first password manager. Encrypted on your device. No cloud, no accounts, no tracking.',
  applicationName: 'Vault',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/vault-app-icon.png', apple: '/vault-app-icon.png' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  colorScheme: 'dark light', themeColor: '#151719',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark bg-background`} data-appearance="mono" suppressHydrationWarning>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={contentSecurityPolicy(process.env.NODE_ENV === 'development')} />
        <script dangerouslySetInnerHTML={{ __html: LOOK_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
