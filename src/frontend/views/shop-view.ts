import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import { arrayRepeatBy, createKeyedLazyRepeatState, type KeyedLazyRepeatState } from '@vandeurenglenn/lite/helpers.js'
import { api } from '../api/client.js'
import { showToast } from '../helpers/toast.js'
import { ShopProduct } from '../../types/index.js'

export class ShopView extends LiteElement {
  @property({ type: String }) accessor searchQuery = ''
  @property({ type: Array }) accessor products: ShopProduct[] = []
  @property({ type: Boolean }) accessor loading = true
  @property({ type: Array }) accessor autocompleteSuggestions: string[] = []
  @property({ type: Object }) accessor cart: Map<string, number> = new Map()
  @property({ type: Object }) accessor draftQuantities: Map<string, number> = new Map()
  @property({ type: Boolean }) accessor showCart = false
  @property({ type: String }) accessor sourceFilter = 'all'
  @property({ type: String }) accessor categoryFilter = 'all'
  @property({ type: String }) accessor priceFilter = 'all'
  @property({ type: Boolean }) accessor favoritesOnly = false
  @property({ type: Object }) accessor selectedProduct: ShopProduct | undefined

  favoriteNames: Set<string> = new Set()
  private readonly lazyProductState: KeyedLazyRepeatState = createKeyedLazyRepeatState()
  private currentLoadToken = 0
  private autocompleteLoadToken = 0
  private autocompleteTimer: ReturnType<typeof setTimeout> | undefined
  private totalProducts = 0
  private loadingMoreToken: number | undefined
  private readonly productPageSize = 60

