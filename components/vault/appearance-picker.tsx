'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { APPEARANCES, type Appearance } from '@/lib/types'
import { appIconPreview } from '@/lib/app-icon'
import { Capacitor } from '@capacitor/core'

export const APPEARANCE_INFO: Record<Appearance, { title: string; description: string }> = {
  classic: { title: 'Classic', description: 'Graphite and cobalt. Clean and crisp.' },
  glass: { title: 'Liquid Glass', description: 'Lagoon tones with frosted surfaces.' },
  gradient: { title: 'Gradient', description: 'Sunset plum with a soft peach accent.' },
  midnight: { title: 'Midnight', description: 'Deep navy with a violet glow.' },
  forest: { title: 'Forest', description: 'Calm greens, grounded and quiet.' },
  rose: { title: 'Rose', description: 'Soft pink on warm cream.' },
  mono: { title: 'Mono', description: 'Black and white. Nothing else.' },
  ocean: { title: 'Ocean', description: 'Deep blue with a cyan highlight.' },
  amber: { title: 'Amber', description: 'Warm orange on toasted neutrals.' },
}

function Swatch({ appearance, mode }: { appearance: Appearance; mode: 'dark' | 'light' }) {
  return <span className="appearance-swatch" data-preview={appearance} data-mode={mode}><span className="preview-panel"><span /><span /><span /></span></span>
}

export function AppearancePicker({ value, onChange }: { value: Appearance; onChange: (value: Appearance) => void }) {
  const native = Capacitor.isNativePlatform()
  return <div className="mt-6 flex flex-col gap-4 border-t border-border pt-5">
    <div><h3 className="text-sm font-medium">Theme</h3><p className="mt-1 text-sm text-muted-foreground">Each theme has a light and a dark variant. {native ? 'Your home screen icon changes with it.' : 'Saved inside your encrypted vault.'}</p></div>
    <ToggleGroup className="appearance-options" value={[value]} onValueChange={values => { if (values[0]) onChange(values[0] as Appearance) }} aria-label="Theme">
      {APPEARANCES.map(appearance => <ToggleGroupItem className="appearance-option" key={appearance} value={appearance} aria-label={`${APPEARANCE_INFO[appearance].title} theme`}>
        <span className="appearance-preview" aria-hidden="true"><Swatch appearance={appearance} mode="dark" /><Swatch appearance={appearance} mode="light" /></span>
        <span className="flex items-start gap-2.5 px-1"><img src={appIconPreview(appearance)} alt="" width={28} height={28} className="mt-0.5 size-7 shrink-0 rounded-[8px] shadow-sm" /><span className="flex flex-col gap-0.5"><span className="text-sm font-medium text-foreground">{APPEARANCE_INFO[appearance].title}</span><span className="text-xs leading-relaxed text-muted-foreground">{APPEARANCE_INFO[appearance].description}</span></span></span>
      </ToggleGroupItem>)}
    </ToggleGroup>
  </div>
}
