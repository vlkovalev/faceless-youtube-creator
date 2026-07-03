$PSScriptRoot = "C:\Users\heliu\Desktop\WebSItes\faceless-youtube-creator-clean\The Saints\automation"
$parentRootPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Write-Output "parentRootPath: $parentRootPath"
$leaf = Split-Path -Leaf $parentRootPath
Write-Output "leaf: $leaf"
$eq = ($leaf -eq 'The Saints')
Write-Output "eq: $eq"
if ($eq) {
  Write-Output "if branch: $parentRootPath"
} else {
  Write-Output "else branch: $(Join-Path $parentRootPath 'The Saints')"
}
