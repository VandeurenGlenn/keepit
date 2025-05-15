import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon.js'
import { Users } from '../../types/index.js'
import '@vandeurenglenn/lite-elements/icon-button.js'
import './../elements/list/item.js'
import './../elements/view/header.js'
export class UsersView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor users: Users
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

  _addUser = () => {
    // Logic to create a new job
    console.log('Creating a new job...')
    // You can add your logic here to create a new job
  }

  _handleFabKeyUp = (event) => {
    if (event.key === 'Enter' || event.key === 'Space') {
      event.preventDefault()
      this._addUser()
    }
  }

  _deleteUser = (key: string) => {
    // Logic to delete a user
    console.log(`Deleting user with key: ${key}`)
    // You can add your logic here to delete the user
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
            .key=${key}>
            <custom-icon-button
              slot="trailing"
              icon="delete"
              @click=${(event: CustomEvent) => {
                event.stopPropagation()
                event.preventDefault()
                event.stopImmediatePropagation()
                this._deleteUser(key)
              }}></custom-icon-button>
          </list-item>
        `
      )}
      <md-fab
        @click=${() => this._addUser()}
        @keyup=${(event) => this._handleFabKeyUp(event)}>
        <custom-icon
          icon="add"
          slot="icon"></custom-icon
      ></md-fab>
    `
  }
}

customElements.define('users-view', UsersView)
