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
- Alelek-beelden via exacte merk + fabrikantcode uit Open Icecat herstellen:
  `npm run enrich:manufacturers -- --catalog=alelek --brands=icecat --max=25 --apply --publish-images --repair-images`

Voeg `--missing-images` toe om uitsluitend producten zonder volledige lokale card- en detail-WebP te controleren; dit voorkomt onnodige fabrikant- of Icecat-requests. Met `--cached-only` kunnen eerder opgehaalde resultaten zonder nieuwe netwerkrequests opnieuw worden toegepast. Eaton/Moeller gebruikt directe officiële SKU-pagina's; Rittal bouwt zijn exacte MPN-index uit de officiële Nederlandse sitemap. Ledlines koppelt productfamiliepagina's uit de officiële sitemap en accepteert een beeld alleen wanneer het exacte MPN bij de datasheets staat.

Een openbare Lithoss BMEcat-export kan rechtstreeks worden ingelezen met `npm run images:import -- lithoss /pad/naar/lithoss-bmecat.zip --apply`. Alleen exacte EAN/GTIN- of merk+MPN-matches worden toegepast.
- Alelek-beelden rechtstreeks bij ondersteunde fabrikanten herstellen:
  `npm run enrich:manufacturers -- --catalog=alelek --brands=fischer,gree,panasonic,etherma --max=50 --apply --publish-images --repair-images`
- Gekende Soler & Palau-beelden rechtstreeks uit de officiële productcatalogus herstellen:
  `npm run enrich:manufacturers -- --catalog=alelek --brands=solerpalau --max=25 --apply --publish-images --repair-images`

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

Standaard worden fabrikantafbeeldingen alleen als kandidaat met rechtenstatus opgeslagen. Met `--publish-images` worden ze uitsluitend voor exact geverifieerde SKU's als source-linked shopbeeld gebruikt en blijft de officiële bron zichtbaar. Rechtstreekse fabrikantpagina's kunnen nog toestemming vereisen; Open Icecat-beelden worden alleen overgenomen wanneer de API het exacte merk en MPN bevestigt. Bosch, Open Icecat, Geberit, Viega, Soler & Palau, Fischer, Gree, Panasonic en Etherma hebben conservatieve adapters. Elke adapter controleert het volledige fabrikantnummer; een 404, generiek beeld of afwijkende code wordt niet gepubliceerd. Een Geberit-reserveonderdelen-overzichtstekening wordt als kandidaat en bron opgeslagen, maar niet als exact shopbeeld gepubliceerd. Verdere productfamilies en adapters voor Vaillant en Grundfos worden pas geactiveerd nadat hun officiële, robots-conforme productindex betrouwbaar is geïmplementeerd.

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

**Opmerking:** De scraper gebruikt de gepagineerde Alelek artikel-API en doorloopt alle zestien hoofdcategorieën sequentieel. Elke API-pagina bevat maximaal 250 producten. De volgende pagina, het verwachte producttotaal en de reeds gevonden producten worden atomisch bewaard in `.database/alelek-scraper-state.json`. Een volgende run hervat daardoor exact bij de volgende pagina. Na elke batch van standaard 25.000 producten pauzeert de runner willekeurig 20 seconden tot 3 minuten en gaat daarna automatisch verder; `KEEPIT_ALELEK_SCRAPER_MAX_PRODUCTS` past de batchgrootte aan. Een gedeeltelijke run wordt niet als voltooide sync geregistreerd en wordt bij de volgende `npm run sync` automatisch hervat. Start na de upgrade één keer met `npm run keepit -- sync alelek --force` om een oude sync-timestamp te negeren. `KEEPIT_ALELEK_SCRAPER_DAILY_LIMIT` kan optioneel het aantal API-requests per dag begrenzen. Bij HTTP 403, 429 of 503 stopt de crawler onmiddellijk en bewaart hij het checkpoint.

Voor een kleine proefrun of een lagere daglimiet:

```bash
KEEPIT_ALELEK_SCRAPER_MAX_PRODUCTS=500 \
KEEPIT_ALELEK_SCRAPER_DAILY_LIMIT=20 \
npm run keepit -- sync alelek --force
```

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

