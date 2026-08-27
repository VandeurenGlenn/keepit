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
import { api } from './api/client.js'
import { TimelineTracker } from './helpers/timeline-tracker.js'
import type { AppNotification } from '../types/index.js'
import { flushOfflineActions, getPendingWorkState, initializeOfflineSync } from './helpers/offline-actions.js'
import type { ConfirmationOptions } from './helpers/confirmation.js'
import { confirmAction } from './helpers/confirmation.js'
import { clearUnsavedChanges, hasUnsavedChanges } from './helpers/unsaved-changes.js'

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

  @property({ type: Object, consumes: true }) accessor error = null
  @property({ type: Boolean, attribute: 'is-menu-open', reflect: true }) accessor isMenuOpen = false
  @property({ type: Boolean, attribute: 'auth-resolving' }) accessor authResolving = false
  @property({ type: Object }) accessor appNotification: AppNotification | undefined
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
  offlineSyncInitialized = false
  offlineListenerBound = false
  toastListenerBound = false
  confirmationListenerBound = false
  toastTimeout?: ReturnType<typeof setTimeout>
  subscribedDataTypes = new Set<string>()
  lastRouteHash = ''
  routeGuardBypass = false

  capturePendingInvite() {
    const query = location.hash.split('?')[1]
    if (!query) return

    const params = new URLSearchParams(query)
    const inviteId = params.get('uuid')?.trim()
    const inviteEmail = params.get('email')?.trim().toLowerCase()

    try {
      if (inviteId) sessionStorage.setItem('keepit.pendingInviteId', inviteId)
      if (inviteEmail) sessionStorage.setItem('keepit.pendingInviteEmail', inviteEmail)
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
    else if (this.lastRouteHash && hash !== this.lastRouteHash && hasUnsavedChanges()) {
      history.replaceState(null, '', this.lastRouteHash)
      if (await confirmAction({ title: 'Wijzigingen niet opgeslagen', message: 'Als je doorgaat, gaan de wijzigingen op deze pagina verloren.', confirmLabel: 'Wijzigingen negeren' })) {
        clearUnsavedChanges()
        this.routeGuardBypass = true
        location.hash = hash
      }
      return
    }
    const path = (hash.split('!/')[1] || 'home').split('?')[0]

    if (path === 'media' || path === 'projects') {
      location.hash = '#!/home'
      return
    }

    const params =
      hash
        .split('?')?.[1]
        ?.split('&')
        .reduce<Record<string, string>>(
          (acc, param) => {
            const [key, value] = param.split('=')
            acc[key] = decodeURIComponent(value)
            return acc
          },
          {} as Record<string, string>
        ) || {}

    if (params.error) {
      this.error = { message: params.error, label: 'Terug naar home', href: '#!/home' }
      this.requestRender()
      return
    } else {
      this.error = null
    }

    if (!(await customElements.get(`${path}-view`))) await import(`./${path}-view.js`)

    const promises = []

    if (!this.userSignedIn) return

    if (path === 'invoices') {
      if (!this.invoices) promises.push(this._load('invoices'))
      if (!this.jobs) promises.push(this._load('jobs'))

      if (!this.companies) promises.push(this._load('companies'))
    }
    if (path === 'invoice') {
      promises.push(this._load('invoice', params.selected))
    }
    if (path === 'jobs') {
      if (!this.jobs) promises.push(this._load('jobs'))
    }
    if (path === 'planning') {
      if (!this.jobs) promises.push(this._load('jobs'))
      if (!this.users) promises.push(this._load('users'))
    }

    if (path === 'backups' && !this.user?.roles?.includes('admin')) {
      location.hash = '#!/home'
      return
    }
    if (path === 'quote') {
      if (!this.jobs) promises.push(this._load('jobs'))
      if (!this.companies) promises.push(this._load('companies'))
      if (params.selected) {
        promises.push(
          api.getQuote(params.selected).then((quote) => {
            this.quote = quote
          })
        )
      } else {
        this.quote = undefined
      }
    }
    if (path === 'quotes') {
      promises.push(this._load('quotes'))
      if (!this.jobs) promises.push(this._load('jobs'))
      if (!this.companies) promises.push(this._load('companies'))
    }
    if (path === 'job') {
      promises.push(this._load('job', params.selected))
    }
    if (path === 'companies') {
      if (!this.companies) promises.push(this._load('companies'))
    }
    if (path === 'suppliers') {
      if (!this.companies) promises.push(this._load('companies'))
    }
    if (path === 'users' || path === 'reports') {
      if (!this.users) promises.push(this._load('users'))
      if (path === 'reports' && !this.jobs) promises.push(this._load('jobs'))
    }
    if (path === 'home' || path === 'timeline' || path === 'sync') {
      if (!this.jobs) promises.push(this._load('jobs'))
    }
    if (path === 'checkin') {
      if (!this.jobs) promises.push(this._load('jobs'))
    }
    if (path === 'checkout') {
      if (!this.jobs) promises.push(this._load('jobs'))
    }

    await Promise.all(promises)

    this.selected = path
    this.lastRouteHash = hash
  }

  beforeRender(): void {
    this.registerServiceWorker()
    if(!this.offlineSyncInitialized){this.offlineSyncInitialized=true;initializeOfflineSync()}
    if(!this.offlineListenerBound){this.offlineListenerBound=true;this.syncPending=getPendingWorkState().pending;window.addEventListener('keepit-sync-status',(event:Event)=>{this.syncPending=(event as CustomEvent).detail?.pending||0})}
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
    localStorage.removeItem('token')
    localStorage.removeItem('ticket')
    this.googlePromptAttempted = false
    this.authResolving = false
    this.user = undefined
    this.userSignedIn = false
    this.appNotification = undefined
    this.notificationListenerBound = false
    this.timelineTracker.stop()
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
      const response = await fetch(pictureUrl)

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
    console.log(client)
    globalThis.client = client
    client.addEventListener('open', () => {
      pubsub.subscribe(`users.changed`, (value) => {
        if (!Array.isArray(value)) {
          const user = { ...this.user, ...value }
          pubsub.publishVerbose(`user`, user)
        }
      })
      if (!this.notificationListenerBound) {
        pubsub.subscribe(`notifications.${this.user.id}`, (notification) => this.handleAppNotification(notification))
        this.notificationListenerBound = true
      }
      setTimeout(() => {
        client.send(JSON.stringify({ type: 'pubsub', params: { subscribe: 'users.changed' } }))
        client.send(JSON.stringify({ type: 'pubsub', params: { subscribe: `notifications.${this.user.id}` } }))
      }, 50)
    })

    client.addEventListener('message', (event) => {
      const { type, params, message } = JSON.parse(event.data)
      console.log('WebSocket message received:', type, params, message)
      if (type === 'error') {
        if (message === 'Ticket session expired') {
          localStorage.removeItem('ticket')
          this.userSignedIn = false
          this.checkUserStatus()
        }
        return
      } else if (type === 'pubsub') {
        pubsub.publishVerbose(params.publish, params.value)
      }
    })

    client.addEventListener('close', () => {
      console.log('WebSocket connection closed, reconnecting in 5 seconds...')
      if (clientTimeout) clearTimeout(clientTimeout)
      clientTimeout = setTimeout(() => {
        this.initWSClient()
      }, 5000)
    })
  }

  async handleAppNotification(notification: AppNotification) {
    if (!notification) return
    this.appNotification = notification
    this.requestRender()

    if ('Notification' in window && Notification.permission === 'granted') {
      const options: NotificationOptions = {
        body: notification.message,
        icon: '/assets/dimac.svg',
        badge: '/assets/dimac.svg',
        tag: notification.id,
        data: { url: notification.url }
      }
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready
        await registration.showNotification(notification.title, options)
      } else {
        const browserNotification = new Notification(notification.title, options)
        browserNotification.onclick = () => {
          location.hash = notification.url
          window.focus()
        }
      }
    }
  }

  async dismissAppNotification(navigate = false) {
    const notification = this.appNotification
    if (!notification) return
    this.appNotification = undefined
    await api.markNotificationRead(notification.id).catch(() => undefined)
    if (navigate) location.hash = notification.url
  }

  async enableAppNotifications() {
    if (!('Notification' in window)) return
    await Notification.requestPermission()
    this.requestRender()
  }

  async loadUnreadNotifications() {
    try {
      const unread = await api.getNotifications(true)
      if (unread[0]) await this.handleAppNotification(unread[0])
    } catch (error) {
      console.warn('Notifications could not be loaded', error)
    }
  }

  async setUser(credential) {
    this.authResolving = true
    this.capturePendingInvite()
    const token = localStorage.getItem('token')
    if ((token && token !== credential) || !token) localStorage.setItem('token', credential)

    const user = this._decodeToken(credential)

    try {
      const handshakeData = await api.getHandshake()

      if (handshakeData === 'NOT_REGISTERED') {
        user.picture = (await this.cacheProfilePicture(user.picture)) || user.picture
        this.user = user
        location.hash = this.pendingInviteRegistrationHash()
        this.userSignedIn = true
        this.authResolving = false
        this._onhashchange()
        return
      }

      localStorage.setItem('ticket', handshakeData)

      const userData = await api.getUser(user.id)
      const mergedUser = { ...user, ...userData }
      const pendingWork=getPendingWorkState()
      if(pendingWork.currentJob){mergedUser.currentJob=pendingWork.currentJob;mergedUser.currentPrestationId=pendingWork.currentPrestationId}
      mergedUser.picture = (await this.cacheProfilePicture(mergedUser.picture)) || mergedUser.picture
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
      }
      this._onhashchange()

      this.initWSClient()
    } catch (error) {
      console.error('Auth failed:', error)
      this.clearStoredAuth()
    }
  }

  static styles = [styles]

  async _load(type, uuid?: string) {
    if (uuid) this[type] = undefined
    const response = await fetch(uuid ? `/api/${type}/${uuid}` : `/api/${type}`, {
      method: 'GET',
      headers: {
        Authorization: localStorage.getItem('token')
      }
    })
    if (!response.ok) {
      if (response.status === 403 && (await response.json()).error === 'Forbidden, register first') {
        location.hash = '#!/register'
        return
      }
      console.error('Error fetching data:', response.statusText)
      this.error = {
        message: `${type === 'job' ? 'De job' : 'De gegevens'} kon niet geladen worden.`,
        label: type === 'job' ? 'Terug naar jobs' : 'Terug naar home',
        href: type === 'job' ? '#!/jobs' : '#!/home'
      }
      return
    }
    const data = await response.json()
    console.log({ data })
    if (!this.subscribedDataTypes.has(type)) {
      pubsub.subscribe(`${type}.changed`, (value) => {
        this[type] = value
      })
      this.subscribedDataTypes.add(type)
    }
    this[type] = data
  }

  onChange(propertyKey: string, value: any): void {
    console.log(`Property ${propertyKey} changed to`, value)
  }

  renderSelectedView() {
    const hash = location.hash
    const path = (hash.split('!/')[1] || 'home').split('?')[0]
    console.log(path)

    if (this.error) {
      return html`
        <error-animation
          .message=${this.error.message}
          .action=${this.error}></error-animation>
      `
    }

    if (!this.userSignedIn && this.selected !== 'register') {
      if (this.authResolving) {
        return html` <loading-view type="loading"></loading-view> `
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

    if (path === 'home') {
      return html` <home-view></home-view> `
    }

    if (path === 'quote') {
      return html` <quote-view
        .quote=${this.quote}
        .jobs=${this.jobs}></quote-view>`
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
      return html`
        <invoices-view
          .invoices=${this.invoices}
          .jobs=${this.jobs}
          .companies=${this.companies}></invoices-view>
      `
    }

    if (path === 'invoice') {
      console.log(this.invoice)

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
      if (!this.jobs) {
        return html` <loading-view type="loading"></loading-view> `
      }
      return html` <jobs-view></jobs-view> `
    }

    if (path === 'planning') {
      if (!this.jobs || !this.users) {
        return html` <loading-view type="loading"></loading-view> `
      }
      return html` <planning-view></planning-view> `
    }

    if (path === 'backups') {
      if (!this.user?.roles?.includes('admin')) return html` <home-view></home-view> `
      return html` <backups-view></backups-view> `
    }

    if (path === 'sync') return html` <sync-view></sync-view> `
    if (path === 'reports') return this.user?.roles?.includes('admin') ? html`<reports-view></reports-view>` : html`<home-view></home-view>`

    if (path === 'job') {
      if (!this.job) {
        return html` <loading-view type="loading"></loading-view> `
      }
      return html` <job-view></job-view> `
    }
  }

  _toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen
  }

  _closeMenu() {
    this.isMenuOpen = false
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
      <global-search></global-search>
      ${this.toast?html`<section class="app-toast" role="status"><span>${this.toast.message}</span>${this.toast.action?html`<button @click=${async()=>{await this.toast?.action?.();this.toast=undefined}}>${this.toast.actionLabel||'Ongedaan maken'}</button>`:''}<button class="toast-close" aria-label="Melding sluiten" @click=${()=>this.toast=undefined}><custom-icon icon="close"></custom-icon></button></section>`:''}
      ${this.confirmation?html`<div class="confirm-layer" @keydown=${(event:KeyboardEvent)=>this.handleConfirmationKeydown(event)}><button class="confirm-backdrop" aria-label="Annuleren" tabindex="-1" @click=${()=>this.resolveConfirmation(false)}></button><section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message"><span class="confirm-icon"><custom-icon icon="warning"></custom-icon></span><div class="confirm-copy"><h2 id="confirm-title">${this.confirmation.title}</h2><p id="confirm-message">${this.confirmation.message}</p></div><div class="confirm-actions"><button class="confirm-cancel" @click=${()=>this.resolveConfirmation(false)}>${this.confirmation.cancelLabel||'Annuleren'}</button><button class="confirm-primary" @click=${()=>this.resolveConfirmation(true)}>${this.confirmation.confirmLabel||'Verwijderen'}</button></div></section></div>`:''}
      ${this.userSignedIn && this.appNotification
        ? html`<section
            class="notification-toast"
            aria-live="polite">
            <span class="notification-icon"><custom-icon icon="calendar_month"></custom-icon></span>
            <div class="notification-copy">
              <strong>${this.appNotification.title}</strong>
              <span>${this.appNotification.message}</span>
              <div class="notification-actions">
                <button
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
            @click=${() => this._toggleMenu()}></custom-icon-button>`
        : ''}
      ${this.userSignedIn
        ? html`<button
              class="drawer-backdrop"
              aria-label="Menu sluiten"
              @click=${() => this._closeMenu()}></button>
            <aside
              id="app-navigation"
              aria-label="Hoofdnavigatie"
              aria-hidden=${this.isNarrow && !this.isMenuOpen ? 'true' : 'false'}
              @keydown=${(event: KeyboardEvent) => {
                if (event.key === 'Escape') this._closeMenu()
              }}>
              <div class="logo-area">
                <custom-icon-button
                  class="drawer-close"
                  icon="close"
                  aria-label="Menu sluiten"
                  @click=${() => this._closeMenu()}></custom-icon-button>
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
                  ${this.user?.roles?.includes('admin')
                    ? html`<a href="#!/quotes" aria-current=${this.selected === 'quotes' ? 'page' : undefined} class=${this.selected === 'quotes' ? 'nav-item active' : 'nav-item'}><custom-icon icon="request_quote"></custom-icon>Offertes</a>`
                    : ''}
                  <a
                    href="#!/jobs"
                    aria-current=${this.selected === 'jobs' ? 'page' : undefined}
                    class=${this.selected === 'jobs' ? 'nav-item active' : 'nav-item'}
                    ><custom-icon icon="inventory2"></custom-icon>Jobs</a
                  >
                  <a
                    href="#!/planning"
                    aria-current=${this.selected === 'planning' ? 'page' : undefined}
                    class=${this.selected === 'planning' ? 'nav-item active' : 'nav-item'}
                    ><custom-icon icon="calendar_month"></custom-icon>Planning</a
                  >
                </section>
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
                    href="#!/invoices"
                    aria-current=${this.selected === 'invoices' ? 'page' : undefined}
                    class=${this.selected === 'invoices' ? 'nav-item active' : 'nav-item'}
                    ><custom-icon icon="receipt"></custom-icon>Facturen</a
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

      ${this.userSignedIn ? html`<nav class="mobile-bottom-nav" aria-label="Snelle navigatie"><a href="#!/home" class=${this.selected==='home'?'active':''}><custom-icon icon="home"></custom-icon><span>Home</span></a><a href="#!/planning" class=${this.selected==='planning'?'active':''}><custom-icon icon="calendar_month"></custom-icon><span>Planning</span></a><a class="work-action" href=${this.user?.currentJob?'#!/checkout':'#!/checkin'}><custom-icon icon=${this.user?.currentJob?'stop_circle':'play_arrow'}></custom-icon><span>${this.user?.currentJob?'Stop':'Start'}</span></a><a href="#!/timeline" class=${this.selected==='timeline'?'active':''}><custom-icon icon="timeline"></custom-icon><span>Tijdlijn</span></a><button @click=${()=>window.dispatchEvent(new Event('keepit-open-search'))}><custom-icon icon="search"></custom-icon><span>Zoek</span></button></nav>` : ''}

      <main>
        ${this.userSignedIn
        ? html`<header>
              ${this.syncPending?html`<a class="offline-status" href="#!/sync"><custom-icon icon="cloud_upload"></custom-icon>${this.syncPending} wacht${this.syncPending===1?'':'en'} op synchronisatie</a>`:''}
              <button class="global-search-trigger" @click=${()=>window.dispatchEvent(new Event('keepit-open-search'))}><custom-icon icon="search"></custom-icon><span>Zoeken</span><kbd>⌘ K</kbd></button>
              <account-bar></account-bar>
            </header>`
          : ''}
        <flex-container center-center> ${this.renderSelectedView()} </flex-container>
      </main>
    `
  }
}
customElements.define('app-shell', AppShell)