  static styles = [
    css`
      :host {
        display: block;
        width: 100%;
        height: 100%;
        overflow: hidden;
        box-sizing: border-box;
        padding: 18px;
        font-family: 'Avenir Next', 'Segoe UI', sans-serif;
        background:
          radial-gradient(
            1200px 500px at 10% -20%,
            color-mix(in srgb, var(--app-accent) 7%, transparent 93%),
            transparent 70%
          ),
          radial-gradient(
            1000px 420px at 100% 120%,
            color-mix(in srgb, var(--app-panel-strong) 24%, transparent 76%),
            transparent 68%
          );
      }

      .container {
        max-width: 1800px;
        width: 100%;
        height: 100%;
        min-height: 0;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .controls {
        display: flex;
        flex: none;
        flex-direction: column;
        gap: 10px;
        padding-bottom: 14px;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
      }

      .search-bar {
        flex: 1;
        min-width: 180px;
      }

      .filter-bar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .filter-select,
      .filter-toggle,
      .clear-filters {
        min-height: 38px;
        border-radius: 11px;
        border: 1px solid color-mix(in srgb, var(--app-border) 75%, transparent 25%);
        background: color-mix(in srgb, var(--md-sys-color-surface) 90%, var(--app-panel) 10%);
        color: var(--md-sys-color-on-surface);
        font: inherit;
        font-size: 0.82rem;
        font-weight: 600;
      }

      .filter-select {
        padding: 0 34px 0 12px;
        cursor: pointer;
      }

      .filter-toggle {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 0 12px;
        cursor: pointer;
        user-select: none;
      }

      .filter-toggle input {
        width: 16px;
        height: 16px;
        margin: 0;
        accent-color: var(--app-accent);
      }

      .clear-filters {
        padding: 0 12px;
        cursor: pointer;
      }

      .clear-filters:disabled {
        opacity: 0.45;
        cursor: default;
      }

      .filter-select:focus-visible,
      .filter-toggle:focus-within,
      .clear-filters:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-accent) 22%, transparent 78%);
      }

      .result-count {
        margin-left: auto;
        padding: 0 4px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.8rem;
        font-weight: 600;
        white-space: nowrap;
      }

      .search-input {
        width: 100%;
        padding: 13px 16px;
        border: 1px solid color-mix(in srgb, var(--app-border) 75%, transparent 25%);
        border-radius: 999px;
        background: color-mix(in srgb, var(--md-sys-color-surface) 90%, var(--app-panel) 10%);
        color: var(--md-sys-color-on-surface);
        font-size: 0.95rem;
        font-weight: 500;
        letter-spacing: 0.005em;
        font: inherit;
        box-sizing: border-box;
        box-shadow: inset 0 1px 0 color-mix(in srgb, white 12%, transparent 88%);
        transition:
          border-color 180ms ease,
          box-shadow 180ms ease,
          background-color 180ms ease;
      }

      .search-input::placeholder {
        color: color-mix(in srgb, var(--md-sys-color-on-surface-variant) 78%, transparent 22%);
      }

      .search-input:focus-visible {
        outline: none;
        border-color: color-mix(in srgb, var(--app-accent) 70%, var(--app-border) 30%);
        box-shadow:
          0 0 0 3px color-mix(in srgb, var(--app-accent) 22%, transparent 78%),
          inset 0 1px 0 color-mix(in srgb, white 12%, transparent 88%);
      }

      .cart-button,
      .cart-icon-button,
      .qty-button,
      .detail-button,
      .checkout-button,
      .close-button,
      .remove-btn {
        border: none;
        font: inherit;
        cursor: pointer;
        user-select: none;
        transition:
          transform 150ms ease,
          box-shadow 150ms ease,
          border-color 150ms ease,
          background-color 150ms ease,
          filter 150ms ease;
      }

      .cart-button:focus-visible,
      .cart-icon-button:focus-visible,
      .qty-button:focus-visible,
      .detail-button:focus-visible,
      .favorite-button:focus-visible,
      .checkout-button:focus-visible,
      .close-button:focus-visible,
      .remove-btn:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-accent) 26%, transparent 74%);
      }

      .cart-button {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 42px;
        padding: 0 18px;
        border-radius: 12px;
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--app-accent) 76%, white 24%),
          color-mix(in srgb, var(--app-accent-strong) 95%, black 5%)
        );
        color: var(--md-sys-color-on-primary);
        font-weight: 700;
        font-size: 0.9rem;
        letter-spacing: 0.004em;
        border: 1px solid color-mix(in srgb, var(--app-accent-strong) 70%, transparent 30%);
        box-shadow: 0 3px 10px color-mix(in srgb, var(--app-accent-strong) 12%, transparent 88%);
        white-space: nowrap;
      }

      .cart-button:hover {
        transform: translateY(-1px);
        filter: saturate(1.02);
      }

      .cart-button:active {
        transform: translateY(0);
      }

      .cart-count {
        position: absolute;
        top: -7px;
        right: -7px;
        width: 22px;
        height: 22px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--app-accent) 88%, white 12%);
        color: var(--md-sys-color-on-primary);
        border: 1px solid color-mix(in srgb, var(--app-accent-strong) 72%, transparent 28%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.72rem;
        font-weight: 700;
      }

      .products-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(272px, 1fr));
        gap: 16px;
        width: 100%;
      }

      .products-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 2px 4px 18px 2px;
        scrollbar-gutter: stable;
        overscroll-behavior: contain;
      }

      .product-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 260px;
        padding: 16px;
        border-radius: 16px;
        background:
          linear-gradient(180deg, color-mix(in srgb, white 2%, transparent 98%), transparent 34%),
          linear-gradient(
            160deg,
            color-mix(in srgb, var(--app-panel) 94%, black 6%),
            color-mix(in srgb, var(--app-panel-strong) 88%, black 12%)
          );
        border: 1px solid color-mix(in srgb, var(--app-border) 82%, transparent 18%);
        box-shadow:
          0 8px 20px color-mix(in srgb, black 24%, transparent 76%),
          inset 0 1px 0 color-mix(in srgb, white 4%, transparent 96%);
        transition:
          transform 180ms ease,
          border-color 180ms ease,
          box-shadow 180ms ease;
        cursor: pointer;
        box-sizing: border-box;
      }

      .product-card:hover {
        transform: translateY(-2px);
        border-color: color-mix(in srgb, var(--app-accent) 34%, var(--app-border) 66%);
        box-shadow:
          0 10px 24px color-mix(in srgb, black 30%, transparent 70%),
          0 0 0 1px color-mix(in srgb, var(--app-accent) 10%, transparent 90%) inset;
      }

      .product-image-wrap {
        position: relative;
        width: 100%;
        height: 176px;
        padding: 4px;
        box-sizing: border-box;
        border-radius: 12px;
        overflow: hidden;
        background: white;
      }

      .product-image {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
        border-radius: 8px;
      }

      .product-name {
        font-size: 0.98rem;
        font-weight: 700;
        line-height: 1.3;
        letter-spacing: 0.004em;
        height: 3.9em;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .product-price {
        font-size: 1.38rem;
        font-weight: 800;
        letter-spacing: 0.004em;
        line-height: 1.1;
        font-variant-numeric: tabular-nums;
        color: var(--app-accent);
        text-shadow: none;
      }

      .product-unit,
      .product-source {
        font-size: 0.8rem;
        font-weight: 500;
        letter-spacing: 0.005em;
        color: var(--md-sys-color-on-surface-variant);
      }

      .product-description {
        margin-top: 2px;
        font-size: 0.82rem;
        line-height: 1.35;
        color: var(--md-sys-color-on-surface-variant);
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .product-specs {
        border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent 28%);
        border-radius: 12px;
        overflow: hidden;
        background: color-mix(in srgb, var(--app-panel-strong) 82%, #000 18%);
      }

      .product-specs summary {
        padding: 9px 11px;
        cursor: pointer;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.78rem;
        font-weight: 700;
      }

      .product-spec-list {
        display: grid;
        grid-template-columns: minmax(90px, 0.8fr) minmax(0, 1.2fr);
        margin: 0;
        padding: 0 11px 10px;
        gap: 5px 10px;
        font-size: 0.74rem;
      }

      .product-spec-list dt,
      .product-spec-list dd {
        margin: 0;
        overflow-wrap: anywhere;
      }

      .product-spec-list dt {
        color: var(--md-sys-color-on-surface-variant);
        font-weight: 600;
      }

      .product-spec-list dd {
        color: var(--md-sys-color-on-surface);
      }

      .product-sources {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }

      .product-source-link {
        color: var(--md-sys-color-primary, #3451b2);
        font-size: 12px;
        text-decoration: none;
      }

      .product-source-link:hover {
        text-decoration: underline;
      }

      .product-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 2px;
      }

      .meta-badge {
        display: inline-flex;
        align-items: center;
        padding: 3px 8px;
        border-radius: 999px;
        font-size: 0.67rem;
        font-weight: 500;
        letter-spacing: 0.01em;
        color: color-mix(in srgb, var(--md-sys-color-on-surface-variant) 88%, transparent 12%);
        background: color-mix(in srgb, var(--app-panel-strong) 72%, black 28%);
        border: 1px solid color-mix(in srgb, var(--app-border) 62%, transparent 38%);
      }

      .cart-icon-button {
        margin-top: auto;
        width: 40px;
        height: 40px;
        padding: 0;
        border-radius: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--app-accent) 80%, white 20%),
          color-mix(in srgb, var(--app-accent-strong) 94%, black 6%)
        );
        color: var(--md-sys-color-on-primary);
        font-weight: 700;
        font-size: 0.9rem;
        letter-spacing: 0.004em;
        border: 1px solid color-mix(in srgb, var(--app-accent-strong) 72%, transparent 28%);
        box-shadow: 0 2px 8px color-mix(in srgb, var(--app-accent-strong) 12%, transparent 88%);
        flex-shrink: 0;
      }

      .cart-icon {
        width: 18px;
        height: 18px;
        display: block;
      }

      .quantity-control {
        display: inline-flex;
        align-items: center;
        min-height: 40px;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent 28%);
        background: color-mix(in srgb, var(--app-panel-strong) 82%, black 18%);
        overflow: hidden;
      }

      .qty-button {
        width: 34px;
        height: 38px;
        padding: 0;
        background: transparent;
        color: var(--md-sys-color-on-surface);
        font-size: 1rem;
        font-weight: 700;
      }

      .qty-button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .qty-input {
        width: 44px;
        height: 38px;
        border: none;
        background: transparent;
        color: var(--md-sys-color-on-surface);
        text-align: center;
        font: inherit;
        font-size: 0.86rem;
        font-weight: 600;
        -moz-appearance: textfield;
      }

      .qty-input::-webkit-outer-spin-button,
      .qty-input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      .qty-input:focus-visible {
        outline: none;
      }

      .product-actions {
        display: flex;
        gap: 6px;
        margin-top: auto;
      }

      .detail-button {
        width: 100%;
        min-height: 36px;
        padding: 0 12px;
        border-radius: 10px;
        border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent 28%);
        background: color-mix(in srgb, var(--app-panel-strong) 82%, black 18%);
        color: var(--md-sys-color-on-surface);
        font-size: 0.8rem;
        font-weight: 700;
        cursor: pointer;
      }

      .detail-button:hover {
        border-color: color-mix(in srgb, var(--app-accent) 34%, var(--app-border) 66%);
        color: var(--app-accent);
      }

      .favorite-button {
        width: 40px;
        height: 40px;
        padding: 0;
        border-radius: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--app-panel-strong) 82%, black 18%);
        color: var(--md-sys-color-on-surface);
        font-weight: 600;
        font-size: 0.95rem;
        line-height: 1;
        border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent 28%);
        cursor: pointer;
        flex-shrink: 0;
      }

      .favorite-button:hover {
        transform: translateY(-1px);
        border-color: color-mix(in srgb, var(--app-accent) 24%, var(--app-border) 76%);
      }

      .favorite-button:active {
        transform: translateY(0);
      }

      .cart-icon-button:hover,
      .qty-button:hover,
      .checkout-button:hover {
        transform: translateY(-1px);
        filter: saturate(1.02);
      }

      .cart-icon-button:active,
      .qty-button:active,
      .checkout-button:active {
        transform: translateY(0);
      }

      .loading,
      .empty,
      .empty-cart {
        padding: 28px 20px;
        text-align: center;
        color: var(--md-sys-color-on-surface-variant);
      }

      .cart-modal {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        box-sizing: border-box;
        background: rgba(0, 0, 0, 0.48);
        z-index: 1000;
      }

      .cart-modal.open {
        display: flex;
      }

      .product-modal {
        position: fixed;
        inset: 0;
        z-index: 1100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        box-sizing: border-box;
        background: rgb(0 0 0 / 62%);
        backdrop-filter: blur(5px);
      }

      .product-detail {
        width: min(1040px, 100%);
        max-height: min(90vh, 980px);
        overflow: auto;
        display: grid;
        grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.15fr);
        gap: 28px;
        padding: 24px;
        border-radius: 24px;
        box-sizing: border-box;
        background: color-mix(in srgb, var(--md-sys-color-surface) 94%, var(--app-panel) 6%);
        border: 1px solid color-mix(in srgb, var(--app-border) 82%, transparent 18%);
        box-shadow: 0 28px 80px rgb(0 0 0 / 45%);
      }

      .product-detail.no-media {
        grid-template-columns: 1fr;
      }

      .product-detail-media {
        position: sticky;
        top: 0;
        align-self: start;
      }

      .product-detail-media .product-image-wrap {
        height: min(420px, 48vh);
      }

      .product-detail-content {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 16px;
      }

      .product-detail-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .product-detail-title {
        margin: 0 0 8px;
        font-size: clamp(1.35rem, 3vw, 2rem);
        line-height: 1.18;
      }

      .product-detail-description {
        margin: 0;
        color: var(--md-sys-color-on-surface-variant);
        line-height: 1.55;
      }

      .product-detail-section h3 {
        margin: 0 0 10px;
        font-size: 0.95rem;
      }

      .product-detail-section .product-spec-list {
        padding: 0;
        font-size: 0.82rem;
      }

      .product-detail-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        padding-top: 4px;
      }

      .cart-content {
        width: min(560px, 100%);
        max-height: min(80vh, 900px);
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 22px;
        border-radius: 24px;
        background: color-mix(in srgb, var(--md-sys-color-surface) 92%, var(--app-panel) 8%);
        border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent 22%);
        box-shadow: var(--app-shadow-strong);
      }

      .cart-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .close-button {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: color-mix(in srgb, var(--md-sys-color-surface) 92%, black 8%);
        color: var(--md-sys-color-on-surface-variant);
        border: 1px solid color-mix(in srgb, var(--app-border) 70%, transparent 30%);
        font-size: 1rem;
      }

      .cart-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 72px auto;
        align-items: center;
        gap: 10px;
        padding: 12px 0;
        border-bottom: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent 28%);
      }

      .cart-item-name {
        font-weight: 600;
      }

      .cart-item-qty {
        width: 72px;
        padding: 8px 10px;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--app-border) 85%, transparent 15%);
        background: color-mix(in srgb, var(--md-sys-color-surface) 94%, white 6%);
        color: var(--md-sys-color-on-surface);
        box-sizing: border-box;
      }

      .remove-btn {
        min-height: 36px;
        padding: 0 12px;
        border-radius: 10px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--md-sys-color-error) 85%, black 15%);
        color: var(--md-sys-color-on-error);
        font-size: 0.82rem;
        font-weight: 600;
        letter-spacing: 0.004em;
      }

      .cart-total {
        padding-top: 14px;
        margin-top: 6px;
        border-top: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent 28%);
        text-align: right;
        font-size: 1.1rem;
        font-weight: 800;
      }

      .checkout-button {
        min-height: 42px;
        padding: 0 16px;
        border-radius: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--app-accent) 80%, white 20%),
          color-mix(in srgb, var(--app-accent-strong) 94%, black 6%)
        );
        color: var(--md-sys-color-on-primary);
        font-weight: 700;
        font-size: 0.9rem;
        letter-spacing: 0.004em;
        border: 1px solid color-mix(in srgb, var(--app-accent-strong) 70%, transparent 30%);
        box-shadow: 0 3px 10px color-mix(in srgb, var(--app-accent-strong) 12%, transparent 88%);
      }

      @media (max-width: 1100px) {
        .products-grid {
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        }
      }
      @media (max-width: 720px) {
        :host {
          padding: 12px;
        }
        .products-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .header {
          gap: 8px;
        }
        .cart-button {
          padding: 0 13px;
        }
        .filter-bar {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .filter-select,
        .filter-toggle,
        .clear-filters {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
        .result-count {
          grid-column: 1 / -1;
          margin-left: 0;
        }
        .product-card {
          min-height: 0;
          gap: 8px;
          padding: 12px;
          border-radius: 14px;
        }
        .product-image-wrap {
          height: clamp(136px, 23vw, 160px);
        }
        .product-name {
          height: 2.6em;
          -webkit-line-clamp: 2;
        }
        .product-price {
          font-size: 1.18rem;
        }
        .product-actions {
          flex-wrap: wrap;
        }
        .product-modal {
          padding: 10px;
        }
        .product-detail {
          grid-template-columns: 1fr;
          gap: 18px;
          padding: 16px;
          border-radius: 18px;
        }
        .product-detail-media {
          position: static;
        }
        .product-detail-media .product-image-wrap {
          height: 260px;
        }
      }

      @media (max-width: 460px) {
        :host {
          padding: 10px;
        }
        .header {
          flex-wrap: wrap;
        }
        .search-bar {
          flex-basis: 100%;
          min-width: 0;
        }
        .cart-button {
          width: 100%;
        }
        .filter-bar,
        .products-grid {
          grid-template-columns: 1fr;
        }
        .product-image-wrap {
          height: 160px;
        }
      }
    `
  ]

