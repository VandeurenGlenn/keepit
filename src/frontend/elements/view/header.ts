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
        display: block;
        background:
          radial-gradient(circle at top right, color-mix(in srgb, white 18%, transparent 82%), transparent 28%),
          linear-gradient(135deg, color-mix(in srgb, var(--app-accent) 86%, white 14%), var(--md-sys-color-tertiary));
        color: var(--md-sys-color-on-tertiary);
        border-radius: 26px;
        --custom-icon-color: var(--md-sys-color-on-tertiary);
        --custom-icon-size: 110px;
        margin: 16px 0;

        width: 100%;
        padding: 20px 22px;
        box-sizing: border-box;
        border: 1px solid color-mix(in srgb, var(--app-accent) 42%, white 58%);
        box-shadow: 0 24px 54px rgba(78, 41, 18, 0.24);
        overflow: hidden;
      }

      a {
        text-decoration: none;
        color: inherit;
        cursor: pointer;

        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        pointer-events: none;
        gap: 10px;
      }

      h1,
      p {
        margin: 0;
      }

      h1 {
        font-size: clamp(1.6rem, 2vw, 2.2rem);
        line-height: 1.05;
      }

      p {
        max-width: 34ch;
        color: color-mix(in srgb, var(--md-sys-color-on-tertiary) 82%, transparent 18%);
      }

      custom-icon {
        align-self: flex-end;
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
