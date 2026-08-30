/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SettingsSwitchField } from '../components/settings-form-layout'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type OverviewSectionProps = {
  enabled: boolean
}

export function OverviewSection(props: OverviewSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [isEnabled, setIsEnabled] = useState(props.enabled)

  useEffect(() => {
    setIsEnabled(props.enabled)
  }, [props.enabled])

  const handleToggleEnabled = async (checked: boolean) => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.setup_guide_enabled',
        value: checked,
      })
      setIsEnabled(checked)
      toast.success(t('Setting saved'))
    } catch {
      toast.error(t('Failed to update setting'))
    }
  }

  return (
    <SettingsSection title={t('Overview')}>
      <SettingsSwitchField
        checked={isEnabled}
        onCheckedChange={handleToggleEnabled}
        label={t('Show setup guide')}
        description={t('Show the setup guide on the overview page.')}
      />
    </SettingsSection>
  )
}
