'use client'

import type { ReactNode } from 'react'
import useSWR from 'swr'
import { ChevronRight, Fingerprint, TextCursorInput } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { BIOMETRIC_KEY, biometricCancelled, biometricStatus } from '@/lib/biometric'
import { AUTOFILL_STATUS_KEY, autofillStatus, openAutofillSettings } from '@/lib/autofill'
import { messageOf } from '@/lib/types'
import type { VaultController } from '@/hooks/use-vault'

type Row = (props: { icon: ReactNode; title: string; description: string; children: ReactNode }) => ReactNode

/** Android-only rows: fingerprint unlock and the system autofill service. */
export function DeviceSettings({ vault, SettingRow }: { vault: VaultController; SettingRow: Row }) {
  const { data: biometric } = useSWR(BIOMETRIC_KEY, biometricStatus, { revalidateOnReconnect: false })
  const { data: autofill } = useSWR(AUTOFILL_STATUS_KEY, autofillStatus, { revalidateOnFocus: true, revalidateOnReconnect: false })
  async function toggleBiometric(enabled: boolean) {
    try { await vault.setBiometric(enabled); toast.success(enabled ? 'Fingerprint unlock is on.' : 'Fingerprint unlock is off.') }
    catch (error) { if (!biometricCancelled(error)) toast.error(messageOf(error)) }
  }
  return <>
    {biometric && <SettingRow icon={<Fingerprint className="size-5" />} title="Fingerprint unlock" description={biometric.available ? 'Open the vault with your fingerprint. Your master password still works, and adding a new fingerprint turns this off.' : 'Set up a fingerprint in your device settings to use this.'}>
      <Switch aria-label="Fingerprint unlock" checked={biometric.enabled} disabled={vault.busy || (!biometric.available && !biometric.enabled)} onCheckedChange={checked => void toggleBiometric(checked)} />
    </SettingRow>}
    {autofill?.supported && <SettingRow icon={<TextCursorInput className="size-5" />} title="Autofill in other apps" description={autofill.enabled ? 'VAULT fills logins into apps and browsers. You always unlock and pick the login yourself.' : 'Fill logins into apps and browsers. Choose VAULT as your autofill service.'}>
      {autofill.enabled
        ? <span className="text-sm font-medium text-primary">On</span>
        : <Button variant="outline" onClick={() => void openAutofillSettings().catch(error => toast.error(messageOf(error)))}>Turn on<ChevronRight data-icon="inline-end" /></Button>}
    </SettingRow>}
  </>
}
