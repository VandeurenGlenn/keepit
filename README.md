# keepit

## Session Tickets

De app tickets voor websocket en handshake worden nu ondertekend met een persistente server secret.
Daardoor blijven bestaande tickets geldig na een korte server restart tot hun normale vervaltijd van 24 uur.

Je kan de secret expliciet zetten in server.config.json:

```json
{
  "session": {
    "secret": "replace-with-a-long-random-session-secret"
  }
}
```

Als er geen session.secret is opgegeven, maakt keepit automatisch een persistente secret aan in `.database/session-secret`.

## Desco Materials Sync

Je kan Desco-producten met prijzen lokaal cachen voor materiaalsuggesties.

Voeg in `server.config.json` een Desco-config toe:

```json
{
  "desco": {
    "getAllProductsUrl": "https://...",
    "authorization": "Bearer ...",
    "cookie": "...",
    "referer": "https://www.desco.be/...",
    "userAgent": "Mozilla/5.0 ..."
  }
}
```

Voor de Excel download endpoint kan een geldige sessie-cookie nodig zijn.

Of via environment variables:

- `KEEPIT_DESCO_GET_ALL_PRODUCTS_URL`
- `KEEPIT_DESCO_AUTHORIZATION`
- `KEEPIT_DESCO_COOKIE`
- `KEEPIT_DESCO_REFERER`
- `KEEPIT_DESCO_USER_AGENT`

Endpoints:

- `POST /api/invoices/materials/desco/sync` synchroniseert de catalogus naar `.database/desco-materials.json`
- `GET /api/invoices/materials/desco` toont cache status + items
- `GET /api/invoices/materials?company=<companyId>&includePrices=true` geeft suggesties met `unitPrice`

Force sync (bypass 7-dagen check):

- `POST /api/invoices/materials/desco/sync?force=true`

Standaardgedrag van `GET /api/invoices/materials` blijft een array van materiaalnamen.

## Alelek Materials Sync

Je kan op exact dezelfde manier ook Groep Alelek/Tecmine materialen synchroniseren via CSV/Excel/XML/JSON bron-URL óf via een webScraper.

### Via URL (CSV/Excel/XML/JSON)

Voeg in `server.config.json` een Alelek-config toe:

```json
{
  "alelek": {
    "getAllProductsUrl": "https://...",
    "authorization": "",
    "cookie": ""
  }
}
```

Of via environment variables:

- `KEEPIT_ALELEK_GET_ALL_PRODUCTS_URL`
- `KEEPIT_ALELEK_AUTHORIZATION`
- `KEEPIT_ALELEK_COOKIE`

Endpoints:

- `POST /api/invoices/materials/alelek/sync` synchroniseert de catalogus naar `.database/alelek-materials.json`
- `GET /api/invoices/materials/alelek` toont cache status + items

Force sync (bypass 7-dagen check):

- `POST /api/invoices/materials/alelek/sync?force=true`

### Via Groep Alelek Webshop Scraper

Alternatief kan je de Groep Alelek webshop (webshop.groepalelek.be) scrapen om materialen op te halen. Dit is handig als er geen CSV/Excel export beschikbaar is.

**Endpoint:**
- `POST /api/invoices/materials/alelek/sync-scraper` — Start de scraper, die de webshop doorzoekt naar producten met prijzen

Force sync (bypass 7-dagen check):
- `POST /api/invoices/materials/alelek/sync-scraper?force=true`

**Request body (optioneel):**
```json
{
  "categoryUrls": [
    "https://webshop.groepalelek.be/nl/producten/installatie-pgn1",
    "https://webshop.groepalelek.be/nl/producten/multimedia-pgn2"
  ]
}
```

Indien je geen URLs aangeeft, worden de standaard categorieën gescraped.

**Opmerking:** De scraper gebruikt Puppeteer om JavaScript-gerenderde inhoud te verwerken en kan enkele minuten duren voor grote catalogi.

Bij bedrijven met naam die `alelek` of `tecmine` bevat, worden die items automatisch meegenomen in `GET /api/invoices/materials`.

## Shop

Een e-commerce shop waar klanten materialen uit de Desco en Alelek catalogi kunnen kopen.

### Endpoints

**Browse producten:**
- `GET /api/shop/products` — Geef alle producten uit beide catalogi
  - Query param: `?search=<term>` voor zoeking op productnaam

**Bestellingen (geautenticeerde gebruikers):**
- `GET /api/shop/orders` — Geef alle bestellingen van de huidige gebruiker
- `GET /api/shop/orders/:orderId` — Geef details van één bestelling
- `POST /api/shop/orders` — Maak een nieuwe bestelling
  - Body: `{ items: [{ productId, quantity }], shippingAddress?, notes? }`
- `PATCH /api/shop/orders/:orderId` — Update bestellingstatus
  - Body: `{ status: 'confirmed' | 'shipped' | 'delivered' | 'cancelled' }`

### Frontend

De `<shop-view>` component biedt:
- Productcatalogus met zoeken
- Winkelwagen
- Checkout naar bestelling

Gebruik in je app:

```html
<shop-view></shop-view>
```

### Bestellingstatus

Bestellingen kunnen de volgende statussen hebben:
- `pending` — Zojuist aangemaakt, wacht op bevestiging
- `confirmed` — Bestelling bevestigd
- `shipped` — Onderweg naar klant
- `delivered` — Ontvangen
- `cancelled` — Geannuleerd

Bestellingen worden opgeslagen in `.database/shopOrders.json`.

## CLI

Je kan catalog sync ook uitvoeren via CLI.

Commands:

- `npm run keepit -- sync`
- `npm run keepit -- sync --force`
- `npm run keepit -- sync desco --force`
- `npm run keepit -- sync alelek --force --no-scraper`
- `npm run sync -- --force`

Globaal command (optioneel):

- `npm link`
- `keepit sync --force`

Opmerking: gebruik geen `npx keepit sync`, want `npx` kan een ander npm package met dezelfde naam ophalen.
