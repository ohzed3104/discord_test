param(
  [string]$OutputPath = "test-cases-server-management.xlsx",
  [string]$DataPath = "data/test-cases-server-management.json"
)

$resolvedDataPath = if ([System.IO.Path]::IsPathRooted($DataPath)) {
  $DataPath
} else {
  Join-Path (Get-Location) $DataPath
}

$json = [System.IO.File]::ReadAllText($resolvedDataPath, [System.Text.Encoding]::UTF8)
$testCaseData = $json | ConvertFrom-Json

$headers = @(
  $testCaseData.headers.id,
  $testCaseData.headers.name,
  $testCaseData.headers.steps,
  $testCaseData.headers.expected
)

$rows = @()
foreach ($case in $testCaseData.cases) {
  $rows += ,@($case.id, $case.name, ($case.steps -join "`n"), $case.expected)
}

function Escape-XmlText([string]$Value) {
  return [System.Security.SecurityElement]::Escape($Value)
}

function To-ColumnName([int]$Index) {
  $name = ""
  while ($Index -gt 0) {
    $mod = ($Index - 1) % 26
    $name = [char](65 + $mod) + $name
    $Index = [math]::Floor(($Index - $mod) / 26)
  }
  return $name
}

function Write-Utf8File([string]$Path, [string]$Value) {
  [System.IO.File]::WriteAllText($Path, $Value, [System.Text.Encoding]::UTF8)
}

$resolvedOutput = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath
} else {
  Join-Path (Get-Location) $OutputPath
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("uno-xlsx-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempRoot "_rels") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempRoot "xl") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempRoot "xl\_rels") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tempRoot "xl\worksheets") | Out-Null

$sheetRows = New-Object System.Text.StringBuilder
$allRows = ,$headers + $rows
for ($r = 0; $r -lt $allRows.Count; $r++) {
  $excelRow = $r + 1
  [void]$sheetRows.Append("<row r=""$excelRow"">")
  for ($c = 0; $c -lt $allRows[$r].Count; $c++) {
    $excelCol = To-ColumnName ($c + 1)
    $cellRef = "$excelCol$excelRow"
    $style = if ($r -eq 0) { "1" } else { "2" }
    $value = Escape-XmlText ([string]$allRows[$r][$c])
    [void]$sheetRows.Append("<c r=""$cellRef"" t=""inlineStr"" s=""$style""><is><t xml:space=""preserve"">$value</t></is></c>")
  }
  [void]$sheetRows.Append("</row>")
}

$contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>
'@

$rootRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
'@

$workbook = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Test Cases" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>
'@

$workbookRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
'@

$styles = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
</styleSheet>
'@

$sheet = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>
    <col min="1" max="1" width="12" customWidth="1"/>
    <col min="2" max="2" width="42" customWidth="1"/>
    <col min="3" max="3" width="80" customWidth="1"/>
    <col min="4" max="4" width="58" customWidth="1"/>
  </cols>
  <sheetData>
    $($sheetRows.ToString())
  </sheetData>
  <autoFilter ref="A1:D$($allRows.Count)"/>
</worksheet>
"@

Write-Utf8File (Join-Path $tempRoot "[Content_Types].xml") $contentTypes
Write-Utf8File (Join-Path $tempRoot "_rels\.rels") $rootRels
Write-Utf8File (Join-Path $tempRoot "xl\workbook.xml") $workbook
Write-Utf8File (Join-Path $tempRoot "xl\_rels\workbook.xml.rels") $workbookRels
Write-Utf8File (Join-Path $tempRoot "xl\styles.xml") $styles
Write-Utf8File (Join-Path $tempRoot "xl\worksheets\sheet1.xml") $sheet

if (Test-Path $resolvedOutput) {
  Remove-Item -Path $resolvedOutput -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempRoot, $resolvedOutput)
Remove-Item -Path $tempRoot -Recurse -Force

Write-Host "Created $resolvedOutput"
