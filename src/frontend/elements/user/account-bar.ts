import { LiteElement, css, property, html } from '@vandeurenglenn/lite'
import { User } from '../../../types/index.js'

export class AccountBar extends LiteElement {
  static styles = [
    css`
      :host {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px;
        box-sizing: border-box;
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
        border-radius: 999px;
        color: var(--md-sys-color-on-surface);
        background: color-mix(in srgb, var(--app-panel) 92%, white 8%);
        box-shadow: var(--app-shadow-soft);
        backdrop-filter: blur(16px);
      }
      .user-info {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .user-info img {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        border: 2px solid color-mix(in srgb, var(--app-accent) 28%, white 72%);
      }
      .user-info span {
        font-size: 0.98rem;
        font-weight: 600;
      }
    `
  ]
  @property({ type: Object, consumes: true }) accessor user: User

  render() {
    return html`
      <div class="user-info">
        <span>${this.user?.name}</span>
        <img
          src=${this.user?.picture}
          alt="User Avatar" />
      </div>
    `
  }
}
customElements.define('account-bar', AccountBar)
