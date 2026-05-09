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

import './animations/error.js'

import icons from './icons.js'
import styles from './shell.css' with { type: 'css' }

globalThis.exports = {}

export class AppShell extends LiteElement {
  @property({ type: Boolean, provides: true, attribute: 'is-narrow' }) accessor isNarrow

  @property({ type: Boolean, attribute: 'is-medium-narrow' }) accessor isMediumNarrow

  @property({ type: String, temporaryRender: 500 }) accessor selected

  @property({ type: Boolean, attribute: 'signed-in', reflect: true }) accessor userSignedIn

  @property({ type: Boolean, provides: true }) accessor darkMode

  @property({ type: Object, provides: true }) accessor user

  @property({ type: Array, provides: true }) accessor invoices
  @property({ type: Array, provides: true }) accessor invoice
  @property({ type: Object, provides: true }) accessor jobs
  @property({ type: Object, provides: true }) accessor job
  @property({ type: Array, provides: true }) accessor companies
  @property({ type: Array, provides: true }) accessor users

  @property({ type: Object, consumes: true }) accessor error = null
  @property({ type: Boolean, attribute: 'is-menu-open', reflect: true }) accessor isMenuOpen: any

  googleScriptLoaded = false
  googleScriptPromise: Promise<void> | null = null
  googleInitialized = false

  setupMediaQuery(query, callback) {
    const mediaQuery = window.matchMedia(query)
    const handleMediaQueryChange = callback
    mediaQuery.addEventListener('change', handleMediaQueryChange)
    handleMediaQueryChange(mediaQuery)
  }

  _onhashchange = async () => {
    const hash = location.hash
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
      this.error = params.error
      this.requestRender()
      return
    } else {
      this.error = null
    }

    const navItems = this.shadowRoot.querySelectorAll('.nav-item')
    navItems.forEach((item) => {
      item.classList.remove('active')
    })
    const activeItem = this.shadowRoot.querySelector(`.nav-item[href="${hash}"]`)
    if (activeItem) {
      activeItem.classList.add('active')
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
    if (path === 'job') {
      if (!this.job) promises.push(this._load('job', params.selected))
    }
    if (path === 'companies') {
      if (!this.companies) promises.push(this._load('companies'))
    }
    if (path === 'users') {
      if (!this.users) promises.push(this._load('users'))
    }
    if (path === 'checkin') {
      if (!this.jobs) promises.push(this._load('jobs'))
    }
    if (path === 'checkout') {
      if (!this.jobs) promises.push(this._load('jobs'))
    }

    await Promise.all(promises)

    this.selected = path
  }

  beforeRender(): void {
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
    this.user = undefined
    this.userSignedIn = false
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
        void this.setUser(token)
      }
    } else {
      this.userSignedIn = false
      this.requestRender()
      queueMicrotask(() => {
        void this.ensureGoogleSignInUi()
      })
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

    const client = new WebSocket('ws://localhost:5678/ws', [`ticket__${localStorage.getItem('ticket')}`])
    console.log(client)
    globalThis.client = client
    client.addEventListener('open', () => {
      pubsub.subscribe(`users.changed`, (value) => {
        if (!Array.isArray(value)) {
          const user = { ...this.user, ...value }
          pubsub.publishVerbose(`user`, user)
        }
      })
      setTimeout(() => {
        client.send(JSON.stringify({ type: 'pubsub', params: { subscribe: 'users.changed' } }))
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

  async setUser(credential) {
    const token = localStorage.getItem('token')
    if ((token && token !== credential) || !token) localStorage.setItem('token', credential)

    const user = this._decodeToken(credential)

    let response = await fetch('/api/handshake', {
      headers: {
        Authorization: credential
      },
      method: 'GET'
    })

    if (!response.ok) {
      this.clearStoredAuth()
      return
    }

    const data = await response.text()
    if (data === 'NOT_REGISTERED') {
      this.user = user
      location.hash = '#!/register'
      this.userSignedIn = true
      this._onhashchange()
      return
    } else {
      localStorage.setItem('ticket', data)
    }

    response = await fetch('/api/users/' + user.id, {
      headers: {
        Authorization: credential
      },
      method: 'GET'
    })

    if (!response.ok) {
      this.clearStoredAuth()
      return
    }

    const userData = await response.json()
    this.user = { ...user, ...userData }
    this.userSignedIn = true

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
  }

  static styles = [styles]

  async _load(type, uuid?: string) {
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
      return
    }
    const data = await response.json()
    console.log({ data })
    pubsub.subscribe(`${type}.changed`, (value) => {
      this[type] = value
    })
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
                <strong>Operations workspace</strong>
                <span>Beheer jobs, users, companies en planning vanuit een vaste flow.</span>
              </div>
              <div class="signed-out-highlight">
                <strong>Finance workspace</strong>
                <span>Werk checkins, checkouts en invoices bij op een centrale plek.</span>
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

    if (path === 'quotes') {
      return html` <quotes-view></quotes-view> `
    }

    if (path === 'quote') {
      return html` <job-quote-view></job-quote-view>`
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

    if (path === 'companies') {
      if (!this.companies) {
        return html` <loading-view type="loading"></loading-view> `
      }
      return html` <companies-view></companies-view> `
    }

    if (path === 'jobs') {
      if (!this.jobs) {
        return html` <loading-view type="loading"></loading-view> `
      }
      return html` <jobs-view></jobs-view> `
    }

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

  render() {
    return html`
      <!-- @build-info -->
      ${icons}

      <custom-theme
        load-symbols="false"
        load-fonts="false"></custom-theme>

      ${this.userSignedIn
        ? html`<custom-icon-button
            icon="menu"
            @click=${() => this._toggleMenu()}></custom-icon-button>`
        : ''}
      ${this.userSignedIn
        ? html`<aside>
            <img
              class="logo"
              loading="lazy"
              src=${this.darkMode ? '/assets/dimac-dark.svg' : '/assets/dimac.svg'} />

            <custom-divider middle-inset></custom-divider>
            <span class="nav-container">
              <a
                href="#!/home"
                class="nav-item"
                ><custom-icon icon="home"></custom-icon>home</a
              >
              <a
                href="#!/quotes"
                class="nav-item"
                ><custom-icon icon="receipt_long"></custom-icon>quotes</a
              >
              <a
                href="#!/quote"
                class="nav-item"
                ><custom-icon icon="request_quote"></custom-icon>quote</a
              >
              <a
                href="#!/jobs"
                class="nav-item"
                ><custom-icon icon="inventory2"></custom-icon>jobs</a
              >
              <a
                href="#!/companies"
                class="nav-item"
                ><custom-icon icon="source_environment"></custom-icon>companies</a
              >
              <a
                href="#!/invoices"
                class="nav-item"
                ><custom-icon icon="receipt"></custom-icon>invoices</a
              >

              <a
                href="#!/users"
                class="nav-item"
                ><custom-icon icon="group"></custom-icon>users</a
              >
            </span>
            <build-info></build-info>
          </aside>`
        : ''}

      <main>
        ${this.userSignedIn
          ? html`<header>
              <account-bar></account-bar>
            </header>`
          : ''}
        <flex-container center-center>
          ${this.renderSelectedView()}
        </flex-container>
      </main>
    `
  }
}
customElements.define('app-shell', AppShell)