  async connectedCallback() {
    super.connectedCallback()
    this.searchQuery = new URLSearchParams(location.hash.split('?')[1] || '').get('search') || ''
    await this.loadProducts()
  }

  async loadProducts(search = this.searchQuery.trim(), loadToken = ++this.currentLoadToken) {
    if (loadToken !== this.currentLoadToken) return
    this.loading = true

    try {
      const initialLimit = this.getInitialProductLimit()
      const firstPage = await api.getShopProducts(search || undefined, {
        limit: initialLimit,
        offset: 0,
        ...this.getProductFilters()
      })

      if (loadToken !== this.currentLoadToken) return

      this.products = firstPage.products || []
      this.totalProducts = firstPage.total

      // Load favorites
      const favorites = await api.getFavorites()
      if (loadToken !== this.currentLoadToken) return
      this.favoriteNames = new Set(favorites.map((m) => m.name))
    } catch (error) {
      if (loadToken !== this.currentLoadToken) return
      console.error('Failed to load products:', error)
      this.products = []
    } finally {
      if (loadToken === this.currentLoadToken) {
        this.loading = false
      }
    }
  }

  private getInitialProductLimit(): number {
    if (typeof window === 'undefined') return 24

    const cardApproxHeight = 300
    const cardApproxWidth = 300
    const viewportHeight = Math.max(window.innerHeight, 600)
    const viewportWidth = Math.max(window.innerWidth, 360)
    const rows = Math.max(2, Math.ceil(viewportHeight / cardApproxHeight) + 1)
    const columns = Math.max(1, Math.ceil(viewportWidth / cardApproxWidth))

    return Math.max(12, Math.min(60, rows * columns))
  }

