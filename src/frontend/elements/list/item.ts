import { css, html, LiteElement, property } from '@vandeurenglenn/lite'

export class ListItem extends LiteElement {
  @property({ type: String }) accessor headline
  @property({ type: String }) accessor subheadline
  @property({ type: String, renders: false }) accessor key
  @property({ type: String }) accessor icon
  @property({ type: String }) accessor trailingIcon
  @property({ type: String }) accessor image
  @property({ type: String }) accessor trailingImage
  @property({ type: String }) accessor href
  @property({ type: Function }) accessor delete: (event: Event) => void

  static styles = [
    css`
      :host {
        cursor: pointer;
        height: 72px;
        display: flex;
        flex-direction: row;
        box-sizing: border-box;

        padding: 16px;
        box-sizing: border-box;
        background-color: var(--md-sys-color-surface);
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        margin-bottom: 16px;
        color: var(--md-sys-color-on-surface);
        transition: box-shadow 0.3s ease-in-out;
        border: 1px solid var(--md-sys-color-outline);
        border-radius: var(--md-sys-shape-corner-small);
        background-color: var(--md-sys-color-surface-container);
        color: var(--md-sys-color-on-surface-container);
        width: 100%;
      }

      .headline-container {
        display: flex;
        width: 100%;
        flex-direction: column;
      }

      p {
        margin: 0;
        font-size: 0.875rem;
        color: var(--md-sys-color-on-surface-variant);
        font-weight: 400;
        line-height: 1.25rem;
        margin-top: 4px;
        margin-bottom: 0;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        max-width: 100%;
        text-align: left;
      }

      a {
        text-decoration: none;
        color: inherit;
        display: flex;
        flex-direction: row;
        align-items: center;
        width: 100%;
        height: 100%;
      }
    `
  ]

  render() {
    return html`
      <a href=${this.href}>
        <slot name="leading"></slot>
        ${this.icon ? html`<custom-icon icon="${this.icon}"></custom-icon>` : ''}
        ${this.image
          ? html`<img
              src="${this.image}"
              alt="${this.headline}" />`
          : ''}
        <div class="headline-container">
          <strong>${this.headline}</strong>
          <p>${this.subheadline}</p>
        </div>
        ${this.trailingIcon ? html`<custom-icon icon="${this.trailingIcon}"></custom-icon>` : ''}
        ${this.delete
          ? html`<custom-icon-button
              icon="delete"
              @click=${(event) => {
                event.stopPropagation()
                event.preventDefault()
                event.stopImmediatePropagation()
                this.delete(event)
              }}></custom-icon-button>`
          : ''}
        ${this.trailingImage
          ? html`<img
              src="${this.trailingImage}"
              alt="${this.headline}" />`
          : ''}
        <slot name="trailing"></slot>
      </a>
    `
  }
}
customElements.define('list-item', ListItem)
