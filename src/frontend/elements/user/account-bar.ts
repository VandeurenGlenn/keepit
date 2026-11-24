import { LiteElement, css, property, html } from '@vandeurenglenn/lite'
import { User } from '../../../types/index.js'

export class AccountBar extends LiteElement {
  static styles = [
    css`
      :host {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 7px 8px 7px 14px;
        box-sizing: border-box;
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
        border-radius: var(--app-radius-panel);
        color: var(--md-sys-color-on-surface);
        background: var(--app-panel);
        box-shadow: none;
      }
      .user-info {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .avatar {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        flex: none;
        border-radius: 50%;
        object-fit: cover;
        background: var(--app-accent-soft);
        color: var(--app-accent-label);
      }
      .user-info .name {
        max-width: min(33vw, 180px);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.88rem;
        font-weight: 500;
      }
    `
  ]
  @property({ type: Object, consumes: true }) accessor user: User
  @property({ type: String }) accessor brokenPicture = ''

  render() {
    const name = this.user?.name || 'Gebruiker'
    const picture = this.user?.picture
    return html`
      <div class="user-info">
        <span class="name" title=${name}>${name}</span>
        ${picture && picture !== this.brokenPicture
          ? html`<img class="avatar" src=${picture} alt="" referrerpolicy="no-referrer" @error=${() => { this.brokenPicture = picture }}>`
          : html`<span class="avatar" aria-hidden="true">${name.trim().charAt(0).toUpperCase()}</span>`}
      </div>
    `
  }
}
customElements.define('account-bar', AccountBar)
