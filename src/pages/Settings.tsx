import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, ExternalLink, UserRound, KeyRound, Gamepad2, Globe, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { LANGUAGES, useLanguage } from '@/i18n/LanguageContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar } from '@/components/Avatar'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

export default function Settings() {
  const { user, resetPassword, signOut } = useAuth()
  const { t, locale, setLocale } = useLanguage()
  const [searchParams] = useSearchParams()
  const [npsso, setNpsso] = React.useState('')
  const [username, setUsername] = React.useState<string | null>(null)
  const [usernameInput, setUsernameInput] = React.useState('')
  const [savingUsername, setSavingUsername] = React.useState(false)
  const [sendingPasswordReset, setSendingPasswordReset] = React.useState(false)
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false)
  const avatarInputRef = React.useRef<HTMLInputElement>(null)
  const [psnConnected, setPsnConnected] = React.useState(false)
  const [steamConnected, setSteamConnected] = React.useState(false)
  const [connectingPsn, setConnectingPsn] = React.useState(false)
  const [connectingSteam, setConnectingSteam] = React.useState(false)
  const [syncingPsn, setSyncingPsn] = React.useState(false)
  const [syncingSteam, setSyncingSteam] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const refreshStatus = React.useCallback(async () => {
    if (!user) return
    const [profile, psn, steam] = await Promise.all([
      supabase.from('profiles').select('username, avatar_url').eq('id', user.id).maybeSingle(),
      supabase.from('psn_accounts').select('user_id').eq('user_id', user.id).maybeSingle(),
      supabase.from('steam_accounts').select('user_id').eq('user_id', user.id).maybeSingle(),
    ])
    setUsername(profile.data?.username ?? null)
    setUsernameInput(profile.data?.username ?? '')
    setAvatarUrl(profile.data?.avatar_url ?? null)
    setPsnConnected(!!psn.data)
    setSteamConnected(!!steam.data)
  }, [user])

  React.useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  // Callback do login da Steam volta pra cá com ?steam=conectado ou ?steam=erro
  React.useEffect(() => {
    const steamResult = searchParams.get('steam')
    if (steamResult === 'conectado') {
      setNotice(t('settings.noticeSteamConnected'))
      refreshStatus()
    } else if (steamResult === 'erro') {
      setError(t('settings.errorSteamConnect'))
    }
  }, [searchParams, refreshStatus, t])

  async function saveUsername(e: React.FormEvent) {
    e.preventDefault()
    if (!user || usernameInput.trim() === '' || usernameInput === username) return
    setError(null)
    setSavingUsername(true)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ username: usernameInput.trim() })
      .eq('id', user.id)
    setSavingUsername(false)
    if (updateError) {
      setError(
        updateError.code === '23505'
          ? t('settings.errorUsernameTaken')
          : t('settings.errorUsernameSave'),
      )
    } else {
      setUsername(usernameInput.trim())
      setNotice(t('settings.noticeUsernameSaved'))
    }
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return

    if (!file.type.startsWith('image/')) {
      setError(t('settings.errorAvatarType'))
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(t('settings.errorAvatarSize'))
      return
    }

    setError(null)
    setUploadingAvatar(true)

    const extension = file.name.split('.').pop() || 'jpg'
    const path = `${user.id}/avatar.${extension}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadError) {
      setUploadingAvatar(false)
      setError(t('settings.errorAvatarUpload'))
      return
    }

    // Cache-bust: o caminho não muda entre uploads, então sem isso o
    // navegador (e o CDN) continuariam mostrando a imagem antiga.
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const publicUrl = `${data.publicUrl}?t=${Date.now()}`

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id)

    setUploadingAvatar(false)
    if (updateError) {
      setError(t('settings.errorAvatarUpload'))
    } else {
      setAvatarUrl(publicUrl)
      setNotice(t('settings.noticeAvatarSaved'))
    }
  }

  async function requestPasswordReset() {
    if (!user?.email) return
    setError(null)
    setSendingPasswordReset(true)
    const { error: resetError } = await resetPassword(user.email)
    setSendingPasswordReset(false)
    if (resetError) setError(t('settings.errorPasswordReset'))
    else setNotice(t('settings.noticePasswordReset'))
  }

  async function connectPsn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setConnectingPsn(true)
    try {
      const { error: fnError } = await supabase.functions.invoke('psn-connect', {
        body: { npsso },
      })
      if (fnError) {
        setError(t('settings.errorPsnConnect'))
      } else {
        setPsnConnected(true)
        setNpsso('')
      }
    } catch {
      setError('Não foi possível conectar. Verifique sua conexão e tente de novo.')
    } finally {
      setConnectingPsn(false)
    }
  }

  async function connectSteam() {
    setError(null)
    setConnectingSteam(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{ redirectUrl: string }>(
        'steam-connect',
      )
      if (fnError || !data?.redirectUrl) {
        setError(t('settings.errorSteamStart'))
        return
      }
      window.location.href = data.redirectUrl
    } catch {
      setError('Não foi possível iniciar o login da Steam. Verifique sua conexão e tente de novo.')
    } finally {
      setConnectingSteam(false)
    }
  }

  async function syncPsn() {
    setSyncingPsn(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{ synced: number }>('psn-sync')
      if (fnError) setError(t('settings.errorPsnSync'))
      else if (!data?.synced) setNotice('Sincronizado, mas nenhum jogo foi encontrado na sua conta PSN.')
      else setNotice(t('settings.noticePsnSync'))
    } catch {
      setError('Falha ao sincronizar com a PSN. Verifique sua conexão e tente de novo.')
    } finally {
      setSyncingPsn(false)
    }
  }

  async function syncSteam() {
    setSyncingSteam(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        synced: number
        diagnostics?: { ownedGames: number; withPlaytime: number; withoutAchievements: number }
      }>('steam-sync')
      if (fnError) setError(t('settings.errorSteamSync'))
      else if (!data?.synced) {
        const d = data?.diagnostics
        const detail = d
          ? d.ownedGames === 0
            ? 'a Steam não retornou nenhum jogo da conta (perfil ainda não está acessível pra API, ou a conta não tem jogos).'
            : d.withPlaytime === 0
              ? `a conta tem ${d.ownedGames} jogo(s), mas nenhum com tempo de jogo registrado.`
              : `${d.withPlaytime} jogo(s) com tempo de jogo, mas nenhum tinha conquistas cadastradas na Steam.`
          : ''
        setNotice(`Sincronizado, mas nenhum jogo com conquistas foi encontrado. ${detail}`.trim())
      } else setNotice(t('settings.noticeSteamSync'))
    } catch {
      setError('Falha ao sincronizar com a Steam. Verifique sua conexão e tente de novo.')
    } finally {
      setSyncingSteam(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text">
        <ArrowLeft className="h-4 w-4" />
        {t('settings.backLink')}
      </Link>

      <div className="mb-8">
        <h1 className="font-display text-lg font-medium text-text">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('settings.subtitle')}</p>
      </div>

      {notice && (
        <p className="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {notice}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="space-y-8">
        <section className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>
                <UserRound className="h-4 w-4 text-text-secondary" />
                {t('settings.profileTitle')}
              </CardTitle>
            </CardHeader>

            <div className="mb-5 flex items-center gap-4">
              <Avatar url={avatarUrl} label={username || user?.email || '?'} className="h-16 w-16 text-lg" />
              <div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={uploadAvatar}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? t('settings.uploadingAvatar') : t('settings.changeAvatar')}
                </Button>
              </div>
            </div>

            <form onSubmit={saveUsername} className="space-y-1.5">
              <Label htmlFor="username">{t('settings.usernameLabel')}</Label>
              <div className="flex gap-2">
                <Input
                  id="username"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  required
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  disabled={savingUsername || usernameInput.trim() === '' || usernameInput === username}
                >
                  {savingUsername ? t('settings.savingUsername') : t('settings.saveUsername')}
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <KeyRound className="h-4 w-4 text-text-secondary" />
                {t('settings.accountTitle')}
              </CardTitle>
            </CardHeader>

            <div className="mb-5 space-y-1">
              <Label>{t('settings.emailLabel')}</Label>
              <p className="text-sm text-text">{user?.email}</p>
            </div>

            <div className="space-y-1.5">
              <Label>{t('settings.passwordLabel')}</Label>
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={requestPasswordReset}
                  disabled={sendingPasswordReset}
                >
                  {sendingPasswordReset ? t('settings.sendingPasswordReset') : t('settings.changePassword')}
                </Button>
              </div>
              <CardDescription className="text-xs">{t('settings.changePasswordDescription')}</CardDescription>
            </div>

            <div className="mt-5 border-t border-border pt-5">
              <Button type="button" variant="danger" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4" />
                {t('settings.signOut')}
              </Button>
            </div>
          </Card>
        </section>

        <section>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-secondary">
            {t('settings.connectedAccountsLabel')}
          </p>

          <div className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Gamepad2 className="h-4 w-4 text-text-secondary" />
                  {t('settings.psnTitle')}
                </CardTitle>
                {psnConnected && (
                  <span className="flex items-center gap-1 text-xs font-medium text-success">
                    <Check className="h-3.5 w-3.5" /> {t('settings.connected')}
                  </span>
                )}
              </CardHeader>

              {!psnConnected ? (
                <form onSubmit={connectPsn} className="space-y-3">
                  <CardDescription>
                    {t('settings.psnDescriptionPrefix')}{' '}
                    <a
                      href="https://www.playstation.com"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-accent hover:underline"
                    >
                      playstation.com <ExternalLink className="h-3 w-3" />
                    </a>{' '}
                    {t('settings.psnDescriptionSuffix')}
                  </CardDescription>
                  <a
                    href="https://ca.account.sony.com/api/v1/ssocookie"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text hover:bg-surface-hover"
                  >
                    {t('settings.getNpsso')} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <div className="space-y-1.5">
                    <Label htmlFor="npsso">{t('settings.npssoLabel')}</Label>
                    <Input
                      id="npsso"
                      value={npsso}
                      onChange={(e) => setNpsso(e.target.value)}
                      placeholder={t('settings.npssoPlaceholder')}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={connectingPsn} size="sm">
                    {connectingPsn ? t('settings.connectingPsn') : t('settings.connectPsn')}
                  </Button>
                </form>
              ) : (
                <Button variant="secondary" size="sm" onClick={syncPsn} disabled={syncingPsn}>
                  {syncingPsn ? t('settings.syncingNow') : t('settings.syncNow')}
                </Button>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <Gamepad2 className="h-4 w-4 text-text-secondary" />
                  {t('settings.steamTitle')}
                </CardTitle>
                {steamConnected && (
                  <span className="flex items-center gap-1 text-xs font-medium text-success">
                    <Check className="h-3.5 w-3.5" /> {t('settings.connected')}
                  </span>
                )}
              </CardHeader>

              {!steamConnected ? (
                <>
                  <CardDescription className="mb-3">{t('settings.steamDescription')}</CardDescription>
                  <Button variant="secondary" size="sm" onClick={connectSteam} disabled={connectingSteam}>
                    {connectingSteam ? t('settings.redirecting') : t('settings.loginWithSteam')}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="sm" onClick={syncSteam} disabled={syncingSteam}>
                  {syncingSteam ? t('settings.syncingNow') : t('settings.syncNow')}
                </Button>
              )}
            </Card>
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-secondary">
            {t('settings.preferencesLabel')}
          </p>

          <Card>
            <CardHeader>
              <CardTitle>
                <Globe className="h-4 w-4 text-text-secondary" />
                {t('settings.languageTitle')}
              </CardTitle>
            </CardHeader>
            <CardDescription className="mb-3">{t('settings.languageDescription')}</CardDescription>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setLocale(lang.code)}
                  className={`rounded-lg border px-3.5 py-1.5 text-sm transition-colors ${
                    locale === lang.code
                      ? 'border-accent/30 bg-accent/15 text-accent'
                      : 'border-border text-text-secondary hover:bg-surface'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}
