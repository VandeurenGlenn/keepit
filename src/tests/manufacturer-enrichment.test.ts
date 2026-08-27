import test from 'node:test'
import assert from 'node:assert/strict'
import {
  detectManufacturer,
  hasUsableImageValue,
  normalizeSku,
  parseBoschProductPage,
  parseEthermaProductPage,
  parseFischerProductPage,
  parseGeberitProductPage,
  parseGreeProductPage,
  parseIcecatProduct,
  parsePanasonicProductPage,
  parseSolerPalauProductPage,
  parseViegaProductPage
} from '../../scripts/manufacturer-enrichment.mjs'

const PAGE_URL = 'https://www.bosch-homecomfort.com/web-etk/be/bosch/be/nl/sparepart/7735502304'
const HTML = `
  <html>
    <head><title>Temperature Sensor 6x40,6000mm - Onderdelen catalogus</title></head>
    <body>
      <h3 class="Hl Hl-3">Temperature Sensor 6x40,6000mm</h3>
      <button data-item-mfact="7735502304"></button>
      <img src="https://www.bosch-homecomfort.com/web-etk/documents/img?id=472076">
      <table><tr><td>Compatibel toestel</td><td>verkeerde tabel</td></tr></table>
      <div class="ImageTable_table"><table><tbody>
          <tr><td>Bestelnummer</td><td>7 735 502 304</td></tr>
          <tr><td>Barcodenummer</td><td>4062321202910</td></tr>
          <tr><td>Gewicht</td><td>0,135 kg</td></tr>
      </tbody></table></div>
    </body>
  </html>
`

test('Bosch parser vereist exact fabrikantnummer en leest officiële gegevens', () => {
  const result = parseBoschProductPage(HTML, '7735502304', PAGE_URL)
  assert.ok(result)
  assert.equal(result.title, 'Temperature Sensor 6x40,6000mm')
  assert.equal(result.technicalData.Barcodenummer, '4062321202910')
  assert.equal(result.technicalData.Gewicht, '0,135 kg')
  assert.equal(result.technicalData['Compatibel toestel'], undefined)
  assert.equal(result.imageUrl, 'https://www.bosch-homecomfort.com/web-etk/documents/img?id=472076')
})

test('Bosch parser weigert een pagina voor een ander product', () => {
  assert.equal(parseBoschProductPage(HTML, '7719002134', PAGE_URL), null)
  assert.equal(normalizeSku('7 735 502 304'), '7735502304')
})

test('Icecat parser vereist exact merk en MPN', () => {
  const response = JSON.stringify({
    msg: 'OK',
    data: {
      GeneralInfo: {
        IcecatId: 42,
        Title: 'Geberit testproduct',
        Brand: 'Geberit',
        BrandPartCode: '240.468.21.1',
        GTINs: [{ Value: '4025416000000' }],
        Category: { Name: { Value: 'Sanitair' } },
        Description: { LongDesc: 'Officiële productomschrijving' }
      },
      Gallery: [{ IsMain: 'Y', Pic: 'https://images.icecat.biz/test.jpg' }]
    }
  })

  const result = parseIcecatProduct(response, '240468211', 'Geberit')
  assert.ok(result)
  assert.equal(result.imageUrl, 'https://images.icecat.biz/test.jpg')
  assert.equal(result.technicalData.GTIN, '4025416000000')
  assert.equal(result.rightsStatus, 'licensed')
  assert.equal(parseIcecatProduct(response, '240468212', 'Geberit'), null)
  assert.equal(parseIcecatProduct(response, '240468211', 'Viega'), null)
})

test('fabrikant wordt conservatief uit de productnaam bepaald', () => {
  assert.equal(detectManufacturer({ name: 'ROZET CHROOM GEBERIT', description: '' }), 'Geberit')
  assert.equal(detectManufacturer({ name: 'EC-9N', technicalData: { Merk: 'SOLER&PALAU' } }), 'SOLER&PALAU')
  assert.equal(detectManufacturer({ name: 'Merkloze koppeling', description: '' }), undefined)
})

test('beeldreparatie behoudt ondersteunde lokale beeldbronnen', () => {
  assert.equal(hasUsableImageValue({ image: '/cache/desco/product.jpg' }), true)
  assert.equal(hasUsableImageValue({ image: '/catalog-assets/sieportal/product.png' }), true)
  assert.equal(hasUsableImageValue({ image: 'https://manufacturer.example/product.jpg' }), true)
  assert.equal(hasUsableImageValue({ image: '0' }), false)
  assert.equal(hasUsableImageValue({ image: 'los-bestand.jpg' }), false)
})

