import { LiteElement, customElement, css, html, property } from '@vandeurenglenn/lite'
import { render } from 'lit-html'
import '@vandeurenglenn/lite-elements/theme.js'
import '@vandeurenglenn/flex-elements/container.js'
import '@vandeurenglenn/flex-elements/wrap-around.js'
import '@vandeurenglenn/lite-elements/icon-button.js'
import '@vandeurenglenn/lite-elements/icon.js'
import '@vandeurenglenn/lite-elements/divider.js'
import './views/loading-view.js'

import icons from './icons.js'
// @ts-ignore
// @prettier-ignore
import styles from './shell.css' with { type: 'css' }

globalThis.exports = {}
export class AppShell extends LiteElement {
  @property({ type: Boolean, provides: true, attribute: 'is-narrow' }) accessor isNarrow

  @property({ type: Boolean, attribute: 'is-medium-narrow' }) accessor isMediumNarrow

  @property({ type: String }) accessor selected = 'invoices'

  @property({ type: Boolean }) accessor userSignedIn

  @property({type: Boolean, provides: true}) accessor darkMode

  @property({ type: Object, provides: true }) accessor user

  @property({ type: Array, provides: true }) accessor invoices

  @property({ type: Object, provides: true }) accessor jobs
  @property({ type: Object, provides: true }) accessor job
  @property({ type: Array, provides: true }) accessor companies
  @property({ type: Array, provides: true }) accessor users

  @property({type: Boolean}) accessor userRegistering

  setupMediaQuery(query, callback) {
    const mediaQuery = window.matchMedia(query)
    const handleMediaQueryChange = callback
    mediaQuery.addEventListener('change', handleMediaQueryChange)
    handleMediaQueryChange(mediaQuery)
  }

  _onhashchange = async () => {
    const hash = location.hash
    const path = hash.split('!/')[1].split('?')[0]
    console.log(path);
    
    const params = hash.split('?')?.[1]?.split('&').reduce((acc, param) => {
      const [key, value] = param.split('=')
      acc[key] = decodeURIComponent(value)
      return acc
    }, {})
console.log(params);

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

    const promises = []
    console.log(path);

    if (!this.userSignedIn) return
    
    if (path === 'invoices') {
      if (!this.invoices) 
        promises.push(this._load('invoices'))
      if (!this.jobs) 
        promises.push( this._load('jobs'))
      
      if (!this.companies) 
        promises.push(this._load('companies'))
      }
    if (path === 'jobs') {
      if (!this.jobs)
        promises.push(this._load('jobs'))
    }
    if (path === 'job') {
      if (!this.job)
        promises.push(this._load('job', params.selected))
    }
    if (path === 'companies') {
      if (!this.companies)
        promises.push(this._load('companies'))
    }
    if (path === 'users') {
      if (!this.users)
        promises.push(this._load('users'))
    }
    if (path === 'checkin') {
      if (!this.jobs)
        promises.push(this._load('jobs'))
    }
    if (path === 'checkout') {
      if (!this.jobs)
        promises.push(this._load('jobs'))
    }

    await Promise.all(promises)
    this.requestRender()

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
     location.hash = '#!/home'
    this._onhashchange()
    this.checkUserStatus()
  }


  checkUserStatus() {
    const token = localStorage.getItem('token')
    if (token) {
      const user = this._decodeToken(token)
      if (user.expires < Date.now() / 1000) {
        localStorage.removeItem('token')
        this.userSignedIn = false
        render(html`  <div
        id="g_id_onload"
        data-client_id="108028336132-s1j25jmsu1d222ovrabdk2kcbvkie474.apps.googleusercontent.com"
        data-context="use"
        data-callback="onSignIn"
        data-auto_select="true"
        data-itp_support="true"></div>`, document.body)

        const script = document.createElement('script')
        script.src = 'https://accounts.google.com/gsi/client'
      
        script.dataset.use_fedcm_for_prompts = 'true'
        document.head.appendChild(script)
        } else {
          this.setUser(token)
      }
    } else {
      render(html`  <div
      id="g_id_onload"
      data-client_id="108028336132-s1j25jmsu1d222ovrabdk2kcbvkie474.apps.googleusercontent.com"
      data-context="use"
      data-callback="onSignIn"
      data-auto_select="true"
      data-itp_support="true"></div>`, document.body)

      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
     
      script.dataset.use_fedcm_for_prompts = 'true'
      document.head.appendChild(script)
    }
  }

  _decodeToken(credential) {
    const decodedCredential =  JSON.parse(atob(credential.split('.')[1]))
    return{
      id: decodedCredential.sub,
      name: decodedCredential.name,
      picture: decodedCredential.picture,
      email: decodedCredential.email,
      expires: decodedCredential.exp,
    }

  }

  async setUser(credential) {
    const token = localStorage.getItem('token')
    if (token && token !== credential || !token) 
      localStorage.setItem('token', credential)

    this.user = this._decodeToken(credential)

    
    const response = await fetch('/api/handshake', {
      headers: {
        Authorization: credential
      },
      method: 'GET'
    })
    const data = await response.text()
    if (data === 'NOT_REGISTERED') {
      this.userRegistering = true
      location.hash = '#!/register'
      return
    }
    this.userSignedIn = true
    this.userRegistering = false
    /**
     * since we are blocking the route change until the user is signed in
     * we can safely assume that the user is signed in
     * and we can load the data
     */
    this._onhashchange()
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
    console.log({data});
    
    this[type] = data
  }

  renderSelectedView() {
    const hash = location.hash
    const path = hash.split('!/')[1].split('?')?.[0]
console.log(path);



    if (!this.userSignedIn && !this.userRegistering) {
      return html` <loading-view type="signin"></loading-view> `
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
      return html` <invoices-view .invoices=${this.invoices} .jobs=${this.jobs} .companies=${this.companies}></invoices-view> `
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
      </aside>

      <main>
        <flex-container center-center> ${this.renderSelectedView()} </flex-container>
      </main>
    `
  }
}
customElements.define('app-shell', AppShell)