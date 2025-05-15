import { LiteElement, html, css, query, property } from '@vandeurenglenn/lite'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon.js'

import './../flows/data.js'
import './../flows/data-input.js'
import './../elements/list/item.js'
import { CompaniesMixin } from '../mixins/companies.js'
import '@vandeurenglenn/lite-elements/icon-button.js'
import './../elements/action/bar.js'
import './../elements/action/item.js'
import './../elements/view/header.js'

export class CompaniesView extends CompaniesMixin(LiteElement) {
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

      custom-icon-button {
        min-width: 40px;
      }
    `
  ]

  render() {
    return html`
      <view-header
        title="companies"
        description="Manage your companies"
        icon="source_environment"></view-header>

      ${Object.entries(this.companies || {}).map(
        ([uuid, { name, place }]) => html`
          <list-item
            .headline=${name}
            .subheadline=${place.formattedAddress}
            .key=${uuid}
            ><custom-icon-button
              slot="trailing"
              icon="delete"
              @click=${() => {
                event.stopPropagation()
                event.preventDefault()
                event.stopImmediatePropagation()
                this._deleteCompany(uuid)
              }}></custom-icon-button
          ></list-item>
        `
      )}

      <md-fab
        icon="add"
        @click=${() => this._addCompany()}
        @keyup=${(event) => this._handleFabKeyUp(event)}>
        <custom-icon
          icon="add"
          slot="icon"></custom-icon
      ></md-fab>
    `
  }
}

customElements.define('companies-view', CompaniesView)