test('Soler & Palau adapter koppelt alleen gekende fabrikantcodes aan officiële beelden', () => {
  const result = parseSolerPalauProductPage('<h1>TLS-501 / TLS-503 T</h1>', '5226832600')
  assert.ok(result)
  assert.equal(result.title, 'TLS-501')
  assert.match(result.imageUrl, /^https:\/\/www\.solerpalau\.com\//)
  assert.equal(result.rightsStatus, 'permission-required')
  assert.equal(parseSolerPalauProductPage('<h1>Ander product</h1>', '5226832600'), null)
  assert.equal(parseSolerPalauProductPage('<h1>TLS-501 / TLS-503 T</h1>', 'onbekend'), null)
})

test('Fischer adapter verwijdert leveranciersprefix en vereist exact fabrikantnummer', () => {
  const pageUrl = 'https://www.fischer.be/nl-be/products/plug/50354-n-6-x-40'
  const html = `
    <meta property="og:image" content="https://media.fischer.group/product-50354.jpg">
    <meta property="og:title" content="Nagelplug N 6 x 40">
    <h1>Nagelplug</h1><p>Artikelnr. 50354</p>
  `
  const result = parseFischerProductPage(html, 'FIS50354', pageUrl)
  assert.ok(result)
  assert.equal(result.technicalData.MPN, '50354')
  assert.equal(result.imageUrl, 'https://media.fischer.group/product-50354.jpg')
  assert.equal(parseFischerProductPage(html, 'FIS50491', pageUrl), null)
})

test('Gree, Panasonic en Etherma adapters publiceren alleen pagina’s met exacte MPN', () => {
  const gree = parseGreeProductPage(`
    <meta property="og:image" content="https://greeproducts.com/clivia-9.webp">
    <h1>Clivia</h1><p>GWH09AUCXB-K6DNA1A/I</p>
  `, 'GREGWH09AUCXBK6DNA1AI', 'https://greeproducts.com/pt-pt/produtos/fm-clivia-9/')
  assert.ok(gree)

  const panasonic = parsePanasonicProductPage(`
    <h1>PAW-BTANK50L-2</h1>
    <img src="https://cdn.aircon.panasonic.eu/products/paw-btank50l-2.jpg">
  `, 'PANPAWBTANK50L2', 'https://www.aircon.panasonic.eu/BE_fr/model/paw-btank50l-2/')
  assert.ok(panasonic)
  assert.match(panasonic.imageUrl, /paw-btank50l-2\.jpg$/)

  const etherma = parseEthermaProductPage(`
    <meta property="og:image" content="https://www.etherma.com/media/et-14a.jpg">
    <h1>ET-14A</h1>
  `, 'ETHET14A', 'https://www.etherma.com/nl/product/et-14a')
  assert.ok(etherma)
  assert.equal(parseEthermaProductPage('<h1>ET-111A</h1>', 'ETHET14A', 'https://www.etherma.com/nl/product/et-14a'), null)
})

test('Geberit parser vereist het exacte artikelnummer en gebruikt het officiële familiebeeld', () => {
  const html = `
    <link rel="preload" as="image" href="https://images.data.geberit.com/image/upload/f_auto,t_ProductMedium/test.jpg">
    <h1>Geberit Pluvia beugel instelbaar</h1>
    <tr><td>Art. nr.</td><td><div>361.861.00.1</div></td></tr>
    <h2>Technische gegevens</h2>
    <table><tr><td>Materiaal</td><td>Staal</td></tr></table><h2>Documenten</h2>
  `
  const result = parseGeberitProductPage(html, '361861001', 'https://catalog.geberit.be/nl-BE/product/PRO_101949')
  assert.ok(result)
  assert.equal(result.title, 'Geberit Pluvia beugel instelbaar')
  assert.equal(result.technicalData.Materiaal, 'Staal')
  assert.equal(result.publishableImage, true)
  assert.equal(parseGeberitProductPage(html, '361861002', 'https://catalog.geberit.be/nl-BE/product/PRO_101949'), null)
})

test('Geberit reserveonderdelenbeeld wordt niet als exact productbeeld gepubliceerd', () => {
  const html = `
    <h1>Reserveonderdelen voor: Badafvoeren</h1>
    <script>self.__next_f.push([1,"{\\"positions\\":[{\\"id\\":\\"240.468.21.1\\",\\"productId\\":\\"PRO_105423\\",\\"name\\":\\"Geberit afwerkset\\"}],\\"images\\":[{\\"type\\":\\"Primary Image\\",\\"variants\\":[{\\"size\\":\\"M\\",\\"url\\":\\"https://images.data.geberit.com/image/upload/test.jpg\\"}]}]}"])</script>
  `
  const result = parseGeberitProductPage(html, '240468211', 'https://catalog.geberit.be/nl-BE/spare-part/SPT_461543')
  assert.ok(result)
  assert.equal(result.title, 'Geberit afwerkset')
  assert.equal(result.publishableImage, false)
  assert.match(result.technicalData.Beeldtype, /Overzichtstekening/)
})

test('Viega parser matcht exact artikelnummer op een officiële modelpagina', () => {
  const html = `
    <meta property="og:title" content="Profipress XL-Bocht 90° - model 2416XL">
    <meta name="description" content="Profipress XL-Bocht 90° - met SC-Contur, V/V; koper - 2416XL">
    <img src="https://web-catalog.viega.com/Images/PPm2416XLi577681v01.jpg">
    <td>76,1</td><td>1</td><td>476 847</td>
    <td>88,9</td><td>1</td><td>476 854</td>
  `
  const result = parseViegaProductPage(html, '476847')
  assert.ok(result)
  assert.equal(result.title, 'Profipress XL-Bocht 90°')
  assert.equal(result.technicalData.Model, '2416XL')
  assert.equal(result.imageUrl, 'https://web-catalog.viega.com/Images/PPm2416XLi577681v01.jpg')
  assert.equal(parseViegaProductPage(html, '476878'), null)
})
