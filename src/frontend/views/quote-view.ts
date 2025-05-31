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
        max-width: 700px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 2px 16px rgba(0, 0, 0, 0.08);
        font-family: 'Segoe UI', Arial, sans-serif;
      }
      .header {
        display: flex;
        align-items: center;
        gap: 20px;
        margin-bottom: 16px;
      }
      .logo {
        height: 56px;
        width: auto;
      }
      h2 {
        margin: 0;
        font-size: 2rem;
        color: #1a237e;
      }
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        background: #fafbfc;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
      }
      th,
      td {
        padding: 12px 10px;
        text-align: left;
      }
      th {
        background: #e3e7f1;
        color: #1a237e;
        font-weight: 600;
        border-bottom: 2px solid #c5cae9;
      }
      td {
        border-bottom: 1px solid #e0e0e0;
      }
      tfoot td {
        font-weight: bold;
        background: #f5f5f5;
        color: #1a237e;
        border-bottom: none;
      }
      .actions {
        display: flex;
        gap: 12px;
        margin-top: 18px;
        align-items: center;
      }
      input[type='number'],
      input[type='text'] {
        padding: 8px;
        border: 1px solid #c5cae9;
        border-radius: 6px;
        font-size: 1rem;
        width: 120px;
      }
      input[type='text'] {
        width: 220px;
      }
      button {
        background: #1a237e;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 10px 18px;
        font-size: 1rem;
        cursor: pointer;
        transition: background 0.2s;
      }
      button:hover {
        background: #3949ab;
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
          .value=${this.newItem.quantity}
          @input=${(e: Event) => (this.newItem.quantity = Number((e.target as HTMLInputElement).value))} />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Unit Price"
          .value=${this.newItem.unitPrice}
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
