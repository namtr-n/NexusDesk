import JSZip from 'jszip'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

/** Styles mẫu giống Word thật: mặc định theo theme (Calibri 11), Heading, và một style "chuẩn báo cáo". */
export const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Heading1"/>
    <w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/><w:basedOn w:val="Heading2"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="BaoCao">
    <w:name w:val="Bao cao"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="0" w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:firstLine="567"/><w:jc w:val="both"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="BaoCao"/>
    <w:pPr><w:jc w:val="center"/><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="character" w:styleId="NhanManh"><w:name w:val="Nhan manh"/>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:style>
</w:styles>`

export const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">
  <a:themeElements><a:fontScheme name="Office">
    <a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont>
    <a:minorFont><a:latin typeface="Calibri"/></a:minorFont>
  </a:fontScheme></a:themeElements>
</a:theme>`

/** Lề chuẩn: trên 2, dưới 2, trái 3, phải 2 cm (đơn vị twips: 1 cm = 567) */
export const SECT_OK =
  '<w:sectPr><w:pgMar w:top="1134" w:bottom="1134" w:left="1701" w:right="1134"/></w:sectPr>'

export const LONG =
  'Sinh viên thường phải xử lý nhiều báo cáo, tiểu luận với các yêu cầu trình bày khác nhau giữa các trường.'

export function p(text: string, opts: { style?: string; pPr?: string; rPr?: string } = {}): string {
  const pStyle = opts.style ? `<w:pStyle w:val="${opts.style}"/>` : ''
  const pPr = pStyle || opts.pPr ? `<w:pPr>${pStyle}${opts.pPr ?? ''}</w:pPr>` : ''
  const run = text
    ? `<w:r>${opts.rPr ? `<w:rPr>${opts.rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`
    : ''
  return `<w:p>${pPr}${run}</w:p>`
}

export async function buildDocx(
  bodyXml: string,
  opts: { styles?: string | null; theme?: string | null } = {}
): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${bodyXml}</w:body></w:document>`
  )
  const styles = opts.styles === undefined ? STYLES : opts.styles
  const theme = opts.theme === undefined ? THEME : opts.theme
  if (styles) zip.file('word/styles.xml', styles)
  if (theme) zip.file('word/theme/theme1.xml', theme)
  return zip.generateAsync({ type: 'nodebuffer' })
}