  private async loadRemainingProducts(search: string | undefined, offset: number, loadToken: number): Promise<void> {
    if (this.loading || this.loadingMoreToken === loadToken || offset >= this.totalProducts) return

    this.loadingMoreToken = loadToken
    try {
      const remaining = await api.getShopProducts(search, {
        limit: this.productPageSize,
        offset,
        ...this.getProductFilters()
      })
      if (loadToken !== this.currentLoadToken) return
      if (!remaining.products?.length) return

      this.products = [...this.products, ...remaining.products]
    } catch (error) {
      if (loadToken !== this.currentLoadToken) return
      console.error('Failed to load remaining products:', error)
    } finally {
      if (this.loadingMoreToken === loadToken) this.loadingMoreToken = undefined
    }
  }

  private getProductFilters() {
    return {
      source: this.sourceFilter,
      category: this.categoryFilter,
      price: this.priceFilter,
      favoritesOnly: this.favoritesOnly
    }
  }

  private handleProductScroll = (event: Event) => {
    const target = event.currentTarget as HTMLElement
    const remainingScroll = target.scrollHeight - target.scrollTop - target.clientHeight
    if (remainingScroll > target.clientHeight) return

    void this.loadRemainingProducts(this.searchQuery || undefined, this.products.length, this.currentLoadToken)
  }

