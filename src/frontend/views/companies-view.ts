import { LiteElement, html, css } from '@vandeurenglenn/lite'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon.js'
export class CompaniesView extends LiteElement {
  static styles = [
    css`
      md-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
      }
      /* Add your styles here */
    `
  ]

  addCompany = () => {
    // Logic to create a new job
    console.log('Creating a new job...')
    // You can add your logic here to create a new job
  }

  _handleFabKeyUp = (event) => {
    if (event.key === 'Enter' || event.key === 'Space') {
      event.preventDefault()
      this.addCompany()
    }
  }

  render() {
    return html`
      <md-fab
        icon="add"
        @click=${() => this.addCompany()}
        @keyup=${(event) => this._handleFabKeyUp(event)}>
        <custom-icon
          icon="add"
          slot="icon"></custom-icon
      ></md-fab>
    `
  }
}

customElements.define('companies-view', CompaniesView)