## Operationele back-ups

Keepit maakt automatisch een consistente JSON-back-up van de unieke bedrijfsgegevens: uren, jobs, planning, klanten en leveranciers, offertes, factuurgegevens, gebruikers, bestellingen, meldingen en tijdlijngegevens. Na wijzigingen wordt een snapshot met korte vertraging gemaakt en bij het opstarten minstens eenmaal per 24 uur. Standaard blijven de laatste 30 automatische en 10 handmatige back-ups bewaard.

Admins kunnen via **Organisatie → Back-ups** een snapshot maken, downloaden of een eerder gedownload bestand herstellen. Vóór ieder herstel maakt Keepit eerst een extra veiligheidskopie.

Standaard staan snapshots in `.database/backups`. Gebruik in productie bij voorkeur een gemount extern volume of NAS:

```sh
KEEPIT_BACKUP_DIR=/mnt/keepit-backups KEEPIT_BACKUP_RETENTION=60 npm start
```

De grote, opnieuw opbouwbare shopcatalogus en binaire productafbeeldingen zijn niet inbegrepen in deze operationele snapshots. Daarvoor blijft `npm run catalog:zip` beschikbaar.

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
- `npm run images:siemens-audit -- --apply` controleert onvolledige Siemens-producten via hun exacte openbare Industry Mall-pagina, bewaart lifecycle-data en vult officiële beelden aan. De controle gebruikt twee gelijktijdige requests met vertraging en schrijft `.database/exports/siemens-mall-audit.json`.
- `npm run images:siemens-cleanup` toont welke geïmporteerde Siemens-ZIP's en originele beelden kunnen worden opgeruimd. Met `-- --apply` worden de ZIP's verwijderd en alleen originelen waarvoor geldige card- én detail-WebP's bestaan.
- `npm run catalog:cleanup` toont veilig verwijderbare catalogusdata voor Alelek en Desco: verweesde WebP's, gedekte Desco-originelen, verouderde beeldfouten, back-ups ouder dan de nieuwste snapshot en oudere snapshots. Pas toe met `npm run catalog:cleanup -- --apply`.
- `npm run sync:finish` — genereert ontbrekende WebP-varianten voor Techlink-bronnen; onbereikbare fabrikant-URL's worden geregistreerd en bij een volgende run overgeslagen
- `npm run images:repair` — herprobeert uitsluitend automatisch herstelbare URL-, 403-, certificaat- en pixellimietfouten
- `npm run images:import -- installdata /pad/naar/export.zip` — controleert een InstallData BMEcat/INSBOU-export zonder wijzigingen
- `npm run images:import -- techlink /pad/naar/export.zip` — controleert een Techlink Data Portal XML/CSV/Excel-export zonder wijzigingen
- `npm run images:import -- sieportal /pad/naar/export.zip` — controleert een Siemens SiePortal productmaster/beeldexport zonder wijzigingen
- `npm run images:siemens-list` — maakt invoerbatches voor Siemens CAx van artikelen zonder volledige lokale beeldcache
- `npm run keepit -- enrich desco`
- `npm run sync -- --force`

Globaal command (optioneel):

- `npm link`
- `keepit sync --force`
- `keepit images all`
- `keepit enrich desco`

Opmerking: gebruik geen `npx keepit sync`, want `npx` kan een ander npm package met dezelfde naam ophalen.

De beeldcache houdt mislukkingen bij in `.database/product-image-cache-state.json`. HTTP 404/410, corrupte HTML-responses en onondersteunde bestanden worden als permanent uitgesteld; tijdelijke netwerkfouten krijgen oplopende back-off. `images:repair` herstelt onder meer komma's in CDN-hosts/extensies, samengestelde URL-velden en Google Drive-deellinks en gebruikt browserheaders plus de systeemcertificaten. Gebruik alleen bij een bewuste volledige hercontrole `npm run images:cache -- alelek --retry-failures`. Met `--limit=1000` kan een gecontroleerde batch worden uitgevoerd.

### Officiële beeldexports importeren