  private async refreshFavorites(): Promise<void> {
    try {
      const favorites = await api.getFavorites()
      this.favoriteNames = new Set(favorites.map((m) => m.name))
      if (this.favoritesOnly) {
        await this.loadProducts()
      } else {
        this.requestRender()
      }
    } catch (error) {
      console.error('Failed to refresh favorites:', error)
    }
  }

  handleSearch = (event: Event) => {
    const input = event.target as HTMLInputElement | null
    this.searchQuery = input?.value || ''
    const loadToken = ++this.currentLoadToken
    this.loading = true

    if (this.autocompleteTimer) {
      clearTimeout(this.autocompleteTimer)
    }

    const query = this.searchQuery.trim()
    if (!query) {
      this.autocompleteSuggestions = []
      void this.loadProducts('', loadToken)
      return
    }

    this.autocompleteTimer = setTimeout(() => {
      void this.loadAutocompleteSuggestions(query)
      void this.loadProducts(query, loadToken)
    }, 200)
  }

  private async loadAutocompleteSuggestions(query: string): Promise<void> {
    const token = ++this.autocompleteLoadToken

    try {
      const data = await api.getShopAutocomplete(query)
      if (token !== this.autocompleteLoadToken) return
      this.autocompleteSuggestions = data.suggestions || []
    } catch (error) {
      if (token !== this.autocompleteLoadToken) return
      console.error('Failed to load autocomplete suggestions:', error)
      this.autocompleteSuggestions = []
    }
  }

  getProductMeta(product: ShopProduct): string[] {
    const meta: string[] = []
    if (product.articleNumber) meta.push(`ART: ${product.articleNumber}`)
    if (product.productNumber) meta.push(`PROD: ${product.productNumber}`)
    if (typeof product.packagingQuantity === 'number') meta.push(`VPH: ${product.packagingQuantity}`)
    return meta
  }

  getProductDescription(product: ShopProduct): string {
    const description = (product.description || '').trim()
    if (!description) return ''

    const lowered = description.toLowerCase()
    if (
      lowered === 'winkelwagen' ||
      lowered === 'artikel' ||
      lowered.includes('bevestiging terug toon alle artikelen')
    ) {
      return ''
    }

    return description
  }

  getProductTechnicalData(product: ShopProduct): Array<[string, string]> {
    if (!product.technicalData) return []

    return Object.entries(product.technicalData)
      .map(([label, value]) => [label.trim(), String(value).trim()] as [string, string])
      .filter(([label, value]) => Boolean(label && value))
      .sort(([left], [right]) => left.localeCompare(right, 'nl'))
  }

  getProductSources(product: ShopProduct) {
    return (product.dataSources || []).filter(
      (source) => source.pageUrl.startsWith('https://') && Boolean(source.provider)
    )
  }

  getManufacturerData(product: ShopProduct): Array<[string, string]> {
    if (!product.manufacturerData) return []
    return Object.entries(product.manufacturerData)
      .map(([label, value]) => [label.trim(), String(value).trim()] as [string, string])
      .filter(([label, value]) => Boolean(label && value))
  }

  getFilteredProducts(): ShopProduct[] {
    return this.products
  }

  hasActiveFilters(): boolean {
    return (
      this.sourceFilter !== 'all' || this.categoryFilter !== 'all' || this.priceFilter !== 'all' || this.favoritesOnly
    )
  }

  clearFilters() {
    this.sourceFilter = 'all'
    this.categoryFilter = 'all'
    this.priceFilter = 'all'
    this.favoritesOnly = false
    void this.loadProducts()
  }

  addToCart(product: ShopProduct) {
    this.addToCartWithQuantity(product, 1)
  }

