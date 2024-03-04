# webp

`webp` is a command-line tool to streamline the process of converting images to the [WebP graphics file format](https://en.wikipedia.org/wiki/WebP) in a pipeline.

> [!NOTE]
> This has been developed for personal use. Features have only been implemented as and when required. If you have a specific use-case not covered by the current implementation, please open an issue or submit a pull request.

## Installation

```bash
# Install bun
curl -fsSL https://bun.sh/install | bash

# Install ffmpeg
sudo apt install ffmpeg

# Install exiftool
wget https://exiftool.org/Image-ExifTool-12.77.tar.gz
gzip -dc Image-ExifTool-12.77.tar.gz | tar -xf -
cd Image-ExifTool-12.77
perl Makefile.PL
sudo make install
rm -rf Image-ExifTool-12.77.tar.gz Image-ExifTool-12.77

# Install webp
bun install kru-webp --global
```

## Parameters

| Parameter | Description | Default | Example |
| --- | --- | --- | --- |
| `ext` | Only include files with these extensions | all files | `ext=.jpg/.png` |
| `out` | Output directory | input directory | `out=/path/to/output` |
| `lossless` | Enable lossless compression | disabled | `lossless` |
| `compression` | Compression level for lossless compression | 6 | `compression=0` |
| `quality` | Quality level for lossy compression | 75 | `quality=100` |
| `scale` | Resize the image by scale factor | 1 | `scale=0.5` |
| `width` | New image width | source width | `width=960` |
| `height` | New image height | source height | `height=540` |
| `crop` | Crop instead of resize | disabled | `crop` |
| `centerh` | Center the crop horizontally | disabled | `centerh` |
| `centerv` | Center the crop vertically | disabled | `centerv` |
| `center` | `centerh` + `centerv` | disabled | `center` |
| `verbose` | Enable verbose output | disabled | `verbose` |

## Usage

```bash
# Convert a PNG image
webp image.png

# Convert a directory of files
webp /path/to/directory

# Convert a directory of files with extension filter
webp /path/to/directory ext=.jpg/.png # jpg and png only

# Output files in a different directory
webp /path/to/directory out=/path/to/output

# Enable lossless compression (default is lossy)
webp image.png lossless

# Compression level for lossless compression (default is 6)
webp image.png compression=0 # fast but large

# Quality level for lossy compression (default is 75)
webp image.png quality=100 # best quality

# Resize the image by scale factor
webp image.png scale=0.5 # scale the image to 50%

# Specify new image dimensions (resizes the image)
webp image.png width=960 height=540
webp image.png width=960 # height is automatically calculated to maintain aspect ratio
webp image.png width=960 height=source # source height is kept

# Crop image instead of resize
webp image.png width=500 height=500 crop
webp image.png width=500 height=500 crop center # center the crop
webp image.png width=500 height=500 crop centerh # center the crop horizontally
```