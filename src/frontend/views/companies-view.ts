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
        height: 100%;
        width: 100%;
        gap: 18px;
        padding: 16px;
        box-sizing: border-box;
      }

      .workspace-panel,
      .list-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
        width: 100%;
        padding: 18px;
        border-radius: 24px;
        background: linear-gradient(180deg, color-mix(in srgb, var(--app-panel) 96%, white 4%), var(--app-panel));
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-strong);
        box-sizing: border-box;
      }

      .workspace-head,
      .panel-title-wrap,
      .top-actions,
      .list-stack {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .panel-kicker {
        display: inline-flex;
        width: fit-content;
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .panel-title-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }

      .panel-title,
      .panel-description {
        margin: 0;
      }

      .panel-title {
        font-size: 1.5rem;
        line-height: 1.08;
      }

      .panel-description {
        color: var(--md-sys-color-on-surface-variant);
        max-width: 60ch;
        line-height: 1.55;
      }

      button {
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
        background: color-mix(in srgb, var(--md-sys-color-surface) 94%, white 6%);
        color: var(--md-sys-color-on-surface);
        border-radius: 999px;
        padding: 10px 16px;
        font: inherit;
        cursor: pointer;
      }

      button.primary {
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--app-accent) 88%, white 12%),
          var(--app-accent-strong)
        );
        color: var(--md-sys-color-on-primary);
        border-color: color-mix(in srgb, var(--app-accent) 82%, white 18%);
      }

      custom-icon-button {
        min-width: 40px;
      }

      @media (max-width: 720px) {
        :host {
          padding: 12px;
        }

        .workspace-panel,
        .list-panel {
          padding: 16px;
          border-radius: 20px;
        }

        .panel-title-row {
          flex-direction: column;
        }

        button.primary {
          width: 100%;
        }
      }
    `
  ]

  render() {
    return html`
      <section class="workspace-panel">
        <div class="workspace-head">
          <span class="panel-kicker">CRM workspace</span>
          <div class="panel-title-row">
            <div class="panel-title-wrap">
              <h2 class="panel-title">Companies</h2>
              <p class="panel-description">
                Beheer klanten en adressen in dezelfde rustige workspace als jobs en invoices.
              </p>
            </div>
            <button
              class="primary"
              @click=${() => this._addCompany()}>
              Nieuwe company
            </button>
          </div>
        </div>
      </section>

      <section class="list-panel">
        <div class="list-stack">
          ${(Object.entries(this.companies || {}) as Array<[string, any]>).map(
            ([uuid, company]) => html`
              <list-item
                .headline=${company.name}
                .subheadline=${company.place?.formattedAddress}
                .key=${uuid}
                .delete=${this._deleteCompany ? this._deleteCompany.bind(this, uuid) : undefined}></list-item>
            `
          )}
        </div>
      </section>
    `
  }
}

customElements.define('companies-view', CompaniesView)