  addToCartWithQuantity(product: ShopProduct, quantity: number) {
    const nextQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1
    const nextCart = new Map(this.cart)
    nextCart.set(product.id, (nextCart.get(product.id) || 0) + nextQuantity)
    this.cart = nextCart
    // Track in history
    void api.addToHistory({
      name: product.name,
      quantity: product.quantity || 1,
      unit: product.unit,
      unitPrice: product.price,
      articleNumber: product.articleNumber,
      productNumber: product.productNumber,
      packagingQuantity: product.packagingQuantity,
      description: product.description,
      image: product.image,
      technicalData: product.technicalData
    })
  }

  getDraftQuantity(productId: string): number {
    return this.draftQuantities.get(productId) || 1
  }

  setDraftQuantity(productId: string, quantity: number) {
    const nextQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1
    const nextDrafts = new Map(this.draftQuantities)
    nextDrafts.set(productId, nextQuantity)
    this.draftQuantities = nextDrafts
  }

  adjustDraftQuantity(productId: string, delta: number) {
    this.setDraftQuantity(productId, this.getDraftQuantity(productId) + delta)
  }

  removeFromCart(productId: string) {
    const nextCart = new Map(this.cart)
    nextCart.delete(productId)
    this.cart = nextCart
  }

  updateQuantity(productId: string, quantity: number) {
    const nextQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1
    const nextCart = new Map(this.cart)
    nextCart.set(productId, nextQuantity)
    this.cart = nextCart
  }

  toggleCart() {
    this.showCart = !this.showCart
  }

  openProduct(product: ShopProduct) {
    this.selectedProduct = product
  }

  closeProduct() {
    this.selectedProduct = undefined
  }

  getCartItem(productId: string): ShopProduct | undefined {
    return this.products.find((product) => product.id === productId)
  }

  getCartTotal(): number {
    let total = 0
    this.cart.forEach((quantity, productId) => {
      const product = this.getCartItem(productId)
      if (product) {
        total += product.price * quantity
      }
    })
    return total
  }

  getCartItemCount(): number {
    let count = 0
    this.cart.forEach((quantity) => {
      count += quantity
    })
    return count
  }

  async checkout() {
    const items = Array.from(this.cart.entries()).map(([productId, quantity]) => ({
      productId,
      quantity
    }))

    try {
      const result = await api.createShopOrder({
        items,
        notes: 'Order placed via shop'
      })

      if (result.ok) {
        showToast(`Bestelling #${result.orderId} is aangemaakt.`)
        this.cart = new Map()
        this.showCart = false
      } else {
        showToast('De bestelling kon niet aangemaakt worden.')
      }
    } catch (error) {
      console.error('Checkout error:', error)
      showToast('De bestelling kon niet afgerond worden.')
    }
  }

  private renderProductDetail(product?: ShopProduct) {
    if (!product) return ''

    const meta = this.getProductMeta(product)
    const description = this.getProductDescription(product)
    const technicalData = this.getProductTechnicalData(product)
    const manufacturerData = this.getManufacturerData(product)
    const sources = this.getProductSources(product)
    const draftQuantity = this.getDraftQuantity(product.id)

    return html`
      <div
        class="product-modal"
        role="dialog"
        aria-modal="true"
        aria-label=${product.name}
        @click=${(event: Event) => {
          if (event.target === event.currentTarget) this.closeProduct()
        }}>
        <article class=${`product-detail${product.image ? '' : ' no-media'}`}>
          ${product.image
            ? html`<div class="product-detail-media">
                <div class="product-image-wrap">
                  <img
                    class="product-image"
                    src=${`/api/shop/image?variant=detail&url=${encodeURIComponent(product.image)}`}
                    alt=${product.name}
                    decoding="async"
                    @error=${(event: Event) => {
                      ;(event.currentTarget as HTMLImageElement).hidden = true
                    }} />
                </div>
              </div>`
            : ''}

          <div class="product-detail-content">
            <div class="product-detail-header">
              <div>
                <h2 class="product-detail-title">${product.name}</h2>
                <div class="product-price">€${product.price.toFixed(2)}</div>
                ${product.unit ? html`<span class="product-unit">per ${product.unit}</span>` : ''}
              </div>
              <button
                class="close-button"
                aria-label="Sluit productdetails"
                @click=${() => this.closeProduct()}>
                ✕
              </button>
            </div>

            ${description ? html`<p class="product-detail-description">${description}</p>` : ''}
            ${meta.length
              ? html`<div class="product-meta">
                  ${meta.map((label) => html`<span class="meta-badge">${label}</span>`)}
                </div>`
              : ''}
            ${technicalData.length
              ? html`<section class="product-detail-section">
                  <h3>Technische informatie</h3>
                  <dl class="product-spec-list">
                    ${technicalData.map(
                      ([label, value]) =>
                        html`<dt>${label}</dt>
                          <dd>${value}</dd>`
                    )}
                  </dl>
                </section>`
              : ''}
            ${manufacturerData.length
              ? html`<section class="product-detail-section">
                  <h3>Fabrikantgegevens</h3>
                  <dl class="product-spec-list">
                    ${manufacturerData.map(
                      ([label, value]) =>
                        html`<dt>${label}</dt>
                          <dd>${value}</dd>`
                    )}
                  </dl>
                </section>`
              : ''}
            ${sources.length
              ? html`<section class="product-detail-section">
                  <h3>Bronnen</h3>
                  <div class="product-sources">
                    ${sources.map(
                      (source) =>
                        html`<a
                          class="product-source-link"
                          href=${source.pageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          >${source.provider}</a
                        >`
                    )}
                  </div>
                </section>`
              : ''}

            <div class="product-detail-actions">
              <button
                class="favorite-button"
                title="Favoriet"
                @click=${() => {
                  const action = this.favoriteNames.has(product.name)
                    ? api.removeFromFavorites(product.name)
                    : api.addToFavorites({
                        name: product.name,
                        quantity: product.quantity || 1,
                        unit: product.unit,
                        unitPrice: product.price,
                        articleNumber: product.articleNumber,
                        productNumber: product.productNumber,
                        packagingQuantity: product.packagingQuantity,
                        description: product.description,
                        image: product.image,
                        technicalData: product.technicalData
                      })
                  void action.then(() => this.refreshFavorites())
                }}>
                ${this.favoriteNames.has(product.name) ? '★' : '☆'}
              </button>
              <div class="quantity-control">
                <button
                  class="qty-button"
                  ?disabled=${draftQuantity <= 1}
                  @click=${() => this.adjustDraftQuantity(product.id, -1)}>
                  −
                </button>
                <input
                  class="qty-input"
                  type="number"
                  min="1"
                  .value=${String(draftQuantity)}
                  @input=${(event: Event) => {
                    const input = event.target as HTMLInputElement
                    this.setDraftQuantity(product.id, Number.parseInt(input.value || '1', 10))
                  }} />
                <button
                  class="qty-button"
                  @click=${() => this.adjustDraftQuantity(product.id, 1)}>
                  +
                </button>
              </div>
              <button
                class="cart-button"
                @click=${() => this.addToCartWithQuantity(product, this.getDraftQuantity(product.id))}>
                Voeg toe aan winkelmand
              </button>
            </div>
          </div>
        </article>
      </div>
    `
  }

