import { css, html, LiteElement, property } from '@vandeurenglenn/lite'

export class ViewHeader extends LiteElement {
  @property({ type: String }) accessor title
  @property({ type: String }) accessor description
  @property({ type: String }) accessor icon
  @property({ type: String, reflect: true }) accessor href
  @property({ type: Boolean, reflect: true, renders: false }) accessor disabled

  static styles = [
    css`
      :host {
        display: flex;
        align-items: center;
        min-height: 86px;
        background:
          radial-gradient(circle at 92% 10%, var(--app-accent-soft), transparent 34%),
          linear-gradient(145deg, var(--app-panel-strong), var(--app-panel));
        color: var(--md-sys-color-on-surface);
        border-radius: 20px;
        --custom-icon-color: var(--app-accent);
        --custom-icon-size: 26px;
        width: 100%;
        padding: 18px 20px;
        box-sizing: border-box;
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-soft);
        overflow: hidden;
        position: relative;
      }

      :host::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: var(--app-accent);
      }

      a {
        text-decoration: none;
        color: inherit;
        cursor: pointer;

        display: flex;
        display: grid;
        grid-template-columns: 46px minmax(0, 1fr);
        align-items: center;
        justify-content: center;
        pointer-events: none;
        gap: 2px 14px;
        width: 100%;
      }

      h1,
      p {
        margin: 0;
      }

      h1 {
        grid-column: 2;
        font-size: clamp(1.35rem, 2vw, 1.8rem);
        line-height: 1.05;
      }

      p {
        grid-column: 2;
        max-width: 62ch;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.82rem;
        line-height: 1.45;
      }

      custom-icon {
        grid-column: 1;
        grid-row: 1 / span 2;
        display: grid;
        place-items: center;
        width: 46px;
        height: 46px;
        border-radius: 13px;
        background: var(--app-accent-soft);
      }

      :host([href]) a {
        cursor: pointer;
        pointer-events: auto;
      }

      :host([disabled]) {
        pointer-events: none;
        opacity: 0.52;
        filter: saturate(0.76);
      }
      :host([disabled]) a {
        pointer-events: none;
      }

      @media (max-width: 720px) {
        :host { min-height: 76px; padding: 15px 16px; border-radius: 17px; }
        a { grid-template-columns: 38px minmax(0, 1fr); gap: 2px 11px; }
        custom-icon { width: 38px; height: 38px; --custom-icon-size: 22px; }
      }
    `
  ]
  render() {
    return html`
      <a href=${this.href}>
        <h1>${this.title}</h1>
        <p>${this.description}</p>
        <custom-icon
          .icon=${this.icon}
          size="large"></custom-icon>
      </a>
    `
  }
}
customElements.define('view-header', ViewHeader)
