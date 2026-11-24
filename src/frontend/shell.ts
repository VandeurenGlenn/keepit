import { LiteElement, customElement, css, html, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/theme.js'
import '@vandeurenglenn/flex-elements/container.js'
import '@vandeurenglenn/flex-elements/wrap-around.js'
import '@vandeurenglenn/lite-elements/icon-button.js'
import '@vandeurenglenn/lite-elements/button.js'
import '@vandeurenglenn/lite-elements/icon.js'
import '@vandeurenglenn/lite-elements/divider.js'
import './elements/user/account-bar.js'
import './views/loading-view.js'
import './elements/build-info.js'
import './elements/global-search.js'
import { api, ApiError } from './api/client.js'
import { TimelineTracker } from './helpers/timeline-tracker.js'
import type { AppNotification } from '../types/index.js'
import { mergeUnreadNotifications, notificationTarget } from './helpers/notification-queue.js'
import { flushOfflineActions, getPendingWorkState, initializeOfflineSync, setOfflineActionOwner } from './helpers/offline-actions.js'
import type { ConfirmationOptions } from './helpers/confirmation.js'
import { confirmAction } from './helpers/confirmation.js'
import { clearUnsavedChanges, hasUnsavedChanges } from './helpers/unsaved-changes.js'
import { parseWorkspaceRoute } from './helpers/workspace-route.js'

import './animations/error.js'

import icons from './icons.js'
import styles from './shell.css' with { type: 'css' }

globalThis.exports = {}

type ConfirmationRequest = ConfirmationOptions & { resolve: (confirmed: boolean) => void }

export class AppShell extends LiteElement {
  @property({ type: Boolean, provides: true, attribute: 'is-narrow', reflect: true }) accessor isNarrow

  @property({ type: Boolean, attribute: 'is-medium-narrow' }) accessor isMediumNarrow

  @property({ type: String, reflect: true, temporaryRender: 500 }) accessor selected

  @property({ type: Boolean, attribute: 'signed-in', reflect: true }) accessor userSignedIn

  @property({ type: Boolean, provides: true }) accessor darkMode

  @property({ type: Object, provides: true }) accessor user

  @property({ type: Array, provides: true }) accessor invoices
  @property({ type: Array, provides: true }) accessor invoice
  @property({ type: Object, provides: true }) accessor jobs
  @property({ type: Object, provides: true }) accessor job
  @property({ type: Object, provides: true }) accessor quotes
  @property({ type: Object, provides: true }) accessor quote
  @property({ type: Array, provides: true }) accessor companies
  @property({ type: Array, provides: true }) accessor users

  @property({ type: Object }) accessor error: { message: string; label: string; href: string } | null = null
  @property({ type: Boolean }) accessor routeLoading = false
  @property({ type: Boolean, attribute: 'is-menu-open', reflect: true }) accessor isMenuOpen = false
  @property({ type: Boolean, attribute: 'auth-resolving' }) accessor authResolving = false
  @property({ type: Boolean }) accessor authUnavailable = false
  private authAttempt = 0
  @property({ type: Array }) accessor unreadNotifications: AppNotification[] = []
  @property({ type: Boolean }) accessor notificationBusy = false
  get appNotification() { return this.unreadNotifications[0] }
  @property({ type: Number }) accessor syncPending = 0
  @property({ type: Object }) accessor toast: {message:string;actionLabel?:string;action?:()=>void}|undefined
  @property({ type: Object }) accessor confirmation: ConfirmationRequest | undefined

  googleScriptLoaded = false
  googleScriptPromise: Promise<void> | null = null
  googleInitialized = false
  googlePromptAttempted = false
  timelineTracker = new TimelineTracker()
  timelinePreferenceListenerBound = false
  serviceWorkerRegistered = false
  notificationListenerBound = false
  private dismissedNotificationIds = new Set<string>()
  offlineSyncInitialized = false
  offlineListenerBound = false
  toastListenerBound = false
  confirmationListenerBound = false
  toastTimeout?: ReturnType<typeof setTimeout>
  subscribedDataTypes = new Set<string>()
  lastRouteHash = ''
  routeGuardBypass = false
  routeRequest?: AbortController

  capturePendingInvite() {
    const query = location.hash.split('?')[1]
    if (!query) return

    const params = new URLSearchParams(query)
    const inviteId = params.get('uuid')?.trim()
    const inviteEmail = params.get('email')?.trim().toLowerCase()

    try {
      if (inviteId) {
        sessionStorage.setItem('keepit.pendingInviteId', inviteId)
        if (inviteEmail) sessionStorage.setItem('keepit.pendingInviteEmail', inviteEmail)
        else sessionStorage.removeItem('keepit.pendingInviteEmail')
      }
    } catch {
      // Session storage can be unavailable in private browsing modes.
    }
  }

  pendingInviteRegistrationHash() {
    try {
      const inviteId = sessionStorage.getItem('keepit.pendingInviteId')
      const inviteEmail = sessionStorage.getItem('keepit.pendingInviteEmail')
      if (!inviteId) return '#!/register'

      const params = new URLSearchParams({ uuid: inviteId })
      if (inviteEmail) params.set('email', inviteEmail)
      return `#!/register?${params.toString()}`
    } catch {
      return '#!/register'
    }
  }

  registerServiceWorker() {
    if (!this.serviceWorkerRegistered && 'serviceWorker' in navigator) {
      this.serviceWorkerRegistered = true
      void navigator.serviceWorker.register('/service-worker.js').catch((error) => {
        this.serviceWorkerRegistered = false
        console.warn('Service worker registration failed', error)
      })
    }
  }

  syncTimelineTracker() {
    this.timelineTracker.suggestionsEnabled = this.user?.preferences?.locationSuggestionNotifications !== false
    if (this.userSignedIn && this.user?.preferences?.continuousTimelineLocation) {
      this.timelineTracker.start()
    } else {
      this.timelineTracker.stop()
    }
  }

  renderGoogleButton(target: HTMLElement) {
    const google = globalThis.google
    if (!google?.accounts?.id) return

    target.replaceChildren()
    google.accounts.id.renderButton(target, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      logo_alignment: 'left',
      width: Math.min(target.clientWidth || 320, 360)
    })
  }

  setupMediaQuery(query, callback) {
    const mediaQuery = window.matchMedia(query)
    const handleMediaQueryChange = callback
    mediaQuery.addEventListener('change', handleMediaQueryChange)
    handleMediaQueryChange(mediaQuery)
  }

  _onhashchange = async () => {
    const hash = location.hash
    if (this.routeGuardBypass) this.routeGuardBypass = false
    else if (this.lastRouteHash !== hash && hasUnsavedChanges()) {
      const previousHash = this.lastRouteHash
      history.replaceState(null, '', previousHash || location.pathname + location.search)
      if (await confirmAction({ title: 'Wijzigingen niet opgeslagen', message: 'Als je doorgaat, gaan de wijzigingen op deze pagina verloren.', confirmLabel: 'Wijzigingen negeren' }) && location.hash === previousHash) {
        clearUnsavedChanges()
        this.routeGuardBypass = true
        location.hash = hash
      }
      return
    }
    const { path, params, known } = parseWorkspaceRoute(hash)

    if (path === 'media' || path === 'projects') {
      location.hash = '#!/home'
      return
    }

    if (!this.userSignedIn) return
    if ((path === 'backups' || path === 'reports') && !this.user?.roles?.includes('admin')) {
      location.hash = '#!/home'
      return
    }

    this.routeRequest?.abort()
    const request = this.routeRequest = new AbortController()
    const isCurrent = () => !request.signal.aborted && location.hash === hash && this.userSignedIn
    this.lastRouteHash = hash
    this.routeLoading = true
    this.error = null
    this.selected = path
    this.isMenuOpen = false

    try {
      if (params.has('error')) throw new Error(params.get('error') || 'Er ging iets mis.')
      if (!known) throw new Error('Deze pagina bestaat niet.')
      if (!customElements.get(`${path}-view`)) await import(`./${path}-view.js`)
      if (!isCurrent()) return
      await this.loadRoute(path, params.get('selected'), request.signal, isCurrent)
    } catch (error) {
      if (!isCurrent()) return
      const destinations = {
        quote: ['Offertes', '#!/quotes'],
        job: ['Jobs', '#!/jobs'],
        invoice: ['Facturen', '#!/invoices']
      }
      const [label, href] = destinations[path] || ['Home', '#!/home']
      const message = error instanceof Error && !(error instanceof TypeError)
        ? error.message
        : 'Deze pagina kon niet geladen worden. Controleer je verbinding en probeer opnieuw.'
      this.error = { message, label: `Terug naar ${label}`, href }
    } finally {
      if (isCurrent()) {
        this.routeLoading = false
        requestAnimationFrame(() => {
          if (!isCurrent()) return
          const main = this.shadowRoot?.querySelector<HTMLElement>('main')
          if (main) main.scrollTop = 0
        })
      }
    }
  }

  async loadRoute(path: string, selected: string | null, signal: AbortSignal, isCurrent: () => boolean) {
    const promises: Promise<void>[] = []
    const load = (type: string, id?: string) => this._load(type, signal, isCurrent, id)
    if ((path === 'job' || path === 'invoice') && !selected) {
      throw new Error(path === 'job' ? 'Geen job geselecteerd.' : 'Geen factuur geselecteerd.')
    }

    if (path === 'invoices') {
      if (!this.invoices) promises.push(load('invoices'))
      if (!this.jobs) promises.push(load('jobs'))

      if (!this.companies) promises.push(load('companies'))
    }
    if (path === 'invoice') {
      promises.push(load('invoice', selected))
      if (!this.jobs) promises.push(load('jobs'))
      if (!this.companies) promises.push(load('companies'))
    }
    if (path === 'jobs') {
      if (!this.jobs) promises.push(load('jobs'))
      if (!this.companies) promises.push(load('companies'))
    }
    if (path === 'planning') {
      if (!this.jobs) promises.push(load('jobs'))
      promises.push(load('users'))
    }

    if (path === 'quote') {
      if (!this.jobs) promises.push(load('jobs'))
      if (!this.companies) promises.push(load('companies'))
      if (selected) promises.push(load('quote', selected))
      else this.quote = undefined
    }
    if (path === 'quotes') {
      promises.push(load('quotes'))
      if (!this.jobs) promises.push(load('jobs'))
      if (!this.companies) promises.push(load('companies'))
    }
    if (path === 'job') {
      promises.push(load('job', selected))
      if (!this.companies) promises.push(load('companies'))
      if (this.user?.roles?.includes('admin') && !this.users) promises.push(load('users'))
    }
    if (path === 'companies') {
      if (!this.companies) promises.push(load('companies'))
    }
    if (path === 'suppliers') {
      if (!this.companies) promises.push(load('companies'))
    }
    if (path === 'users' || path === 'reports') {
      promises.push(load('users'))
      if (path === 'reports' && !this.jobs) promises.push(load('jobs'))
    }
    if (path === 'home' || path === 'timeline' || path === 'sync') {
      if (!this.jobs) promises.push(load('jobs'))
    }
    if (path === 'checkin') {
      if (!this.jobs) promises.push(load('jobs'))
    }
    if (path === 'checkout') {
      if (!this.jobs) promises.push(load('jobs'))
    }

    await Promise.all(promises)
  }

  beforeRender(): void {
    this.registerServiceWorker()
    if (!this.notificationListenerBound) {
      this.notificationListenerBound = true
      window.addEventListener('online', () => {
        if (this.authUnavailable) this.checkUserStatus()
      })
      window.addEventListener('focus', () => void this.loadUnreadNotifications())
      navigator.serviceWorker?.addEventListener('message', (event) => {
        if (!this.userSignedIn || event.data?.type !== 'keepit-notification-open') return
        if (event.data.userId && event.data.userId !== this.user?.id) return
        const target = notificationTarget(event.data.target)
        if (target) location.hash = target
      })
    }
    if(!this.offlineSyncInitialized){this.offlineSyncInitialized=true;initializeOfflineSync()}
    if (!this.offlineListenerBound) {
      this.offlineListenerBound = true
      this.syncPending = getPendingWorkState().pending
      window.addEventListener('keepit-sync-status', (event: Event) => {
        this.syncPending = (event as CustomEvent).detail?.pending || 0
      })
      window.addEventListener('keepit-checkin-synced', (event: Event) => {
        const { requestId, prestationId, closed } = (event as CustomEvent).detail
        if (this.user?.currentPrestationId === `pending:${requestId}`) {
          this.user = { ...this.user, currentPrestationId: closed ? undefined : prestationId, currentJob: closed ? undefined : this.user.currentJob }
          pubsub.publishVerbose('user', this.user)
        }
      })
    }
    if(!this.toastListenerBound){this.toastListenerBound=true;window.addEventListener('keepit-toast',(event:Event)=>{this.toast=(event as CustomEvent).detail;if(this.toastTimeout)clearTimeout(this.toastTimeout);this.toastTimeout=setTimeout(()=>{this.toast=undefined},6000)})}
    if(!this.confirmationListenerBound){this.confirmationListenerBound=true;window.addEventListener('keepit-confirm',(event:Event)=>{this.confirmation?.resolve(false);this.confirmation=(event as CustomEvent<ConfirmationRequest>).detail;requestAnimationFrame(()=>this.shadowRoot?.querySelector<HTMLButtonElement>('.confirm-cancel')?.focus())})}
    if (!this.timelinePreferenceListenerBound) {
      window.addEventListener('keepit-timeline-preference', () => this.syncTimelineTracker())
      this.timelinePreferenceListenerBound = true
    }
    this.setupMediaQuery('(prefers-color-scheme: dark)', ({ matches }) => {
      this.darkMode = matches
    })

    this.setupMediaQuery('(min-width: 1200px)', ({ matches }) => {
      this.isNarrow = !matches
    })

    this.setupMediaQuery('(max-width: 960px)', ({ matches }) => {
      this.isMediumNarrow = matches
    })

    onhashchange = this._onhashchange
    this.checkUserStatus()
  }

  clearStoredAuth() {
    this.authAttempt++
    this.authUnavailable = false
    this.routeRequest?.abort()
    this.routeLoading = false
    this.error = null
    this.lastRouteHash = ''
    this.selected = undefined
    this.routeGuardBypass = false
    clearUnsavedChanges()
    localStorage.removeItem('token')
    localStorage.removeItem('ticket')
    this.googlePromptAttempted = false
    this.authResolving = false
    this.user = undefined
    this.userSignedIn = false
    this.unreadNotifications = []
    this.notificationBusy = false
    this.dismissedNotificationIds.clear()
    this.timelineTracker.stop()
    setOfflineActionOwner()
    this.requestRender()

    if (globalThis.client) {
      try {
        globalThis.client.close()
      } catch {
        // ignore websocket close errors during auth reset
      }
      globalThis.client = undefined
    }

    queueMicrotask(() => {
      void this.ensureGoogleSignInUi()
    })
  }

  async loadGoogleScript() {
    if (this.googleScriptLoaded) return
    if (this.googleScriptPromise) {
      await this.googleScriptPromise
      return
    }

    this.googleScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')

      if (existingScript) {
        this.googleScriptLoaded = true
        resolve()
        return
      }

      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.dataset.use_fedcm_for_prompts = 'true'
      script.addEventListener('load', () => {
        this.googleScriptLoaded = true
        resolve()
      })
      script.addEventListener('error', () => {
        reject(new Error('Google sign-in script kon niet geladen worden'))
      })
      document.head.appendChild(script)
    })

    await this.googleScriptPromise
  }

  async ensureGoogleSignInUi() {
    if (this.userSignedIn) return

    const target = this.shadowRoot?.getElementById('google-signin-anchor')
    if (!target) return

    await this.loadGoogleScript()

    const google = globalThis.google
    if (!google?.accounts?.id) return

    if (!this.googleInitialized) {
      google.accounts.id.initialize({
        client_id: '108028336132-s1j25jmsu1d222ovrabdk2kcbvkie474.apps.googleusercontent.com',
        callback: (response) => {
          if (response.credential) {
            void this.setUser(response.credential)
          }
        },
        auto_select: false,
        context: 'signin',
        itp_support: true,
        use_fedcm_for_prompt: true
      })
      this.googleInitialized = true
    }

    if (this.googlePromptAttempted) {
      this.renderGoogleButton(target)
      return
    }

    this.googlePromptAttempted = true
    target.replaceChildren()
    google.accounts.id.prompt((notification) => {
      if (!notification) {
        this.renderGoogleButton(target)
        return
      }

      if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.() || notification.isDismissedMoment?.()) {
        this.renderGoogleButton(target)
      }
    })
  }

  checkUserStatus() {
    const token = localStorage.getItem('token')
    if (token) {
      let user

      try {
        user = this._decodeToken(token)
      } catch {
        this.clearStoredAuth()
        return
      }

      if (user.expires < Date.now() / 1000) {
        this.clearStoredAuth()
      } else {
        this.authResolving = true
        this.requestRender()
        void this.setUser(token)
      }
    } else {
      this.authResolving = false
      this.googlePromptAttempted = false
      this.userSignedIn = false
      this.requestRender()
      queueMicrotask(() => {
        void this.ensureGoogleSignInUi()
      })
    }
  }

  private getProfilePictureCacheKey(pictureUrl: string): string {
    return `profile-picture:${encodeURIComponent(pictureUrl)}`
  }

  private getCachedProfilePicture(pictureUrl: string): string | null {
    try {
      return localStorage.getItem(this.getProfilePictureCacheKey(pictureUrl))
    } catch {
      return null
    }
  }

  private setCachedProfilePicture(pictureUrl: string, dataUrl: string): void {
    try {
      localStorage.setItem(this.getProfilePictureCacheKey(pictureUrl), dataUrl)
    } catch {
      // ignore storage quota and private mode failures
    }
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result)
          return
        }

        reject(new Error('Failed to convert image blob to data URL'))
      }
      reader.onerror = () => {
        reject(new Error('Failed to read image blob'))
      }
      reader.readAsDataURL(blob)
    })
  }

  private async cacheProfilePicture(pictureUrl?: string): Promise<string | undefined> {
    if (!pictureUrl) return pictureUrl

    const cached = this.getCachedProfilePicture(pictureUrl)
    if (cached) return cached

    try {
      const response = await fetch(pictureUrl, { signal: AbortSignal.timeout(3000) })

      if (!response.ok) return pictureUrl

      const dataUrl = await this.blobToDataUrl(await response.blob())
      this.setCachedProfilePicture(pictureUrl, dataUrl)
      return dataUrl
    } catch {
      return pictureUrl
    }
  }

  _decodeToken(credential) {
    const decodedCredential = JSON.parse(atob(credential.split('.')[1]))
    return {
      id: decodedCredential.sub,
      name: decodedCredential.name,
      picture: decodedCredential.picture,
      email: decodedCredential.email,
      expires: decodedCredential.exp
    }
  }

  initWSClient() {
    let clientTimeout
    if (globalThis.client) return

    const websocketProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const client = new WebSocket(`${websocketProtocol}//${location.host}/ws`, [
      `ticket__${localStorage.getItem('ticket')}`
    ])
    globalThis.client = client
    client.addEventListener('open', () => {
      if (this.user?.id) {
        client.send(JSON.stringify({ type: 'pubsub', params: { subscribe: 'users.changed' } }))
        if (this.user?.roles?.some((role) => role === 'admin' || role === 'roles')) {
          client.send(JSON.stringify({ type: 'pubsub', params: { subscribe: 'invites.changed' } }))
        }
        client.send(JSON.stringify({ type: 'pubsub', params: { subscribe: `notifications.${this.user.id}` } }))
        void this.loadUnreadNotifications()
      }
    })

    client.addEventListener('message', (event) => {
      const { type, params, message } = JSON.parse(event.data)
      if (type === 'error') {
        if (message === 'Ticket session expired') {
          localStorage.removeItem('ticket')
          this.userSignedIn = false
          this.checkUserStatus()
        }
        return
      } else if (type === 'pubsub' && params.publish === `notifications.${this.user?.id}`) {
        void this.handleAppNotification(params.value)
      } else if (type === 'pubsub' && params.publish === 'users.changed') {
        // The socket sends only the signed-in user's record, not the team roster.
        const id = this.user?.id
        const changed = id && params.value?.[id]
        if (changed) {
          const user = { ...this.user, ...changed }
          const pending = getPendingWorkState(changed.currentJob, changed.currentPrestationId)
          user.currentJob = pending.currentJob
          user.currentPrestationId = pending.currentPrestationId
          this.user = user
          this.syncTimelineTracker()
          pubsub.publishVerbose('user', user)
          if (this.users?.[id]) {
            this.users = { ...this.users, [id]: { ...this.users[id], name: user.name, roles: user.roles, picture: user.picture } }
          }
        }
        window.dispatchEvent(new Event('keepit-team-changed'))
      } else if (type === 'pubsub' && params.publish === 'invites.changed') {
        window.dispatchEvent(new Event('keepit-team-changed'))
      } else if (type === 'pubsub') {
        pubsub.publishVerbose(params.publish, params.value)
      }
    })

    client.addEventListener('close', () => {
      if (globalThis.client === client) globalThis.client = undefined
      if (clientTimeout) clearTimeout(clientTimeout)
      clientTimeout = setTimeout(() => {
        if (this.userSignedIn) this.initWSClient()
      }, 5000)
    })
  }

  private mergeNotifications(incoming: AppNotification[]) {
    const id = this.user?.id
    if (!id || !this.userSignedIn) return
    this.unreadNotifications = mergeUnreadNotifications(this.unreadNotifications, incoming, id, this.dismissedNotificationIds)
  }

  async handleAppNotification(notification: AppNotification) {
    if (!notification?.id || notification.userId !== this.user?.id || !this.userSignedIn) return
    if (this.dismissedNotificationIds.has(notification.id) || this.unreadNotifications.some((item) => item.id === notification.id)) return
    this.mergeNotifications([notification])

    const target = notificationTarget(notification.url)
    if (!target || !('Notification' in window) || Notification.permission !== 'granted') return
    const options: NotificationOptions = {
      body: notification.message, icon: '/assets/dimac.svg', badge: '/assets/dimac.svg',
      tag: notification.id, data: { url: target, notificationId: notification.id, userId: notification.userId }
    }
    try {
      const registration = await navigator.serviceWorker?.getRegistration()
      if (!this.userSignedIn || notification.userId !== this.user?.id ||
        !this.unreadNotifications.some((item) => item.id === notification.id)) return
      if (registration?.active) await registration.showNotification(notification.title, options)
      else {
        const browserNotification = new Notification(notification.title, options)
        browserNotification.onclick = () => {
          if (!this.userSignedIn || this.user?.id !== notification.userId) return
          window.focus()
          location.hash = target
        }
      }
    } catch {
      // The notification stays visible in Keepit if browser delivery fails.
    }
  }

  async dismissAppNotification(navigate = false) {
    const notification = this.appNotification
    if (!notification || this.notificationBusy) return
    this.notificationBusy = true
    try {
      await api.markNotificationRead(notification.id)
      if (!this.userSignedIn || notification.userId !== this.user?.id) return
      this.dismissedNotificationIds.add(notification.id)
      this.unreadNotifications = this.unreadNotifications.filter((item) => item.id !== notification.id)
      const target = notificationTarget(notification.url)
      if (navigate && target) location.hash = target
    } catch {
      if (notification.userId === this.user?.id) {
        window.dispatchEvent(new CustomEvent('keepit-toast', { detail: { message: 'De melding kon niet als gelezen worden gemarkeerd. Probeer opnieuw.' } }))
      }
    } finally {
      if (notification.userId === this.user?.id) this.notificationBusy = false
    }
  }

  async enableAppNotifications() {
    if (!('Notification' in window)) return
    await Notification.requestPermission().catch(() => undefined)
    this.requestRender()
  }

  async loadUnreadNotifications() {
    const userId = this.user?.id
    if (!this.userSignedIn || !userId) return
    try {
      const unread = await api.getNotifications(true)
      if (this.user?.id === userId) this.mergeNotifications(unread)
    } catch (error) {
      console.warn('Notifications could not be loaded', error)
    }
  }

  async setUser(credential) {
    const attempt = ++this.authAttempt
    const current = () => attempt === this.authAttempt && localStorage.getItem('token') === credential
    this.authResolving = true
    this.authUnavailable = false
    this.capturePendingInvite()
    const token = localStorage.getItem('token')
    if ((token && token !== credential) || !token) localStorage.setItem('token', credential)

    try {
      let user
      try { user = this._decodeToken(credential) }
      catch { this.clearStoredAuth(); return }
      if (!navigator.onLine) throw new Error('Offline')
      const signal = AbortSignal.timeout(12_000)
      const handshakeData = await api.getHandshake(signal)
      if (!current()) return

      if (handshakeData === 'NOT_REGISTERED') {
        user.picture = (await this.cacheProfilePicture(user.picture)) || user.picture
        if (!current()) return
        this.user = user
        this.userSignedIn = true
        this.authResolving = false
        const registrationHash = this.pendingInviteRegistrationHash()
        if (location.hash === registrationHash) void this._onhashchange()
        else location.hash = registrationHash
        return
      }

      const userData = await api.getUser(user.id, signal)
      if (!current()) return
      if (!userData || typeof userData !== 'object' || Array.isArray(userData) || !Object.keys(userData).length ||
          typeof handshakeData !== 'string' || !handshakeData.trim()) {
        throw new Error('Ongeldig antwoord bij aanmelden.')
      }
      localStorage.setItem('ticket', handshakeData)
      const mergedUser = { ...user, ...userData }
      setOfflineActionOwner(user.id)
      const pendingWork = getPendingWorkState(mergedUser.currentJob, mergedUser.currentPrestationId)
      mergedUser.currentJob = pendingWork.currentJob
      mergedUser.currentPrestationId = pendingWork.currentPrestationId
      mergedUser.picture = (await this.cacheProfilePicture(mergedUser.picture)) || mergedUser.picture
      if (!current()) return
      this.user = mergedUser
      this.userSignedIn = true
      void flushOfflineActions()
      this.authResolving = false
      this.syncTimelineTracker()
      void this.loadUnreadNotifications()

      globalThis.google?.accounts?.id?.cancel?.()
      /**
       * since we are blocking the route change until the user is signed in
       * we can safely assume that the user is signed in
       * and we can load the data
       */

      if (!location.hash) {
        location.hash = '#!/home'
      } else {
        void this._onhashchange()
      }

      this.initWSClient()
    } catch (error) {
      if (!current()) return
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        this.clearStoredAuth()
        return
      }
      this.authResolving = false
      this.authUnavailable = true
      this.userSignedIn = false
      this.timelineTracker.stop()
      setOfflineActionOwner()
    }
  }

  static styles = [styles]

  async _load(type: string, signal: AbortSignal, isCurrent: () => boolean, uuid?: string) {
    if (uuid) this[type] = undefined
    const endpoint = type === 'quote' ? 'quotes' : type
    const token = localStorage.getItem('token')
    const response = await fetch(uuid ? `/api/${endpoint}/${encodeURIComponent(uuid)}` : `/api/${endpoint}`, {
      method: 'GET',
      signal,
      headers: token ? { Authorization: token } : undefined
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      if (response.status === 403 && body?.error === 'Forbidden, register first') {
        if (isCurrent()) location.hash = this.pendingInviteRegistrationHash()
        return
      }
      if (response.status === 404) {
        const missing = { quote: 'Offerte niet gevonden.', job: 'Job niet gevonden.', invoice: 'Factuur niet gevonden.' }
        if (missing[type]) throw new Error(missing[type])
      }
      throw new Error('De gegevens konden niet geladen worden. Probeer het opnieuw.')
    }
    const data = await response.json()
    if (!isCurrent()) return
    if (!uuid && type !== 'users' && !this.subscribedDataTypes.has(type)) {
      pubsub.subscribe(`${type}.changed`, (value) => {
        this[type] = value
      })
      this.subscribedDataTypes.add(type)
    }
    this[type] = type === 'quote' ? { ...data, id: uuid } : data
  }

  onChange(propertyKey: string, value: any): void {
    void propertyKey
    void value
  }

  renderSelectedView() {
    const path = this.selected

    if (this.error) {
      return html`
        <error-animation
          .message=${this.error.message}
          .action=${this.error}></error-animation>
      `
    }

    if (!this.userSignedIn) {
      if (this.authResolving) {
        return html` <loading-view type="loading"></loading-view> `
      }
      if (this.authUnavailable) {
        return html`<section class="signed-out-shell"><div class="signed-out-panel">
          <h1>Keepit is niet bereikbaar</h1>
          <p role="status">Je aanmelding en lokaal opgeslagen uren blijven bewaard. Probeer opnieuw zodra je verbinding terug is.</p>
          <button class="global-search-trigger" type="button" @click=${() => this.checkUserStatus()}>Opnieuw proberen</button>
        </div></section>`
      }

      queueMicrotask(() => {
        void this.ensureGoogleSignInUi()
      })

      return html`
        <section class="signed-out-shell">
          <div class="signed-out-panel">
            <div class="signed-out-brand-row">
              <div class="signed-out-brand">
                <img
                  class="signed-out-logo"
                  loading="lazy"
                  src=${this.darkMode ? '/assets/dimac-dark.svg' : '/assets/dimac.svg'}
                  alt="Dimac" />
                <div class="signed-out-brand-copy">
                  <span class="signed-out-kicker">Keepit Access</span>
                  <span class="signed-out-subkicker">Projecten, media en planning in een centrale workspace</span>
                </div>
              </div>

              <span class="signed-out-status">Beveiligde toegang</span>
            </div>

            <div class="signed-out-hero-copy">
              <h1>Keepit Workspace</h1>
              <p>Meld je aan met Google om verder te werken.</p>
            </div>

            <div class="signed-out-highlights">
              <div class="signed-out-highlight">
                <strong>Werkbeheer</strong>
                <span>Beheer jobs, medewerkers, klanten en planning vanuit één vaste flow.</span>
              </div>
              <div class="signed-out-highlight">
                <strong>Uren en facturen</strong>
                <span>Beheer check-ins, check-outs en facturen op één centrale plek.</span>
              </div>
            </div>

            <div class="signed-out-signin">
              <div id="google-signin-anchor"></div>
              <span class="signed-out-footnote">Gebruik het Google account dat toegang heeft tot Keepit.</span>
            </div>
          </div>
        </section>
      `
    }

    if (this.routeLoading || !path) return html` <loading-view type="loading"></loading-view> `

    if (path === 'home') {
      return html` <home-view></home-view> `
    }

    if (path === 'quote') {
      return html` <quote-view
        @quote-url-replaced=${() => { this.lastRouteHash = location.hash }}
        .quote=${this.quote}
        .jobs=${this.jobs || {}}></quote-view>`
    }

    if (path === 'quotes') {
      if (!this.quotes) return html` <loading-view type="loading"></loading-view> `
      return html` <quotes-view
        .quotes=${this.quotes}
        .jobs=${this.jobs}></quotes-view>`
    }

    if (path === 'register') {
      return html` <register-view></register-view> `
    }
    if (path === 'users') {
      return html` <users-view></users-view> `
    }
    if (path === 'invoices') {
      if (!this.invoices) {
        return html` <loading-view type="loading"></loading-view> `
      }
      const { params } = parseWorkspaceRoute(location.hash)
      return html`
        <invoices-view
          .createForJob=${params.get('create') === '1' ? params.get('job') || '' : ''}
          .invoices=${this.invoices}
          .jobs=${this.jobs}
          .companies=${this.companies}></invoices-view>
      `
    }

    if (path === 'invoice') {
      if (!this.invoice) {
        return html` <loading-view type="loading"></loading-view> `
      }
      return html`
        <invoice-view
          .invoice=${this.invoice}
          .jobs=${this.jobs}
          .companies=${this.companies}></invoice-view>
      `
    }

    if (path === 'checkin') {
      return html` <checkin-view></checkin-view> `
    }

    if (path === 'checkout') {
      return html` <checkout-view></checkout-view> `
    }

    if (path === 'timeline') {
      return html` <timeline-view></timeline-view> `
    }

    if (path === 'companies') {
      if (!this.companies) {
        return html` <loading-view type="loading"></loading-view> `
      }
      return html` <companies-view></companies-view> `
    }

    if (path === 'suppliers') {
      if (!this.companies) {
        return html` <loading-view type="loading"></loading-view> `
      }
      return html` <suppliers-view></suppliers-view> `
    }

    if (path === 'shop') {
      return html` <shop-view></shop-view> `
    }

    if (path === 'jobs') {
      if (!this.jobs || !this.companies) {
        return html` <loading-view type="loading"></loading-view> `
      }
      return html` <jobs-view .createOnOpen=${parseWorkspaceRoute(location.hash).params.get('create') === '1'}></jobs-view> `
    }

    if (path === 'planning') {
      if (!this.jobs || !this.users) {
        return html` <loading-view type="loading"></loading-view> `
      }
      return html` <planning-view .createOnOpen=${parseWorkspaceRoute(location.hash).params.get('create') === '1'}></planning-view> `
    }

    if (path === 'backups') {
      if (!this.user?.roles?.includes('admin')) return html` <home-view></home-view> `
      return html` <backups-view></backups-view> `
    }

    if (path === 'sync') return html` <sync-view></sync-view> `
    if (path === 'reports') return this.user?.roles?.includes('admin') ? html`<reports-view></reports-view>` : html`<home-view></home-view>`

    if (path === 'job') {
      if (!this.job || !this.companies) {
        return html` <loading-view type="loading"></loading-view> `
      }
      return html` <job-view></job-view> `
    }
  }

  private drawerTrigger?: HTMLElement

  _toggleMenu(trigger?: HTMLElement) {
    if (this.isMenuOpen) return this._closeMenu(true)
    this.drawerTrigger = trigger
    this.isMenuOpen = true
    void this.rendered.then(() => {
      if (this.isMenuOpen) this.shadowRoot?.querySelector<HTMLElement>('.drawer-close')?.focus()
    })
  }

  navLink(path: string, icon: string, label: string, subpage?: string) {
    const current = this.selected === path
    const active = current || (subpage && this.selected === subpage)
    return html`<a href=${'#!/' + path} class=${active ? 'nav-item active' : 'nav-item'}
      aria-current=${current ? 'page' : active ? 'location' : 'false'}><custom-icon icon=${icon}></custom-icon><span>${label}</span></a>`
  }

  _closeMenu(restoreFocus = false) {
    this.isMenuOpen = false
    if (restoreFocus) void this.rendered.then(() => {
      if (!this.isMenuOpen) this.drawerTrigger?.focus()
    })
  }

  resolveConfirmation(confirmed: boolean) {
    const request = this.confirmation
    this.confirmation = undefined
    request?.resolve(confirmed)
  }

  handleConfirmationKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      this.resolveConfirmation(false)
      return
    }
    if (event.key !== 'Tab') return
    const buttons = Array.from(this.shadowRoot?.querySelectorAll<HTMLButtonElement>('.confirm-dialog button') || [])
    if (!buttons.length) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && this.shadowRoot?.activeElement === first) {
      event.preventDefault(); last.focus()
    } else if (!event.shiftKey && this.shadowRoot?.activeElement === last) {
      event.preventDefault(); first.focus()
    }
  }

  render() {
    return html`
      <!-- @build-info -->
      ${icons}
      ${this.userSignedIn ? html`<global-search .enabled=${true}></global-search>` : ''}
      ${this.toast?html`<section class="app-toast" role="status"><span>${this.toast.message}</span>${this.toast.action?html`<button @click=${async()=>{await this.toast?.action?.();this.toast=undefined}}>${this.toast.actionLabel||'Ongedaan maken'}</button>`:''}<button class="toast-close" aria-label="Melding sluiten" @click=${()=>this.toast=undefined}><custom-icon icon="close"></custom-icon></button></section>`:''}
      ${this.confirmation?html`<div class="confirm-layer" @keydown=${(event:KeyboardEvent)=>this.handleConfirmationKeydown(event)}><button class="confirm-backdrop" aria-label="Annuleren" tabindex="-1" @click=${()=>this.resolveConfirmation(false)}></button><section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message"><span class="confirm-icon"><custom-icon icon="warning"></custom-icon></span><div class="confirm-copy"><h2 id="confirm-title">${this.confirmation.title}</h2><p id="confirm-message">${this.confirmation.message}</p></div><div class="confirm-actions"><button class="confirm-cancel" @click=${()=>this.resolveConfirmation(false)}>${this.confirmation.cancelLabel||'Annuleren'}</button><button class="confirm-primary" @click=${()=>this.resolveConfirmation(true)}>${this.confirmation.confirmLabel||'Verwijderen'}</button></div></section></div>`:''}
      ${this.userSignedIn && this.appNotification
        ? html`<section
            class="notification-toast"
            aria-live="polite">
            <span class="notification-icon"><custom-icon icon="calendar_month"></custom-icon></span>
            <div class="notification-copy">
              <strong>${this.appNotification.title}${this.unreadNotifications.length > 1 ? ` · +${this.unreadNotifications.length - 1} ongelezen` : ''}</strong>
              <span>${this.appNotification.message}</span>
              <div class="notification-actions">
                <button
                  ?disabled=${this.notificationBusy}
                  @click=${() => this.dismissAppNotification(true)}>
                  Bekijk planning
                </button>
                ${'Notification' in window && Notification.permission === 'default'
                  ? html`<button
                      class="quiet"
                      @click=${() => this.enableAppNotifications()}>
                      Meldingen aanzetten
                    </button>`
                  : ''}
              </div>
            </div>
            <button
              class="notification-close"
              aria-label="Melding sluiten"
              ?disabled=${this.notificationBusy}
              @click=${() => this.dismissAppNotification()}>
              <custom-icon icon="close"></custom-icon>
            </button>
          </section>`
        : ''}

      <custom-theme
        load-symbols="false"
        load-fonts="false"></custom-theme>

      ${this.userSignedIn
        ? html`<custom-icon-button
            class="menu-toggle"
            icon="menu"
            aria-label="Menu openen"
            aria-controls="app-navigation"
            aria-expanded=${this.isMenuOpen ? 'true' : 'false'}
            @click=${(event: Event) => this._toggleMenu(event.currentTarget as HTMLElement)}></custom-icon-button>`
        : ''}
      ${this.userSignedIn
        ? html`<button
              class="drawer-backdrop"
              aria-label="Menu sluiten"
              @click=${() => this._closeMenu(true)}></button>
            <aside
              id="app-navigation"
              aria-label="Hoofdnavigatie"
              ?inert=${this.isNarrow && !this.isMenuOpen}
              @keydown=${(event: KeyboardEvent) => {
                if (event.key === 'Escape') this._closeMenu(true)
              }}>
              <div class="drawer-head">
                <span>Menu</span>
                <custom-icon-button
                  class="drawer-close"
                  icon="close"
                  aria-label="Menu sluiten"
                  @click=${() => this._closeMenu(true)}></custom-icon-button>
              </div>
              <nav
                class="nav-container"
                aria-label="Hoofdnavigatie"
                @click=${() => this._closeMenu()}>
                <section
                  class="nav-section"
                  aria-labelledby="nav-overview">
                  <h2
                    id="nav-overview"
                    class="nav-section-label">
                    Overzicht
                  </h2>
                  <a
                    href="#!/home"
                    aria-current=${this.selected === 'home' ? 'page' : undefined}
                    class=${this.selected === 'home' ? 'nav-item active' : 'nav-item'}
                    ><custom-icon icon="home"></custom-icon>Home</a
                  >
                  <a
                    href="#!/timeline"
                    aria-current=${this.selected === 'timeline' ? 'page' : undefined}
                    class=${this.selected === 'timeline' ? 'nav-item active' : 'nav-item'}
                    ><custom-icon icon="timeline"></custom-icon>Mijn tijdlijn</a
                  >
                </section>
                <section
                  class="nav-section"
                  aria-labelledby="nav-work">
                  <h2
                    id="nav-work"
                    class="nav-section-label">
                    Werk
                  </h2>
                  ${this.navLink('jobs', 'work', 'Jobs', 'job')}
                  <a
                    href="#!/planning"
                    aria-current=${this.selected === 'planning' ? 'page' : undefined}
                    class=${this.selected === 'planning' ? 'nav-item active' : 'nav-item'}
                    ><custom-icon icon="calendar_month"></custom-icon>Planning</a
                  >
                </section>
                ${this.user?.roles?.includes('admin') ? html`<section class="nav-section" aria-labelledby="nav-finance">
                  <h2 id="nav-finance" class="nav-section-label">Facturatie</h2>
                  ${this.navLink('quotes', 'request_quote', 'Offertes', 'quote')}
                  ${this.navLink('invoices', 'receipt', 'Facturen', 'invoice')}
                </section>` : ''}
                ${this.user?.roles?.includes('admin') ? html`<section
                  class="nav-section"
                  aria-labelledby="nav-organization">
                  <h2
                    id="nav-organization"
                    class="nav-section-label">
                    Organisatie
                  </h2>
                  <a
                    href="#!/companies"
                    aria-current=${this.selected === 'companies' ? 'page' : undefined}
                    class=${this.selected === 'companies' ? 'nav-item active' : 'nav-item'}
                    ><custom-icon icon="source_environment"></custom-icon>Klanten</a
                  >
                  <a
                    href="#!/suppliers"
                    aria-current=${this.selected === 'suppliers' ? 'page' : undefined}
                    class=${this.selected === 'suppliers' ? 'nav-item active' : 'nav-item'}
                    ><custom-icon icon="local_shipping"></custom-icon>Leveranciers</a
                  >
                  <a
                    href="#!/shop"
                    aria-current=${this.selected === 'shop' ? 'page' : undefined}
                    class=${this.selected === 'shop' ? 'nav-item active' : 'nav-item'}
                    ><custom-icon icon="storefront"></custom-icon>Shop</a
                  >
                  <a
                    href="#!/users"
                    aria-current=${this.selected === 'users' ? 'page' : undefined}
                    class=${this.selected === 'users' ? 'nav-item active' : 'nav-item'}
                    ><custom-icon icon="group"></custom-icon>Team</a
                  >
                  <a href="#!/backups" aria-current=${this.selected === 'backups' ? 'page' : undefined} class=${this.selected === 'backups' ? 'nav-item active' : 'nav-item'}><custom-icon icon="backup"></custom-icon>Back-ups</a>
                  <a href="#!/reports" aria-current=${this.selected === 'reports' ? 'page' : undefined} class=${this.selected === 'reports' ? 'nav-item active' : 'nav-item'}><custom-icon icon="analytics"></custom-icon>Rapporten</a>
                </section>` : ''}
              </nav>
              <div class="drawer-bottom"><div class="drawer-profile">${this.user?.picture?html`<img src=${this.user.picture} alt="" referrerpolicy="no-referrer" />`:html`<span class="drawer-avatar">${this.user?.name?.trim().charAt(0).toUpperCase()||'U'}</span>`}<div class="drawer-profile-copy"><strong>${this.user?.name||'Gebruiker'}</strong><span>${this.user?.roles?.includes('admin')?'Administrator':'Medewerker'}</span></div></div><build-info></build-info></div>
            </aside>`
        : ''}

      ${this.userSignedIn ? html`<nav class="mobile-bottom-nav" aria-label="Snelle navigatie" ?inert=${this.isNarrow && this.isMenuOpen}>
        ${this.navLink('home', 'home', 'Home')}
        ${this.navLink('jobs', 'work', 'Jobs', 'job')}
        <a class="work-action" href=${this.user?.currentJob ? '#!/checkout' : '#!/checkin'}
          aria-current=${this.selected === 'checkin' || this.selected === 'checkout' ? 'page' : 'false'}>
          <custom-icon icon=${this.user?.currentJob ? 'stop_circle' : 'play_arrow'}></custom-icon><span>${this.user?.currentJob ? 'Stop' : 'Start'}</span>
        </a>
        ${this.navLink('planning', 'calendar_month', 'Planning')}
        <button type="button" aria-controls="app-navigation" aria-expanded=${this.isMenuOpen ? 'true' : 'false'} @click=${(event: Event) => this._toggleMenu(event.currentTarget as HTMLElement)}>
          <custom-icon icon="menu"></custom-icon><span>Meer</span>
        </button>
      </nav>` : ''}

      <main ?inert=${this.isNarrow && this.isMenuOpen}>
        ${this.userSignedIn
        ? html`<header>
              ${this.syncPending?html`<a class="offline-status" href="#!/sync"><custom-icon icon="cloud_upload"></custom-icon>${this.syncPending} wacht${this.syncPending===1?'':'en'} op synchronisatie</a>`:''}
              <button class="global-search-trigger" aria-label="Zoeken" @click=${()=>window.dispatchEvent(new Event('keepit-open-search'))}><custom-icon icon="search"></custom-icon><span>Zoeken</span><kbd>⌘ K</kbd></button>
              <account-bar></account-bar>
            </header>`
          : ''}
        <flex-container> ${this.renderSelectedView()} </flex-container>
      </main>
    `
  }
}
customElements.define('app-shell', AppShell)