Gebruik voor 403-bronnen bij voorkeur een officiële export met de bijbehorende beeldbestanden. De importer accepteert een map of ZIP:

- InstallData: INSBOU/BMEcat XML en de bestanden waarnaar `MIME_SOURCE` verwijst.
- Techlink Data Portal: BMEcat XML of CSV/XLS/XLSX met EAN/GTIN, merk, fabrikantnummer en een beeldverwijzing, plus de bijbehorende beeldbestanden.
- Siemens SiePortal: CSV/XLS/XLSX productmaster met kolommen zoals `Order Number`, `GTIN` en `Product Image`, plus de gedownloade beeldmap.

Elke import is standaard een dry-run en koppelt alleen op exact EAN/GTIN, exact merk + MPN, of een catalogusbreed unieke exacte MPN. Controleer eerst het aantal matches en pas daarna toe:

```sh
npm run images:import -- installdata /pad/naar/installdata-export.zip
npm run images:import -- installdata /pad/naar/installdata-export.zip --apply

npm run images:import -- techlink /pad/naar/techlink-export.zip
npm run images:import -- techlink /pad/naar/techlink-export.zip --apply

npm run images:import -- sieportal /pad/naar/sieportal-export.zip
npm run images:import -- sieportal /pad/naar/sieportal-export.zip --apply

npm run sync:finish
```

De originele aangeleverde beelden worden inhoudsgebaseerd opgeslagen in `.database/catalog-assets/`; de shop gebruikt daarna de gegenereerde WebP-varianten uit `.database/product-images/`. Vóór `--apply` wordt een catalogusback-up gemaakt en de koppelingen worden ook in `alelek-manufacturer-overrides.json` bewaard, zodat een latere leverancierssync ze niet wist.

## Catalog Snapshot

Om catalog + cache te verplaatsen naar een andere server zonder volledige resync:

- `npm run catalog:zip`

Herstel de nieuwste catalog snapshot naar de projectmap:

- `npm run catalog:unzip`

Of herstel een specifieke snapshot:

- `npm run catalog:unzip -- catalog-snapshots/catalog-snapshot-2026-05-15_19-22-10-175.zip`

Dit maakt een zip in `catalog-snapshots/` met:

- `.database/desco-materials.json`
- `.database/desco-materials.metadata.json`
- `.database/alelek-materials.json`
- `.database/alelek-materials.metadata.json` (indien aanwezig)
- `.database/alelek-manufacturer-overrides.json` (geverifieerde fabrikantverrijking)
- `.database/product-image-cache-state.json` (indien aanwezig; hervatbare fout/back-offstatus)
- `.database/manufacturer-enrichment-state-*.json` (reeds gecontroleerde MPN's en daglimieten)
- `.database/manufacturer-cache` (gecachete officiële fabrikantpagina's en indexen)
- `.database/product-images` (lokale kaart- en detail-WebP's)
- `.database/catalog-assets` (originele officiële InstallData/SiePortal-beelden)
- `www/cache/desco` (indien aanwezig)
- `www/cache/alelek` (indien aanwezig)

Voor een aparte snapshot van uitsluitend de herbruikbare caches:

- `npm run cache:zip`
- `npm run cache:unzip` herstelt de nieuwste `cache-snapshot-*.zip`
- `npm run cache:unzip -- catalog-snapshots/cache-snapshot-2026-08-29_12-00-00-000.zip` herstelt een specifiek bestand

De cache-snapshot bevat de WebP's, originele catalog assets, beeldfoutstatus en de Alelek/Desco webcaches. De productcatalogus-JSON zelf blijft uitsluitend onderdeel van `catalog:zip`.

De veel kleinere adapter-snapshot bewaart uitsluitend de officiële fabrikantpagina's/indexen, reeds gecontroleerde MPN's, daglimietstatus en fabrikant-overrides:

- `npm run adapters:zip`
- `npm run adapters:unzip` herstelt de nieuwste `adapter-snapshot-*.zip`
- `npm run adapters:unzip -- catalog-snapshots/adapter-snapshot-2026-08-29_12-00-00-000.zip` herstelt een specifiek bestand
