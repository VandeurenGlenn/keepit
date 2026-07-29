# keepit

## Nginx reverse proxy

Een productieconfig voor `https://keepit.dimac.be` staat in
[`deploy/nginx/keepit.conf`](deploy/nginx/keepit.conf). Ze stuurt de website en API door naar Keepit op
`127.0.0.1:5678` en behandelt `/ws` afzonderlijk met de vereiste websocket-upgrade en het
`Sec-WebSocket-Protocol` ticket.

Pas indien nodig het domein, de interne poort en de Let's Encrypt-certificaatpaden aan. Installeer en controleer de
config daarna op de server:

```bash
sudo cp deploy/nginx/keepit.conf /etc/nginx/conf.d/keepit.conf
sudo nginx -t
sudo systemctl reload nginx
```

De browser gebruikt automatisch `wss://<huidig-domein>/ws` op HTTPS en heeft daardoor geen interne hostnaam of poort
nodig.

## Significante locatietijdlijn

Medewerkers kunnen vrijwillig de doorlopende tijdlijn inschakelen. Keepit bewaart geen volledig GPS-spoor:

- posities met slechte nauwkeurigheid worden genegeerd;
- vertrek wordt na twee bevestigde metingen buiten de huidige plaats geregistreerd;
- een nieuwe stop wordt pas na vijf minuten binnen dezelfde zone geregistreerd;
- Google Places wordt alleen server-side bij zo'n bevestigde stop opgevraagd;
- bij vertrek van een actieve werf zonder checkout toont Keepit één checkout-notificatie.

De server gebruikt eerst `google.placesApiKey` uit `server.config.json` of `KEEPIT_GOOGLE_PLACES_API_KEY`. Als die niet
zijn ingesteld, hergebruikt hij automatisch dezelfde Maps-key uit de gebouwde frontendconfig. Als Places geen resultaat
teruggeeft, blijft de stop als `Onbekende stop` bewaard.

De webtracker werkt zolang Keepit actief is. Echte tracking wanneer de browser volledig afgesloten is vereist een
native mobiele background-location component; de API `POST /api/timeline/position` is hiervoor al bruikbaar.

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

Je kan Desco-producten met prijzen lokaal cachen voor materiaalsuggesties. Plaats de officiële export als
`.database/desco/articles.xlsx`. De sync leest uitsluitend dit lokale bestand en doet geen HTTP-requests naar Desco.
Een sync behoudt bestaande beschrijvingen, technische data en lokale image-cachekoppelingen.

Endpoints:

- `POST /api/invoices/materials/desco/sync` synchroniseert de catalogus naar `.database/desco-materials.json`
- `GET /api/invoices/materials/desco` toont cache status + items
- `GET /api/invoices/materials?company=<companyId>&includePrices=true` geeft suggesties met `unitPrice`

Force sync (bypass 7-dagen check):

- `POST /api/invoices/materials/desco/sync?force=true`

Ontbrekende cachekoppelingen uit een bestaande snapshot kan je zonder netwerkverkeer herstellen:

- controle: `npm run catalog:recover-desco-cache -- --dry-run`
- herstel: `npm run catalog:recover-desco-cache`

### Veilige fabrikantverrijking

Officiële fabrikantpagina's kunnen productgegevens aanvullen. De verrijker werkt sequentieel, bewaart een lokale cache en checkpoint, wacht standaard vijf seconden tussen requests, gebruikt een harde daglimiet per domein en stopt onmiddellijk bij HTTP 403 of 429.

- controle zonder wijzigingen: `npm run enrich:manufacturers -- --brands=bosch --max=10`
- één artikel controleren: `npm run enrich:manufacturers -- --brands=bosch --sku=7735502304 --max=1`
- exacte matches toepassen: `npm run enrich:manufacturers -- --brands=bosch --max=10 --apply`
- ontbrekende beelden source-linked publiceren: `npm run enrich:manufacturers -- --brands=bosch --max=10 --apply --publish-images`

Open Icecat gebruikt een gratis account en zoekt exact op merk + MPN. Vul dit bij voorkeur in `server.config.json` in:

```json
{
  "icecat": {
    "username": "jouw_gebruikersnaam",
    "appKey": "jouw_appkey"
  }
}
```

Omgevingsvariabelen kunnen de serverconfig overrulen:

```bash
ICECAT_USERNAME=jouw_gebruikersnaam \
ICECAT_APP_KEY=jouw_appkey \
npm run enrich:manufacturers -- --brands=icecat --max=25 --apply --publish-images
```

`ICECAT_APP_KEY` mag worden weggelaten wanneer het accounttype geen appkey vereist. Credentials worden nooit in catalogusdata, logs of checkpoints bewaard.

Icecat kan HTTP 403 teruggeven voor een product van een merk dat niet in het accountabonnement zit. Zo'n product wordt als `restricted` overgeslagen. Drie opeenvolgende 403-antwoorden openen alsnog de circuit breaker; HTTP 429 stopt altijd onmiddellijk.

Standaard worden fabrikantafbeeldingen alleen als kandidaat met rechtenstatus opgeslagen. Met `--publish-images` worden ze uitsluitend voor exact geverifieerde SKU's als source-linked shopbeeld gebruikt en blijft de officiële bron zichtbaar. Rechtstreekse fabrikantpagina's kunnen nog toestemming vereisen; Open Icecat-beelden worden alleen overgenomen wanneer de API het exacte merk en MPN bevestigt. Bosch, Open Icecat en de eerste exact gemapte Geberit- en Viega-productpagina's zijn operationeel. Beide adapters controleren het volledige artikelnummer. Een Geberit-reserveonderdelen-overzichtstekening wordt als kandidaat en bron opgeslagen, maar niet als exact shopbeeld gepubliceerd. Verdere productfamilies en adapters voor Vaillant en Grundfos worden pas geactiveerd nadat hun officiële, robots-conforme productindex betrouwbaar is geïmplementeerd.

Het herstel maakt eerst een backup onder `.database/backups/`.

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

**Opmerking:** De scraper gebruikt één Puppeteer-tab en doorloopt standaard alle zestien webshopcategorieën via `/nl/zoekresultaten?category=...`. Per categorie scrollt hij in hervatbare batches richting footer, opent hij elk gevonden product afzonderlijk en keert hij terug naar de resultatenlijst. De voortgang en bereikte scrolldiepte staan in `.database/alelek-scraper-state.json`, zodat een volgende run dieper gaat zonder dezelfde producten opnieuw te bezoeken. Er is standaard geen daglimiet; `KEEPIT_ALELEK_SCRAPER_DAILY_LIMIT` kan optioneel een grens instellen. Per run worden maximaal 75 nieuwe producten verwerkt, standaard met 5,5–10 seconden tussen producten en langere rustpauzes. `KEEPIT_ALELEK_SCRAPER_MIN_PRODUCT_DELAY_MS` en `KEEPIT_ALELEK_SCRAPER_MAX_PRODUCT_DELAY_MS` kunnen dit bijstellen, met een harde veilige ondergrens. Bij HTTP 403, 429, 503, captcha of een access-denied-pagina stopt hij onmiddellijk.

Voor een kleine proefrun of een lagere daglimiet:

```bash
KEEPIT_ALELEK_SCRAPER_MAX_PRODUCTS=5 \
KEEPIT_ALELEK_SCRAPER_DAILY_LIMIT=20 \
npm run keepit -- sync alelek --force
```

Wanneer Alelek een losse headless browsersessie niet aanvaardt, kan dezelfde crawler zichtbaar worden uitgevoerd met `KEEPIT_ALELEK_SCRAPER_HEADLESS=false`. De rate limits en checkpoints blijven daarbij identiek.

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
- `npm run keepit -- images all`
- `npm run keepit -- images alelek --concurrency=2`
- `npm run images:cache -- all`
- `npm run keepit -- enrich desco`
- `npm run sync -- --force`

Globaal command (optioneel):

- `npm link`
- `keepit sync --force`
- `keepit images all`
- `keepit enrich desco`

Opmerking: gebruik geen `npx keepit sync`, want `npx` kan een ander npm package met dezelfde naam ophalen.

## Catalog Snapshot

Om catalog + cache te verplaatsen naar een andere server zonder volledige resync:

- `npm run catalog:zip`

Dit maakt een zip in `catalog-snapshots/` met:

- `.database/desco-materials.json`
- `.database/desco-materials.metadata.json`
- `.database/alelek-materials.json`
- `.database/alelek-materials.metadata.json` (indien aanwezig)
- `www/cache/desco` (indien aanwezig)
- `www/cache/alelek` (indien aanwezig)
