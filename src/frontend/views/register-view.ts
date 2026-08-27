import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import { User } from '../../types/index.js'
import { api } from '../api/client.js'
import { showToast } from '../helpers/toast.js'
import '@vandeurenglenn/lite-elements/icon-button.js'
import '@vandeurenglenn/lite-elements/button.js'
import '../elements/list/item.js'
import '../elements/view/header.js'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/fab/fab.js'
import '../flows/data-input.js'

export class RegisterView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor user: User

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        max-width: 760px;
        padding: 16px;
        box-sizing: border-box;
        gap: 18px;
      }

      .register-panel,
      .profile-panel {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 18px;
        border-radius: var(--app-radius-panel);
        background: var(--app-panel);
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-soft);
        box-sizing: border-box;
      }

      .profile-meta {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .profile-panel {
        flex-direction: row;
        align-items: center;
      }

      img {
        width: 96px;
        height: 96px;
        border-radius: 16px;
        object-fit: cover;
        border: 2px solid color-mix(in srgb, var(--app-accent) 26%, white 74%);
      }

      h2,
      p {
        margin: 0;
      }

      p {
        color: var(--md-sys-color-on-surface-variant);
      }

      .primary {
        width: fit-content;
        min-height: 44px;
        padding: 0 17px;
        border: 1px solid var(--app-accent-strong);
        border-radius: var(--app-radius-control);
        background: var(--app-accent);
        color: var(--md-sys-color-on-primary);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }

      @media (max-width: 720px) {
        :host {
          padding: 12px;
        }

        .register-panel,
        .profile-panel {
          padding: 16px;
          border-radius: var(--app-radius-panel);
        }

        .primary {
          width: 100%;
        }
      }
    `
  ]

  getPendingInvite() {
    const params = new URLSearchParams(location.hash.split('?')[1] || '')

    try {
      return {
        inviteId: params.get('uuid') || sessionStorage.getItem('keepit.pendingInviteId') || '',
        email: params.get('email') || sessionStorage.getItem('keepit.pendingInviteEmail') || ''
      }
    } catch {
      return { inviteId: params.get('uuid') || '', email: params.get('email') || '' }
    }
  }

  async _registerUser() {
    try {
      const invite = this.getPendingInvite()
      const userData = {
        name: this.user.name,
        inviteId: invite.inviteId || undefined,
        picture: this.user.picture,
        phone: (this.shadowRoot?.querySelector('data-input[label="telephone"]') as any).value,
        place: (this.shadowRoot?.querySelector('data-input[label="place"]') as any).value
      }
      await api.registerUser(userData)
      try {
        sessionStorage.removeItem('keepit.pendingInviteId')
        sessionStorage.removeItem('keepit.pendingInviteEmail')
      } catch {
        // Ignore unavailable session storage.
      }
      location.hash = '#!/users'
      location.reload()
    } catch (error) {
      console.error('Error registering user:', error)
      showToast(error instanceof Error ? error.message : 'Registratie mislukt')
    }
  }

  render() {
    const invite = this.getPendingInvite()
    return html`
      <view-header
        title="Account voltooien"
        description="Controleer je gegevens en voeg je werkadres toe."
        icon="person"></view-header>

      <section class="profile-panel">
        <img
          src=${this.user?.picture}
          alt="Profielfoto" />
        <div class="profile-meta">
          <h2>${this.user?.name}</h2>
          ${invite.email ? html`<p>Werkadres: ${invite.email}</p>` : ''}
          <p>Google-login: ${this.user?.email}</p>
        </div>
      </section>

      <section class="register-panel">
        <data-input label="telephone"></data-input>

        <data-input
          type="place"
          label="place"></data-input>

        <button
          class="primary"
          @click=${() => this._registerUser()}>Account activeren</button>
      </section>
    `
  }
}

customElements.define('register-view', RegisterView)