  private renderProducts(products: ShopProduct[]) {
    return arrayRepeatBy(
      products,
      (product: ShopProduct) => product.id,
      (product: ShopProduct) => {
        const draftQuantity = this.getDraftQuantity(product.id)

        return html`
          <div
            class="product-card"
            @click=${() => this.openProduct(product)}>
            ${product.image
              ? html`<div class="product-image-wrap">
                  <img
                    class="product-image"
                    src=${`/api/shop/image?variant=card&url=${encodeURIComponent(product.image)}`}
                    alt=${product.name}
                    loading="lazy"
                    decoding="async"
                    @error=${(event: Event) => {
                      ;(event.currentTarget as HTMLImageElement).hidden = true
                    }} />
                </div>`
              : ''}
            <div class="product-name">${product.name}</div>
            <div class="product-price">€${product.price.toFixed(2)}</div>
            <button
              class="detail-button"
              @click=${() => this.openProduct(product)}>
              Bekijk product
            </button>
            <div
              class="product-actions"
              @click=${(event: Event) => event.stopPropagation()}
              @keydown=${(event: Event) => event.stopPropagation()}>
              <button
                class="favorite-button"
                title=${this.favoriteNames.has(product.name) ? 'Uit favorieten verwijderen' : 'Toevoegen aan favorieten'}
                aria-label=${this.favoriteNames.has(product.name) ? `${product.name} uit favorieten verwijderen` : `${product.name} toevoegen aan favorieten`}
                @click=${() => {
                  if (this.favoriteNames.has(product.name)) {
                    void api.removeFromFavorites(product.name).then(() => this.refreshFavorites())
                  } else {
                    void api
                      .addToFavorites({
                        name: product.name,
                        quantity: product.quantity || 1,
                        unit: product.unit,
                        unitPrice: product.price,
                        articleNumber: product.articleNumber,
                        productNumber: product.productNumber,
                        packagingQuantity: product.packagingQuantity,
                        description: product.description,
                        image: product.image,
                        technicalData: product.technicalData
                      })
                      .then(() => this.refreshFavorites())
                  }
                }}>
                ${this.favoriteNames.has(product.name) ? '★' : '☆'}
              </button>
              <div class="quantity-control">
                <button
                  class="qty-button"
                  ?disabled=${draftQuantity <= 1}
                  title="Aantal verlagen"
                  aria-label=${`Aantal ${product.name} verlagen`}
                  @click=${() => this.adjustDraftQuantity(product.id, -1)}>
                  -
                </button>
                <input
                  class="qty-input"
                  type="number"
                  min="1"
                  aria-label=${`Aantal ${product.name}`}
                  .value=${String(draftQuantity)}
                  @input=${(event: Event) => {
                    const input = event.target as HTMLInputElement | null
                    this.setDraftQuantity(product.id, Number.parseInt(input?.value || '1', 10))
                  }} />
                <button
                  class="qty-button"
                  title="Aantal verhogen"
                  aria-label=${`Aantal ${product.name} verhogen`}
                  @click=${() => this.adjustDraftQuantity(product.id, 1)}>
                  +
                </button>
              </div>
              <button
                class="cart-icon-button"
                title="Toevoegen aan winkelwagen"
                aria-label=${`${product.name} toevoegen aan winkelwagen`}
                @click=${() => this.addToCartWithQuantity(product, draftQuantity)}>
                <svg
                  class="cart-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true">
                  <path
                    d="M3 4h2.2c.5 0 1 .4 1.1.9L6.7 7h12.7c.8 0 1.4.7 1.2 1.5l-1 5.2c-.1.6-.6 1-1.2 1H8.3"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round" />
                  <circle
                    cx="9.2"
                    cy="18.2"
                    r="1.4"
                    fill="currentColor" />
                  <circle
                    cx="17.2"
                    cy="18.2"
                    r="1.4"
                    fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>
        `
      },
      this.lazyProductState
    )
  }

