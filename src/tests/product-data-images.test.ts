import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseInstallDataXml,
  parseProductMasterRows,
  siemensAssetKey
} from '../../scripts/product-data-images.mjs'

test('parses InstallData BMEcat product identifiers and MIME image', () => {
  const records = parseInstallDataXml(`
    <BMECAT><T_NEW_CATALOG><PRODUCT>
      <SUPPLIER_PID>SUP-42</SUPPLIER_PID>
      <PRODUCT_DETAILS>
        <MANUFACTURER_NAME>Siemens</MANUFACTURER_NAME>
        <MANUFACTURER_PID>6ES7 123-4AB00-0AA0</MANUFACTURER_PID>
        <UDX.EDXF.GTIN><![CDATA[4019169856187]]></UDX.EDXF.GTIN>
      </PRODUCT_DETAILS>
      <UDX.EDXF.MIME_INFO><UDX.EDXF.MIME>
        <UDX.EDXF.MIME_TYPE>image/jpeg</UDX.EDXF.MIME_TYPE>
        <UDX.EDXF.MIME_SOURCE>images/6ES7123.jpg</UDX.EDXF.MIME_SOURCE>
      </UDX.EDXF.MIME></UDX.EDXF.MIME_INFO>
    </PRODUCT></T_NEW_CATALOG></BMECAT>
  `)

  assert.deepEqual(records, [{
    brand: 'Siemens',
    mpn: '6ES7 123-4AB00-0AA0',
    ean: '4019169856187',
    imageSource: 'images/6ES7123.jpg'
  }])
})

test('parses SiePortal product-master column aliases', () => {
  const records = parseProductMasterRows([{
    'Order Number': '3VA1110-4ED32-0AA0',
    'Product Image': 'images/3VA1110-4ED32-0AA0.png',
    GTIN: '4011209999999'
  }], 'Siemens')

  assert.deepEqual(records, [{
    brand: 'Siemens',
    mpn: '3VA1110-4ED32-0AA0',
    ean: '4011209999999',
    imageSource: 'images/3VA1110-4ED32-0AA0.png'
  }])
})

test('matches Siemens graphic, product and symbol asset variants', () => {
  assert.equal(siemensAssetKey('G_I202_XX_44865P.png'), 'g_i202_xx_44865')
  assert.equal(siemensAssetKey('https://mall.industry.siemens.com/P_ST70_XX_08371i.jpg'), 'p_st70_xx_08371')
  assert.equal(siemensAssetKey('S_PCS7_XX_00001J.jpg'), 's_pcs7_xx_00001')
})
