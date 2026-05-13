import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import { api } from '../api/client.js'
import { ShopProduct } from '../../types/index.js'

export class ShopView extends LiteElement {
  @property({ type: String }) accessor searchQuery = ''
  @property({ type: Array }) accessor products: ShopProduct[] = []
  @property({ type: Boolean }) accessor loading = false
  @property({ type: Object }) accessor cart: Map<string, number> = new Map()
  @property({ type: Object }) accessor draftQuantities: Map<string, number> = new Map()
  @property({ type: Boolean }) accessor showCart = false

  favoriteNames: Set<string> = new Set()

  static styles = [
    css`
      :host {
        display: block;
        width: 100%;
        height: 100%;
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
        max-width: 1280px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
      }

      .search-bar {
        flex: 1;
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
      }

      .product-card:hover {
        transform: translateY(-2px);
        border-color: color-mix(in srgb, var(--app-accent) 34%, var(--app-border) 66%);
        box-shadow:
          0 10px 24px color-mix(in srgb, black 30%, transparent 70%),
          0 0 0 1px color-mix(in srgb, var(--app-accent) 10%, transparent 90%) inset;
      }

      .product-name {
        font-size: 0.98rem;
        font-weight: 700;
        line-height: 1.3;
        letter-spacing: 0.004em;
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

      @media (max-width: 720px) {
        :host {
          padding: 12px;
        }

        .container {
          gap: 14px;
        }

        .header {
          flex-direction: column;
          align-items: stretch;
        }

        .cart-button {
          width: 100%;
        }

        .products-grid {
          grid-template-columns: 1fr;
          gap: 14px;
        }

        .product-card {
          min-height: 0;
        }

        .cart-item {
          grid-template-columns: 1fr;
        }

        .remove-btn,
        .checkout-button {
          width: 100%;
        }
      }
    `
  ]

  async connectedCallback() {
    super.connectedCallback()
    await this.loadProducts()
  }

  async loadProducts() {
    this.loading = true
    try {
      const data = await api.getShopProducts(this.searchQuery || undefined)
      this.products = data.products || []

      // Load favorites
      const favorites = await api.getFavorites()
      this.favoriteNames = new Set(favorites.map((m) => m.name))
    } catch (error) {
      console.error('Failed to load products:', error)
      this.products = []
    } finally {
      this.loading = false
    }
  }

  private async refreshFavorites(): Promise<void> {
    try {
      const favorites = await api.getFavorites()
      this.favoriteNames = new Set(favorites.map((m) => m.name))
      this.requestUpdate()
    } catch (error) {
      console.error('Failed to refresh favorites:', error)
    }
  }

  handleSearch = (event: Event) => {
    const input = event.target as HTMLInputElement | null
    this.searchQuery = input?.value || ''
    void this.loadProducts()
  }

  getProductMeta(product: ShopProduct): string[] {
    const meta: string[] = []
    if (product.articleNumber) meta.push(`ART: ${product.articleNumber}`)
    if (product.productNumber) meta.push(`PROD: ${product.productNumber}`)
    if (typeof product.packagingQuantity === 'number') meta.push(`VPH: ${product.packagingQuantity}`)
    return meta
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
    void api.addToHistory(product)
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
        alert(`Order #${result.orderId} created successfully!`)
        this.cart = new Map()
        this.showCart = false
      } else {
        alert('Failed to create order')
      }
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Error during checkout')
    }
  }

  render() {
    return html`
      <div class="container">
        <div class="header">
          <div class="search-bar">
            <input
              class="search-input"
              type="text"
              placeholder="Search products..."
              .value=${this.searchQuery}
              @input=${this.handleSearch} />
          </div>

          <button
            class="cart-button"
            @click=${this.toggleCart}>
            Cart ${this.getCartItemCount() > 0 ? html`<span class="cart-count">${this.getCartItemCount()}</span>` : ''}
          </button>
        </div>

        ${this.loading
          ? html`<div class="loading">Loading products...</div>`
          : this.products.length === 0
            ? html`<div class="empty">No products found</div>`
            : html`
                <div class="products-grid">
                  ${this.products.map((product) => {
                    const meta = this.getProductMeta(product)
                    const draftQuantity = this.getDraftQuantity(product.id)
                    return html`
                      <div class="product-card">
                        <div class="product-name">${product.name}</div>
                        <div class="product-price">€${product.price.toFixed(2)}</div>
                        ${product.unit ? html`<div class="product-unit">per ${product.unit}</div>` : ''}
                        ${meta.length
                          ? html`<div class="product-meta">
                              ${meta.slice(0, 2).map((label) => html`<span class="meta-badge">${label}</span>`)}
                              ${meta.length > 2 ? html`<span class="meta-badge">+${meta.length - 2}</span>` : ''}
                            </div>`
                          : ''}
                        <div class="product-source">${product.source}</div>
                        <div class="product-actions">
                          <button
                            class="favorite-button"
                            title=${this.favoriteNames.has(product.name) ? 'Remove from favorites' : 'Add to favorites'}
                            @click=${() => {
                              if (this.favoriteNames.has(product.name)) {
                                void api.removeFromFavorites(product.name).then(() => this.refreshFavorites())
                              } else {
                                void api.addToFavorites(product).then(() => this.refreshFavorites())
                              }
                            }}>
                            ${this.favoriteNames.has(product.name) ? '★' : '☆'}
                          </button>
                          <div class="quantity-control">
                            <button
                              class="qty-button"
                              ?disabled=${draftQuantity <= 1}
                              title="Decrease quantity"
                              @click=${() => this.adjustDraftQuantity(product.id, -1)}>
                              -
                            </button>
                            <input
                              class="qty-input"
                              type="number"
                              min="1"
                              .value=${String(draftQuantity)}
                              @input=${(event: Event) => {
                                const input = event.target as HTMLInputElement | null
                                this.setDraftQuantity(product.id, Number.parseInt(input?.value || '1', 10))
                              }} />
                            <button
                              class="qty-button"
                              title="Increase quantity"
                              @click=${() => this.adjustDraftQuantity(product.id, 1)}>
                              +
                            </button>
                          </div>
                          <button
                            class="cart-icon-button"
                            title="Add to cart"
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
                  })}
                </div>
              `}
      </div>

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
                <div class="cart-total">Total: €${this.getCartTotal().toFixed(2)}</div>
                <button
                  class="checkout-button"
                  @click=${this.checkout}>
                  Checkout
                </button>
              `}
        </div>
      </div>
    `
  }
}

customElements.define('shop-view', ShopView)
