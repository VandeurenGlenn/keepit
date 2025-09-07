import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon.js'
import { Users } from '../../types/index.js'
import '@vandeurenglenn/lite-elements/icon-button.js'
import './../elements/list/item.js'
import './../elements/view/header.js'
export class UsersView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor users: Users
  @property({ type: Object, provides: true }) accessor error: { label: string; href: string; message: string }

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        width: 100%;
      }
      md-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
      }
      /* Add your styles here */
    `
  ]

  grantRole = async (uuid: string, role: string) => {
    await fetch(`/api/roles/grant/${uuid}/${role}`, {
      method: 'POST',
      headers: {
        Authorization: localStorage.getItem('token')
      }
    })
    console.log(`Granting ${role} role to user with key: ${uuid}`)
  }

  _inviteUser = async () => {
    const email = await prompt('Enter the email address of the user to invite:')
    if (!email) return
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: localStorage.getItem('token')
      },
      body: JSON.stringify({ email })
    })
    if (!response.ok) {
      const { error, message } = await response.json()
      this.error = { label: 'Click to go back', href: '#!/users', message: message || error || 'Failed to add user' }
      this.requestRender()
      return
    }
    const newUser = await response.json()
    this.requestRender()
  }

  _handleFabKeyUp = (event) => {
    if (event.key === 'Enter' || event.key === 'Space') {
      event.preventDefault()
      this._inviteUser()
    }
  }

  _deleteUser = async (uuid: string) => {
    const answer = confirm('Are you sure you want to delete this user?')
    if (!answer) return
    const response = await fetch(`/api/users/${uuid}`, {
      method: 'DELETE',
      headers: { Authorization: localStorage.getItem('token') }
    })
    if (!response.ok) {
      const { error, message } = await response.json()
      this.error = { label: 'Click to go back', href: '#!/users', message: message || error || 'Failed to delete user' }
      this.requestRender()
      return
    }

    delete this.users[uuid]
    this.requestRender()
  }

  render() {
    return html`
      <view-header
        title="Users"
        description="Manage your users"
        icon="group"></view-header>

      ${Object.entries(this.users || {}).map(
        ([key, user]) => html`
          <list-item
            .href=${`#!/job?selected=${key}`}
            .headline=${user.name}
            .subheadline=${user.place?.formattedAddress}
            .key=${key}
            .delete=${this._deleteUser ? this._deleteUser.bind(this, key) : undefined}></list-item>
        `
      )}
      <md-fab
        @click=${() => this._inviteUser()}
        @keyup=${(event) => this._handleFabKeyUp(event)}>
        <custom-icon
          icon="add"
          slot="icon"></custom-icon
      ></md-fab>
    `
  }
}

customElements.define('users-view', UsersView)
