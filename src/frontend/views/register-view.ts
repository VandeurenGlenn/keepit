import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import { User } from '../../types/index.js'
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
        border-radius: 24px;
        background: linear-gradient(180deg, color-mix(in srgb, var(--app-panel) 96%, white 4%), var(--app-panel));
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-strong);
        box-sizing: border-box;
      }

      .profile-meta {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      img {
        width: 96px;
        height: 96px;
        border-radius: 24px;
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

      custom-button {
        width: fit-content;
      }

      @media (max-width: 720px) {
        :host {
          padding: 12px;
        }

        .register-panel,
        .profile-panel {
          padding: 16px;
          border-radius: 20px;
        }

        custom-button {
          width: 100%;
        }
      }
    `
  ]

  async _registerUser() {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: localStorage.getItem('token')
      },
      body: JSON.stringify({
        name: this.user.name,
        email: this.user.email,
        picture: this.user.picture,
        telephone: (this.shadowRoot?.querySelector('data-input[label="telephone"]') as any).value,
        place: (this.shadowRoot?.querySelector('data-input[label="place"]') as any).value
      })
    })

    if (response.status === 201) {
      location.href = '#!/users'
    } else {
      console.error('Error registering user:', response.statusText)
    }
  }

  render() {
    return html`
      <view-header
        title="Register"
        description="Create your account"
        icon="person"></view-header>

      <section class="profile-panel">
        <img
          src=${this.user?.picture}
          alt="Profile Picture" />
        <div class="profile-meta">
          <h2>${this.user?.name}</h2>
          <p>${this.user?.email}</p>
        </div>
      </section>

      <section class="register-panel">
        <data-input label="telephone"></data-input>

        <data-input
          type="place"
          label="place"></data-input>

        <custom-button
          label="Register"
          type="tonal"
          @click=${() => this._registerUser()}></custom-button>
      </section>
    `
  }
}

customElements.define('register-view', RegisterView)
