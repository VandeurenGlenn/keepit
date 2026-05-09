import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@material/web/textfield/outlined-text-field.js'
import { Invoice } from '../../types/index.js'
import '../elements/view/header.js'

export class InvoiceView extends LiteElement {
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        max-width: 760px;
        padding: 16px;
        box-sizing: border-box;
        gap: 18px;
      }

      .invoice-panel {
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

      @media (max-width: 720px) {
        :host {
          padding: 12px;
        }

        .invoice-panel {
          padding: 16px;
          border-radius: 20px;
        }
      }
    `
  ]

  @property({ type: Object, consumes: true }) accessor invoice: Invoice

  render() {
    return html`
      ${this.invoice
        ? html`
            <view-header
              .title=${this.invoice.name}
              .description=${this.invoice.description || this.invoice.createdAt}
              icon="inventory2"></view-header>
            <section class="invoice-panel">
              <md-outlined-text-field
                label="Invoice Name"
                value=${this.invoice.name}
                @input=${(event: Event) => {
                  const input = event.target as HTMLInputElement
                  this.invoice.name = input.value
                }}></md-outlined-text-field>
              <md-outlined-text-field
                label="Invoice Description"
                value=${this.invoice.description}
                @input=${(event: Event) => {
                  const input = event.target as HTMLInputElement
                  this.invoice.description = input.value
                }}></md-outlined-text-field>
            </section>
          `
        : html`<loading-view></loading-view>`}
    `
  }
}

customElements.define('invoice-view', InvoiceView)
