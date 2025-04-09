import { LiteElement, customElement, css, html, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/theme.js'
import '@vandeurenglenn/flex-elements/container.js'
import '@vandeurenglenn/flex-elements/wrap-around.js'
import '@vandeurenglenn/lite-elements/icon-button.js'
import '@vandeurenglenn/lite-elements/icon.js'
import '@vandeurenglenn/lite-elements/divider.js'
import './views/loading-view.js'

import icons from './icons.js'
// @ts-ignore
import styles from './shell.css' with { type: 'css' }
globalThis.exports = {}
@customElement('app-shell')
export class AppShell extends LiteElement {
  @property({ type: Boolean, provides: true, attribute: 'is-narrow' }) accessor isNarrow

  @property({ type: Boolean, attribute: 'is-medium-narrow' }) accessor isMediumNarrow

  @property({ type: String }) accessor selected = 'invoices'

  @property({ type: Boolean }) accessor userSignedIn = false

  @property({type: Boolean, provides: true}) accessor darkMode

  @property({ type: Object }) accessor user

  @property({ type: Array, provides: true }) accessor invoices = []

  setupMediaQuery(query, callback) {
    const mediaQuery = window.matchMedia(query)
    const handleMediaQueryChange = callback
    mediaQuery.addEventListener('change', handleMediaQueryChange)
    handleMediaQueryChange(mediaQuery)
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

    const _onhashchange = async () => {
      const hash = location.hash
      const path = hash.split('!/')[1]
      console.log(path)

      const navItems = this.shadowRoot.querySelectorAll('.nav-item')
      navItems.forEach((item) => {
        item.classList.remove('active')
      })
      const activeItem = this.shadowRoot.querySelector(`.nav-item[href="${hash}"]`)
      if (activeItem) {
        activeItem.classList.add('active')
      }

      if (!(await customElements.get(`${path}-view`))) await import(`./${path}-view.js`)

        if (path === 'invoices') {
          const response = await fetch('/api/invoices')
          const invoices = await response.json()
          this.invoices = invoices
        }

      this.selected = path
    }

    onhashchange = _onhashchange
    if (!location.hash) location.hash = '#!/home'
    _onhashchange()
  }

  setUser(user) {
    this.userSignedIn = true
    this.user = user
    globalThis.pubsub.publish('user-signed-in', user)
  }

  static styles = [styles]

  renderSelectedView() {
    const hash = location.hash
    const path = hash.split('!/')[1]

    if (!this.userSignedIn) {
      return html` <loading-view type="signin"></loading-view> `
    }
    if (path === 'users') {
      return html` <users-view></users-view> `
    }
    if (path === 'invoices') {
      
      return html` <invoices-view></invoices-view> `
    }

    if (path === 'companies') {
      return html` <companies-view></companies-view> `
    }

    if (path === 'jobs') {
      return html` <jobs-view></jobs-view> `
    }
  }


  render() {
    return html`
      ${icons}

      <custom-theme
        load-symbols="false"
        load-fonts="false"></custom-theme>

      <custom-icon-button icon="menu"></custom-icon-button>

      <aside>
        <img
          class="logo"
          loading="lazy"
          src=${this.darkMode ? '/assets/dimac-dark.svg' : '/assets/dimac.svg'} />
        
          <custom-divider middle-inset></custom-divider>
        <span class="nav-container">
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
      </aside>

      <main>
        <flex-container> ${this.renderSelectedView()} </flex-container>
      </main>
    `
  }
}
