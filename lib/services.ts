export const SERVICES = [
  { name: 'Snapchat', slug: 'snapchat', url: 'https://accounts.snapchat.com' },
  { name: 'Discord', slug: 'discord', url: 'https://discord.com' },
  { name: 'Instagram', slug: 'instagram', url: 'https://www.instagram.com' },
  { name: 'TikTok', slug: 'tiktok', url: 'https://www.tiktok.com' },
  { name: 'WhatsApp', slug: 'whatsapp', url: 'https://web.whatsapp.com' },
  { name: 'Telegram', slug: 'telegram', url: 'https://web.telegram.org' },
  { name: 'YouTube', slug: 'youtube', url: 'https://www.youtube.com' },
  { name: 'Spotify', slug: 'spotify', url: 'https://accounts.spotify.com' },
] as const
export type Service = typeof SERVICES[number]
export const serviceForCategory = (category: string) => SERVICES.find(service => service.name === category)
