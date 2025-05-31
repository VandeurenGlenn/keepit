import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import { User } from '../../types/index.js'
import '@vandeurenglenn/lite-elements/icon-button.js'
import '@vandeurenglenn/lite-elements/button.js'
import '../elements/list/item.js'
import '../elements/view/header.js'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/fab/fab.js'

export class RegisterView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor user: User

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        width: 100%;
      }
      .row {
        width: 100%;
        display: flex;
        flex-direction: row;
        align-items: center;
      }

      md-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
      }

      img {
        border-radius: 8px;
        margin-bottom: 16px;
        margin-top: 16px;
      }
      /* Add your styles here */
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
        picture: this.user.picture
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

      <img
        src=${this.user?.picture}
        alt="Profile Picture" />
      <div>
        <h2>${this.user?.name}</h2>
        <p>${this.user?.email}</p>
      </div>

      <custom-button
        label="Register"
        type="tonal"
        @click=${() => this._registerUser()}></custom-button>
    `
  }
}

customElements.define('register-view', RegisterView)