  render() {
    const filteredProducts = this.getFilteredProducts()
    return html`
      <div class="container">
        <div class="controls">
          <div class="header">
            <div class="search-bar">
              <input
                class="search-input"
                type="text"
                list="shop-autocomplete"
                autocomplete="off"
                placeholder="Zoek op product, artikel- of productnummer..."
                .value=${this.searchQuery}
                @input=${this.handleSearch} />
              <datalist id="shop-autocomplete">
                ${this.autocompleteSuggestions.map((suggestion) => html`<option value=${suggestion}></option> `)}
              </datalist>
            </div>

            <button
              class="cart-button"
              @click=${this.toggleCart}>
              Winkelmand
              ${this.getCartItemCount() > 0 ? html`<span class="cart-count">${this.getCartItemCount()}</span>` : ''}
            </button>
          </div>

          <div
            class="filter-bar"
            aria-label="Productfilters">
            <select
              class="filter-select"
              aria-label="Leverancier"
              .value=${this.sourceFilter}
              @change=${(event: Event) => {
                this.sourceFilter = (event.target as HTMLSelectElement).value
                void this.loadProducts()
              }}>
              <option value="all">Alle leveranciers</option>
              <option value="desco">Desco</option>
              <option value="alelek">Alelek</option>
            </select>
            <select
              class="filter-select"
              aria-label="Categorie"
              .value=${this.categoryFilter}
              @change=${(event: Event) => {
                this.categoryFilter = (event.target as HTMLSelectElement).value
                void this.loadProducts()
              }}>
              <option value="all">Alle categorieën</option>
              <option value="Sanitair">Sanitair</option>
              <option value="Kranen">Kranen</option>
              <option value="Verwarming">Verwarming</option>
              <option value="Pompen">Pompen</option>
              <option value="Leidingen & fittingen">Leidingen &amp; fittingen</option>
              <option value="Gereedschap">Gereedschap</option>
              <option value="Kleppen & ventielen">Kleppen &amp; ventielen</option>
              <option value="Installatiemateriaal">Installatiemateriaal</option>
            </select>
            <select
              class="filter-select"
              aria-label="Prijs"
              .value=${this.priceFilter}
              @change=${(event: Event) => {
                this.priceFilter = (event.target as HTMLSelectElement).value
                void this.loadProducts()
              }}>
              <option value="all">Alle prijzen</option>
              <option value="under-25">Tot €25</option>
              <option value="25-100">€25 – €100</option>
              <option value="100-plus">Meer dan €100</option>
            </select>
            <label class="filter-toggle">
              <input
                type="checkbox"
                .checked=${this.favoritesOnly}
                @change=${(event: Event) => {
                  this.favoritesOnly = (event.target as HTMLInputElement).checked
                  void this.loadProducts()
                }} />
              Alleen favorieten
            </label>
            <button
              class="clear-filters"
              ?disabled=${!this.hasActiveFilters()}
              @click=${this.clearFilters}>
              Wis filters
            </button>
            <span class="result-count">${this.totalProducts} producten</span>
          </div>
        </div>

        <div
          class="products-scroll"
          @scroll=${this.handleProductScroll}>
          ${this.loading
            ? html`<div class="loading">Producten laden...</div>`
            : filteredProducts.length === 0
              ? html`<div class="empty">Geen producten gevonden met deze zoekopdracht en filters.</div>`
              : html` <div class="products-grid">${this.renderProducts(filteredProducts)}</div> `}
        </div>
      </div>

      ${this.renderProductDetail(this.selectedProduct)}

      <div class="cart-modal ${this.showCart ? 'open' : ''}">
        <div class="cart-content">
          <div class="cart-header">
            <h2>Shopping Cart</h2>
            <button
              class="close-button"
              @click=${this.toggleCart}>
              ✕
            </button>
          </div>

          ${this.cart.size === 0
            ? html`<div class="empty-cart">Your cart is empty</div>`
            : html`
                ${Array.from(this.cart.entries()).map(
                  ([productId, quantity]) =>
                    this.getCartItem(productId) &&
                    html`
                      <div class="cart-item">
                        <span class="cart-item-name">${this.getCartItem(productId)?.name}</span>
                        <input
                          class="cart-item-qty"
                          type="number"
                          min="1"
                          .value=${String(quantity)}
                          @change=${(event: Event) => {
                            const input = event.target as HTMLInputElement | null
                            this.updateQuantity(productId, Number.parseInt(input?.value || '1', 10))
                          }} />
                        <button
                          class="remove-btn"
                          @click=${() => this.removeFromCart(productId)}>
                          Remove
                        </button>
                      </div>
                    `
                )}
                <div class="cart-total">Totaal: €${this.getCartTotal().toFixed(2)}</div>
                <button
                  class="checkout-button"
                  @click=${this.checkout}>
                  Bestellen
                </button>
              `}
        </div>
      </div>
    `
  }
}

customElements.define('shop-view', ShopView)
