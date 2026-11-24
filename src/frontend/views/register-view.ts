import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import type { User } from '../../types/index.js'
import { api, ApiError } from '../api/client.js'
import '../flows/data-input.js'
import type { DataInput } from '../flows/data-input.js'

type SetupState = 'checking' | 'ready' | 'invitation-required' | 'unavailable'

export class RegisterView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor user: User
  @property({ type: String }) accessor setupState: SetupState = 'checking'
  @property({ type: Boolean }) accessor submitting = false
  @property({ type: Boolean }) accessor activated = false
  @property({ type: Boolean }) accessor pictureFailed = false
  @property({ type: String }) accessor registrationError = ''
  @property({ type: String }) accessor invalidField: '' | 'phone' | 'place' = ''
  private statusRequest = 0

  static styles = [css`
    :host { display:flex; flex-direction:column; width:100%; max-width:680px; padding:24px; box-sizing:border-box; gap:14px; }
    h1,h2,p,dl,dd { margin:0; }
    h1 { font-size:clamp(1.65rem,4vw,2.1rem); line-height:1.15; }
    .intro { display:grid; gap:7px; }
    .eyebrow { color:var(--app-accent-label); font-size:.78rem; font-weight:650; }
    .muted,.hint { color:var(--md-sys-color-on-surface-variant); line-height:1.5; }
    .panel { display:grid; gap:14px; padding:18px; min-width:0; border:1px solid var(--app-border); border-radius:var(--app-radius-panel); background:var(--app-panel); }
    .identity { display:flex; align-items:center; gap:12px; }
    .avatar { display:grid; place-items:center; width:44px; height:44px; flex:none; border-radius:12px; object-fit:cover; background:var(--app-accent-soft); color:var(--app-accent-label); font-weight:700; }
    .profile h2,.section-title { font-size:1rem; overflow-wrap:anywhere; }
    .identity-copy { min-width:0; }
    .profile dl { display:grid; gap:6px; margin-top:5px; }
    .profile dl > div { display:flex; flex-wrap:wrap; column-gap:6px; }
    .profile dt { color:var(--md-sys-color-on-surface-variant); font-size:.75rem; }
    .profile dd { min-width:0; overflow-wrap:anywhere; font-size:.8rem; }
    label { display:grid; gap:6px; font-weight:650; font-size:.84rem; }
    input { display:block; width:100%; min-height:44px; box-sizing:border-box; padding:0 12px; border:1px solid var(--app-border); border-radius:var(--app-radius-control); background:var(--app-panel-strong); color:inherit; font:inherit; font-size:16px; font-weight:500; }
    .field { display:grid; gap:7px; }
    .hint { font-size:.78rem; font-weight:400; }
    .actions { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
    button { min-height:44px; padding:0 14px; border:1px solid var(--app-border); border-radius:var(--app-radius-control); background:var(--app-panel-strong); color:inherit; font:inherit; font-weight:650; cursor:pointer; }
    .primary { border-color:var(--app-accent-strong); background:var(--app-accent); color:var(--md-sys-color-on-primary); }
    button:disabled { opacity:.6; cursor:default; }
    :is(button,input):focus-visible { outline:2px solid var(--app-accent-label); outline-offset:2px; }
    .notice { padding:10px 12px; border:1px solid var(--app-border); border-radius:var(--app-radius-control); line-height:1.45; font-size:.84rem; overflow-wrap:anywhere; }
    .notice[role=alert] { background:color-mix(in srgb,var(--md-sys-color-error) 10%,var(--app-panel)); }
    .notice.success { background:var(--app-success-soft); }
    @media(max-width:620px) { :host { padding:12px; } .panel { padding:14px; } .actions > button { width:100%; } .actions .primary { order:-1; } }
  `]

  connectedCallback() {
    super.connectedCallback()
    void this.prepareRegistration()
  }

  disconnectedCallback() {
    this.statusRequest++
    super.disconnectedCallback()
  }

  getPendingInvite() {
    const params = new URLSearchParams(location.hash.split('?')[1] || '')
    const directId = params.get('uuid')?.trim()
    if (directId) return { inviteId: directId, email: params.get('email')?.trim() || '' }
    try {
      return {
        inviteId: sessionStorage.getItem('keepit.pendingInviteId')?.trim() || '',
        email: sessionStorage.getItem('keepit.pendingInviteEmail')?.trim() || ''
      }
    } catch {
      return { inviteId: '', email: '' }
    }
  }

  async prepareRegistration() {
    const request = ++this.statusRequest
    if (this.getPendingInvite().inviteId) {
      this.setupState = 'ready'
      return
    }
    this.setupState = 'checking'
    try {
      const { invitationRequired } = await api.getRegistrationStatus(AbortSignal.timeout(12_000))
      if (typeof invitationRequired !== 'boolean') throw new Error('Ongeldige registratiestatus')
      if (request === this.statusRequest) this.setupState = invitationRequired ? 'invitation-required' : 'ready'
    } catch {
      if (request === this.statusRequest) this.setupState = 'unavailable'
    }
  }

  async register() {
    if (this.submitting || this.activated || this.setupState !== 'ready' || !this.user) return
    this.registrationError = ''
    this.invalidField = ''
    const phoneInput = this.shadowRoot?.querySelector<HTMLInputElement>('#register-phone')
    const placeInput = this.shadowRoot?.querySelector<DataInput>('data-input[label="place"]')
    const phone = phoneInput?.value.trim()
    const place = placeInput?.place
    if (!phone) {
      this.invalidField = 'phone'
      this.registrationError = 'Vul je telefoonnummer in.'
      phoneInput?.focus()
      return
    }
    if (!place?.id || !place.formattedAddress) {
      this.invalidField = 'place'
      this.registrationError = 'Kies een adres uit de suggesties of gebruik je huidige locatie.'
      placeInput?.shadowRoot?.querySelector<HTMLElement>('md-outlined-text-field')?.focus()
      return
    }

    this.submitting = true
    try {
      await api.registerUser({ name: this.user.name, inviteId: this.getPendingInvite().inviteId, picture: this.user.picture, phone, place })
      if (!this.isConnected) return
      this.activated = true
      try {
        sessionStorage.removeItem('keepit.pendingInviteId')
        sessionStorage.removeItem('keepit.pendingInviteEmail')
      } catch { /* Session storage may be unavailable. */ }
      location.hash = '#!/home'
      location.reload()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.registrationError = 'Je aanmelding is verlopen. Kies Ander Google-account om je opnieuw aan te melden.'
      } else if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        this.registrationError = error.message.slice(0, 240) || 'Controleer je uitnodiging en gegevens.'
      } else {
        this.registrationError = 'Keepit kon je account niet activeren. Je invoer blijft staan; probeer opnieuw zodra de verbinding terug is.'
      }
    } finally {
      this.submitting = false
    }
  }

  clearFieldError(field: 'phone' | 'place') {
    if (this.invalidField !== field) return
    this.invalidField = ''
    this.registrationError = ''
  }

  changeAccount() {
    this.dispatchEvent(new Event('keepit-registration-account-change', { bubbles:true, composed:true }))
  }

  render() {
    const invite = this.getPendingInvite()
    const name = this.user?.name || 'Google-account'
    const picture = this.user?.picture
    return html`
      <header class="intro">
        <span class="eyebrow">Aan de slag met Keepit</span>
        <h1>Account voltooien</h1>
        <p class="muted">Controleer je Google-account en vul je werkgegevens aan.</p>
      </header>
      <section class="panel profile" aria-label="Aangemeld Google-account">
        <div class="identity">
          ${picture && !this.pictureFailed
            ? html`<img class="avatar" src=${picture} alt="" referrerpolicy="no-referrer" @error=${() => { this.pictureFailed = true }}>`
            : html`<span class="avatar" aria-hidden="true">${name.charAt(0).toUpperCase()}</span>`}
          <div class="identity-copy"><h2>${name}</h2><dl>
            ${this.user?.email ? html`<div><dt>Google-login:</dt><dd>${this.user.email}</dd></div>` : ''}
            ${invite.email ? html`<div><dt>Uitgenodigd op:</dt><dd>${invite.email}</dd></div>` : ''}
          </dl></div>
        </div>
      </section>

      ${this.setupState === 'checking' ? html`<p class="panel muted" role="status">Registratie controleren…</p>`
        : this.setupState === 'invitation-required' ? html`<section class="panel">
          <h2 class="section-title">Persoonlijke uitnodiging nodig</h2>
          <p class="muted">Open de link uit je uitnodigingsmail. Heb je geen link meer? Vraag je beheerder om een nieuwe uitnodiging.</p>
          <div class="actions"><button type="button" @click=${this.changeAccount}>Ander Google-account</button></div>
        </section>`
        : this.setupState === 'unavailable' ? html`<section class="panel"><p class="muted" role="alert">Keepit kon niet controleren of je een uitnodiging nodig hebt.</p>
          <div class="actions"><button type="button" class="primary" @click=${() => void this.prepareRegistration()}>Opnieuw proberen</button></div></section>`
        : html`<form class="panel" aria-busy=${this.submitting} @submit=${(event: Event) => { event.preventDefault(); void this.register() }}>
          <h2 class="section-title">Werkgegevens</h2>
          <label for="register-phone">Telefoonnummer
            <input id="register-phone" type="tel" autocomplete="tel" placeholder="+32 …" required
              aria-invalid=${this.invalidField === 'phone' ? 'true' : 'false'} @input=${() => this.clearFieldError('phone')}>
          </label>
          <div class="field">
            <data-input type="place" current-location label="place" display-label="Werkadres" @data-input-changed=${() => this.clearFieldError('place')}></data-input>
            <p class="hint">Zoek op straat en nummer en kies een suggestie. Je kunt ook je huidige locatie gebruiken; dat zet geen doorlopende locatietracking aan.</p>
          </div>
          ${this.registrationError ? html`<p class="notice" role="alert">${this.registrationError}</p>`
            : this.activated ? html`<p class="notice success" role="status">Account geactiveerd. Keepit wordt geopend…</p>` : ''}
          <div class="actions">
            <button type="button" ?disabled=${this.submitting || this.activated} @click=${this.changeAccount}>Ander Google-account</button>
            <button type="submit" class="primary" ?disabled=${this.submitting || this.activated}>${this.submitting ? 'Account activeren…' : 'Account activeren'}</button>
          </div>
        </form>`}
    `
  }
}

customElements.define('register-view', RegisterView)
