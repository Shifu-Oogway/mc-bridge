param([string]$Dir, [int]$Frames = 40, [int]$IntervalMs = 500)
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
for ($i = 0; $i -lt $Frames; $i++) {
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  # keep the central 60% (the action), half size
  $cw = [int]($b.Width * 0.6); $ch = [int]($b.Height * 0.6); $cx = [int](($b.Width - $cw) / 2); $cy = [int](($b.Height - $ch) / 2)
  $crop = $bmp.Clone((New-Object System.Drawing.Rectangle $cx, $cy, $cw, $ch), $bmp.PixelFormat)
  $small = New-Object System.Drawing.Bitmap $crop, ([int]($cw / 2)), ([int]($ch / 2))
  $small.Save((Join-Path $Dir ("f{0:D3}.png" -f $i)), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $crop.Dispose(); $small.Dispose()
  Start-Sleep -Milliseconds $IntervalMs
}
# Contact sheet: 12 evenly spaced frames, 4 x 3, each labelled with its time.
$files = Get-ChildItem $Dir -Filter "f*.png" | Sort-Object Name
$pick = 0..11 | ForEach-Object { $files[[int]($_ * ($files.Count - 1) / 11)] }
$first = [System.Drawing.Image]::FromFile($pick[0].FullName); $w = $first.Width / 2; $h = $first.Height / 2; $first.Dispose()
$sheet = New-Object System.Drawing.Bitmap ([int]($w * 4)), ([int]($h * 3)); $sg = [System.Drawing.Graphics]::FromImage($sheet)
$font = New-Object System.Drawing.Font "Arial", 14, ([System.Drawing.FontStyle]::Bold)
for ($k = 0; $k -lt 12; $k++) {
  $img = [System.Drawing.Image]::FromFile($pick[$k].FullName)
  $x = ($k % 4) * $w; $y = [math]::Floor($k / 4) * $h
  $sg.DrawImage($img, [float]$x, [float]$y, [float]$w, [float]$h)
  $t = [int]($pick[$k].BaseName.Substring(1)) * $IntervalMs / 1000.0
  $sg.FillRectangle([System.Drawing.Brushes]::Black, [float]$x, [float]$y, 70, 24); $sg.DrawString(("{0:N1}s" -f $t), $font, [System.Drawing.Brushes]::Yellow, [float]($x + 4), [float]($y + 2))
  $img.Dispose()
}
$sheet.Save((Join-Path $Dir "sheet.png"), [System.Drawing.Imaging.ImageFormat]::Png)
"frames: $($files.Count)"
