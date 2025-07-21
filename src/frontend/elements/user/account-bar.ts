import { LiteElement, css, property, html } from '@vandeurenglenn/lite'
import { User } from '../../../types/index.js'

export class AccountBar extends LiteElement {
  static styles = [
    css`
      :host {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        box-sizing: border-box;

        color: var(--md-sys-color-on-surface, #000);
        background-color: var(--md-sys-color-surface, #fff);
      }
      .user-info {
        display: flex;
        align-items: center;
      }
      .user-info img {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        margin-right: 8px;
        margin-left: 16px;
      }
      .user-info span {
        font-size: 1em;
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
