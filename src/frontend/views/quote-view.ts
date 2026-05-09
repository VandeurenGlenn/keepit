import { LiteElement, html, css, property } from '@vandeurenglenn/lite'

interface QuoteItem {
  description: string
  quantity: number
  unitPrice: number
}

export class QuoteView extends LiteElement {
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 24px;
        padding: 32px;
        width: min(100%, 700px);
        max-width: 700px;
        background: linear-gradient(180deg, color-mix(in srgb, var(--app-panel) 95%, white 5%), var(--app-panel));
        border-radius: 24px;
        box-shadow: var(--app-shadow-strong);
        border: 1px solid var(--app-border);
        font-family: 'Avenir Next', 'Segoe UI', sans-serif;
        box-sizing: border-box;
      }
      .header {
        display: flex;
        align-items: center;
        gap: 20px;
        margin-bottom: 16px;
        justify-content: space-between;
        flex-wrap: wrap;
      }
      .logo {
        height: 56px;
        width: auto;
      }
      h2 {
        margin: 0;
        font-size: 2rem;
        color: var(--md-sys-color-on-surface);
      }
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        background: color-mix(in srgb, var(--app-panel-strong) 94%, white 6%);
        border-radius: 18px;
        overflow: hidden;
        box-shadow: var(--app-shadow-soft);
        border: 1px solid color-mix(in srgb, var(--app-border) 86%, transparent 14%);
      }
      th,
      td {
        padding: 12px 10px;
        text-align: left;
      }
      th {
        background: color-mix(in srgb, var(--app-accent) 10%, var(--app-panel) 90%);
        color: var(--app-accent-strong);
        font-weight: 600;
        border-bottom: 1px solid color-mix(in srgb, var(--app-border) 90%, transparent 10%);
      }
      td {
        border-bottom: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent 22%);
      }
      tfoot td {
        font-weight: bold;
        background: color-mix(in srgb, var(--app-accent) 8%, var(--app-panel) 92%);
        color: var(--app-accent-strong);
        border-bottom: none;
      }
      .actions {
        display: flex;
        gap: 12px;
        margin-top: 18px;
        align-items: center;
        flex-wrap: wrap;
      }
      input[type='number'],
      input[type='text'] {
        padding: 10px 12px;
        border: 1px solid color-mix(in srgb, var(--app-border) 88%, transparent 12%);
        border-radius: 14px;
        font-size: 1rem;
        width: 120px;
        background: color-mix(in srgb, var(--app-panel-strong) 96%, white 4%);
        color: var(--md-sys-color-on-surface);
      }
      input[type='text'] {
        width: 220px;
      }
      button {
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--app-accent) 88%, white 12%),
          var(--app-accent-strong)
        );
        color: var(--md-sys-color-on-primary);
        border: 1px solid color-mix(in srgb, var(--app-accent) 84%, white 16%);
        border-radius: 999px;
        padding: 10px 18px;
        font-size: 1rem;
        cursor: pointer;
        transition:
          transform 0.18s ease,
          box-shadow 0.18s ease,
          filter 0.18s ease;
      }
      button:hover {
        transform: translateY(-1px);
        box-shadow: var(--app-shadow-soft);
        filter: brightness(1.03);
      }

      @media (max-width: 720px) {
        :host {
          width: 100%;
          padding: 18px;
          gap: 18px;
          border-radius: 20px;
        }

        .actions {
          flex-direction: column;
          align-items: stretch;
        }

        input[type='number'],
        input[type='text'],
        button {
          width: 100%;
        }

        th,
        td {
          padding: 10px 8px;
          font-size: 0.92rem;
        }
      }
    `
  ]

  @property({ type: Array }) accessor items: QuoteItem[] = []
  @property({ type: String }) accessor jobName: string = ''

  private newItem: QuoteItem = { description: '', quantity: 1, unitPrice: 0 }

  render() {
    const total = this.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    return html`
      <div class="header">
        <img
          class="logo"
          src="./assets/dimac.svg"
          alt="Dimac Logo" />
        <h2>Quote for: ${this.jobName}</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Line Total</th>
          </tr>
        </thead>
        <tbody>
          ${this.items.map(
            (item) => html`
              <tr>
                <td>${item.description}</td>
                <td>${item.quantity}</td>
                <td>€${item.unitPrice.toFixed(2)}</td>
                <td>€${(item.quantity * item.unitPrice).toFixed(2)}</td>
              </tr>
            `
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">Total</td>
            <td>€${total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="actions">
        <input
          placeholder="Description"
          .value=${this.newItem.description}
          @input=${(e: Event) => (this.newItem.description = (e.target as HTMLInputElement).value)} />
        <input
          type="number"
          min="1"
          placeholder="Qty"
          .value=${String(this.newItem.quantity)}
          @input=${(e: Event) => (this.newItem.quantity = Number((e.target as HTMLInputElement).value))} />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Unit Price"
          .value=${String(this.newItem.unitPrice)}
          @input=${(e: Event) => (this.newItem.unitPrice = Number((e.target as HTMLInputElement).value))} />
        <button @click=${this.addItem}>Add Item</button>
      </div>
    `
  }

  addItem = () => {
    if (!this.newItem.description || this.newItem.quantity < 1 || this.newItem.unitPrice < 0) return
    this.items = [...this.items, { ...this.newItem }]
    this.newItem = { description: '', quantity: 1, unitPrice: 0 }
    this.requestRender()
  }
}

customElements.define('job-quote-view', QuoteView)
